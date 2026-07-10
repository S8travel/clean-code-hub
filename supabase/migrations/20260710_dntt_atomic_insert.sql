-- ============================================================================
-- Tạo ĐNTT NGUYÊN TỬ (dntt + allocations trong 1 transaction) + chặn duyệt phiếu rỗng
--
-- SỰ CỐ 10/07/2026 (đoàn HAN05BR260707DO):
--   `useInsertDNTT` chèn de_nghi_thanh_toan TRƯỚC, rồi mới chèn dntt_allocations,
--   KHÔNG có transaction. OP đổi nhà hàng tối ngày 5 ở Điều tour lúc 03:29 → dòng
--   chi phí 13474 bị xóa. Tab Chi phí của OP còn giữ dòng ma đó trong cache. Lúc
--   03:49 OP bấm "Gửi ĐNTT" 3 lần: mỗi lần ĐNTT được chèn xong, rồi allocation
--   vi phạm khóa ngoại (chi_phi_id=13474 không còn) → throw → ĐNTT RỖNG ở lại DB
--   (onSuccess không chạy nên cũng không có activity_log).
--   Kết quả: kế toán thấy 4 phiếu 3.850.000 giống hệt nhau cho 1 bữa ăn.
--
-- HAI TẦNG BẢO VỆ Ở ĐÂY:
--   1. create_dntt_with_allocations() — 1 transaction. Allocation lỗi → dntt rollback.
--   2. trg_chan_duyet_dntt_khong_allocation — dù phiếu rỗng lọt vào bằng đường nào
--      (client cũ, script tay), KHÔNG duyệt được → tiền không chảy ra.
--
-- ALTER/CREATE FUNCTION + TRIGGER: không cần GRANT bảng mới. RPC cần GRANT EXECUTE.
-- ============================================================================

-- ── 1. RPC nguyên tử ────────────────────────────────────────────────────────
-- SECURITY INVOKER (mặc định): giữ nguyên RLS của người gọi, không nới quyền.
CREATE OR REPLACE FUNCTION public.create_dntt_with_allocations(
  p_dntt        jsonb,
  p_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v      de_nghi_thanh_toan%ROWTYPE;
  v_id   bigint;
  v_thieu bigint[];
BEGIN
  v := jsonb_populate_record(NULL::de_nghi_thanh_toan, p_dntt);

  IF v.loai IS NULL THEN
    RAISE EXCEPTION 'Thiếu trường bắt buộc: loai';
  END IF;

  -- Kiểm tra chi phí tồn tại TRƯỚC khi chèn, để báo lỗi tiếng Việt dễ hiểu thay vì
  -- lỗi khóa ngoại thô. (Vẫn còn FK làm chốt cuối nếu có race.)
  IF jsonb_array_length(p_allocations) > 0 THEN
    SELECT array_agg(x.chi_phi_id)
      INTO v_thieu
    FROM jsonb_to_recordset(p_allocations) AS x(chi_phi_id bigint, so_tien numeric, ghi_chu text)
    WHERE NOT EXISTS (SELECT 1 FROM doan_chi_phi cp WHERE cp.id = x.chi_phi_id);

    IF v_thieu IS NOT NULL THEN
      RAISE EXCEPTION
        'Dòng chi phí % không còn tồn tại — có thể đã bị xóa khi sửa Điều tour. Hãy tải lại trang rồi tạo ĐNTT lại.',
        array_to_string(v_thieu, ', ');
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_allocations) AS x(chi_phi_id bigint, so_tien numeric, ghi_chu text)
      WHERE x.so_tien IS NULL OR x.so_tien <= 0
    ) THEN
      RAISE EXCEPTION 'Phân bổ ĐNTT phải có số tiền > 0';
    END IF;
  END IF;

  -- Cột có DEFAULT: coalesce để caller bỏ trống vẫn ra đúng giá trị mặc định
  -- (jsonb_populate_record điền NULL cho key vắng mặt, sẽ ghi đè DEFAULT).
  INSERT INTO de_nghi_thanh_toan (
    doan_id, loai, mo_ta, nha_cung_cap_id, ten_nha_cung_cap, so_tai_khoan, ngan_hang,
    so_tien, tao_boi, tao_luc, ghi_chu, ref_loai, ref_id, trang_thai_duyet,
    la_coc, ty_le_coc, ngay_can_thanh_toan, hoa_don_url, unc_url,
    trang_thai_hoa_don, trang_thai_unc, hoa_don_so_tien, quyet_toan_data,
    loai_chi_hoan_ung, nguoi_ung_id, hoan_ung_items
  ) VALUES (
    v.doan_id, v.loai, v.mo_ta, v.nha_cung_cap_id, v.ten_nha_cung_cap, v.so_tai_khoan, v.ngan_hang,
    coalesce(v.so_tien, 0), v.tao_boi, coalesce(v.tao_luc, now()), v.ghi_chu, v.ref_loai, v.ref_id,
    coalesce(v.trang_thai_duyet, 'cho_duyet'),
    coalesce(v.la_coc, false), v.ty_le_coc, v.ngay_can_thanh_toan, v.hoa_don_url, v.unc_url,
    coalesce(v.trang_thai_hoa_don, 'chua_co'), coalesce(v.trang_thai_unc, 'chua_co'),
    v.hoa_don_so_tien, v.quyet_toan_data,
    v.loai_chi_hoan_ung, v.nguoi_ung_id, v.hoan_ung_items
  )
  RETURNING id INTO v_id;

  IF jsonb_array_length(p_allocations) > 0 THEN
    INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien, ghi_chu)
    SELECT v_id, x.chi_phi_id, x.so_tien, x.ghi_chu
    FROM jsonb_to_recordset(p_allocations) AS x(chi_phi_id bigint, so_tien numeric, ghi_chu text);
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dntt_with_allocations(jsonb, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_dntt_with_allocations(jsonb, jsonb) IS
  'Tạo ĐNTT + allocations trong 1 transaction. Allocation lỗi → rollback cả ĐNTT '
  '(chống phiếu rỗng, sự cố 10/07/2026 đoàn HAN05BR260707DO).';


-- ── 2. Trigger: cấm duyệt ĐNTT gắn chi phí mà không có allocation ────────────
-- Phiếu "rỗng" = ref trỏ vào chi phí đoàn nhưng 0 dòng phân bổ. Duyệt & chi phiếu
-- này thì recalc_chi_phi_payment_status KHÔNG thấy allocation nào → dòng chi phí
-- vẫn báo "chưa trả" → có người đề nghị lần nữa → TRẢ TIỀN HAI LẦN.
-- (hoan_ung / hdv / dinh_ky có ref_loai khác → không đụng tới.)
CREATE OR REPLACE FUNCTION public.chan_duyet_dntt_khong_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.trang_thai_duyet = 'da_duyet'
     AND OLD.trang_thai_duyet IS DISTINCT FROM 'da_duyet'
     AND NEW.ref_loai IN ('doan_chi_phi', 'khach_san')
     AND NOT EXISTS (SELECT 1 FROM dntt_allocations a WHERE a.dntt_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'ĐNTT #% không gắn với dòng chi phí nào (phiếu rỗng) — không thể duyệt. Hủy phiếu này và tạo lại từ tab Chi phí.',
      NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- CỐ Ý dùng `BEFORE UPDATE` trần, KHÔNG phải `BEFORE UPDATE OF trang_thai_duyet`:
-- mệnh đề `OF <cột>` chỉ nổ khi câu UPDATE có LIỆT KÊ cột đó. Một trigger BEFORE khác
-- (hoặc script tay) gán NEW.trang_thai_duyet mà statement không nhắc tên cột thì chốt
-- chặn này sẽ hụt. Chi phí gần như bằng 0: điều kiện đầu short-circuit ngay.
DROP TRIGGER IF EXISTS trg_chan_duyet_dntt_khong_allocation ON public.de_nghi_thanh_toan;
CREATE TRIGGER trg_chan_duyet_dntt_khong_allocation
  BEFORE UPDATE ON public.de_nghi_thanh_toan
  FOR EACH ROW
  EXECUTE FUNCTION public.chan_duyet_dntt_khong_allocation();


-- ── 3. View + alloc_count để UI gắn cờ phiếu rỗng TRƯỚC khi kế toán bấm duyệt ──
-- Thêm cột (additive) — mọi chỗ đang SELECT cột cũ không bị ảnh hưởng.
-- Giữ security_invoker=on như bản cũ (20260601_security_harden_views_invoker.sql).
CREATE OR REPLACE VIEW public.dntt_with_payment_status
WITH (security_invoker = on) AS
 SELECT d.id, d.doan_id, d.loai, d.mo_ta, d.nha_cung_cap_id, d.ten_nha_cung_cap,
    d.so_tai_khoan, d.ngan_hang, d.so_tien, d.tao_boi, d.tao_luc, d.duyet_boi,
    d.duyet_luc, d.ghi_chu, d.ref_loai, d.ref_id, d.created_at, d.trang_thai_duyet,
    d.la_coc, d.ty_le_coc, d.ngay_can_thanh_toan, d.hoa_don_url, d.unc_url,
    d.trang_thai_hoa_don, d.trang_thai_unc, d.loai_chi_hoan_ung, d.hoan_ung_items,
    d.nguoi_ung_id,
    COALESCE(p.paid_amount, 0::numeric) AS paid_amount,
        CASE
            WHEN COALESCE(p.paid_amount, 0::numeric) = 0::numeric THEN 'unpaid'::text
            WHEN COALESCE(p.paid_amount, 0::numeric) >= d.so_tien THEN 'paid'::text
            ELSE 'partial'::text
        END AS payment_status,
    p.last_payment_at AS thanh_toan_luc,
    d.quyet_toan_data, d.tp_dh_duyet_boi, d.tp_dh_duyet_luc, d.kttt_duyet_boi,
    d.kttt_duyet_luc, d.ktt_duyet_boi, d.ktt_duyet_luc, d.tu_choi_boi, d.tu_choi_luc,
    d.tu_choi_cap, d.huy_boi, d.huy_luc, d.hoa_don_so_tien,
    COALESCE(a.alloc_count, 0::bigint) AS alloc_count
   FROM de_nghi_thanh_toan d
     LEFT JOIN ( SELECT payments.dntt_id,
            sum(payments.so_tien) AS paid_amount,
            max(payments.ngay_thanh_toan) AS last_payment_at
           FROM payments
          GROUP BY payments.dntt_id) p ON p.dntt_id = d.id
     LEFT JOIN ( SELECT dntt_allocations.dntt_id,
            count(*) AS alloc_count
           FROM dntt_allocations
          GROUP BY dntt_allocations.dntt_id) a ON a.dntt_id = d.id;

GRANT SELECT ON public.dntt_with_payment_status TO authenticated, service_role;
