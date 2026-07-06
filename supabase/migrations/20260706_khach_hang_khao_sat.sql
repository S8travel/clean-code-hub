-- Khảo sát khách hàng (意見調查表) — số hóa phiếu giấy Đài Loan qua QR code.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Mô hình khớp phiếu THẬT (định dạng Đài Loan): 7 tiêu chí sao (客服/行程/餐點/住宿/
-- 巴士/領隊/導遊) + 下次旅程 + 旅遊建議 + 營業據點 (single) + 獲得資訊 (multi) +
-- 購買因素 (multi).
--
-- Quyết định kiến trúc:
--  * Bảng KHÔNG có policy INSERT cho anon. Khách submit CHỈ qua RPC
--    create_khao_sat_from_form (SECURITY DEFINER, có validate + rate-limit) —
--    lặp lại đúng pattern create_lead_from_form (bài học 5 lỗ hổng public insert).
--  * QR nhúng doan.id (KHÔNG phải ten_doan — ten_doan không unique). Form public
--    lấy info pre-fill qua RPC get_khao_sat_doan_info (anon không đọc được doan do RLS VP).
--  * Snapshot ma_doan / HDV / trưởng đoàn tại thời điểm submit (đổi tên/đổi HDV sau
--    không làm sai response cũ) — theo rule snapshot bắt buộc.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bảng khach_hang_khao_sat
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.khach_hang_khao_sat (
  id                bigserial PRIMARY KEY,
  doan_id           bigint REFERENCES public.doan(id) ON DELETE SET NULL,
  ma_doan_snapshot  text,

  -- Thông tin khách (tất cả optional — khách lười, không ép)
  ten_khach         text,
  gioi_tinh         text,              -- 'nam' | 'nu' | null
  tuoi_range        text,              -- '18-34' | '35-49' | '50+' | null
  nghe_nghiep       text,
  so_dien_thoai     text,
  email             text,
  ngon_ngu          text,              -- 'zh-TW' | 'zh-CN' | 'en' | 'vi'

  -- 7 tiêu chí đánh giá 1-5 (1=rất không hài lòng, 5=rất hài lòng). CHECK ở RPC.
  dg_khach_hang             smallint,  -- 客服評價 (customer service)
  dg_lich_trinh             smallint,  -- 行程評價 (itinerary)
  dg_am_thuc                smallint,  -- 餐點評價 (meals)
  dg_luu_tru                smallint,  -- 住宿評價 (accommodation)
  dg_xe                     smallint,  -- 巴士評價 (bus)
  dg_truong_doan            smallint,  -- 領隊評價 (tour leader)
  dg_huong_dan_vien         smallint,  -- 導遊評價 (guide)

  next_trip         text,              -- 下次旅程 (free text)
  y_kien_khac       text,              -- 旅遊建議 (free text; giữ tên cột, chỉ đổi nhãn)

  diem_ban          text,              -- 營業據點 (single-select, lưu CODE)
  nguon_thong_tin   text[],            -- 獲得資訊 (multi-select, mảng CODE)
  yeu_to_mua        text[],            -- 購買因素 (multi-select, mảng CODE)

  -- Snapshot phòng đổi HDV / đổi tên đoàn sau
  hdv_ten_snapshot          text,
  truong_doan_ten_snapshot  text,

  ip_hash           text,              -- RESERVED: chỉ set server-side (edge fn hash x-forwarded-for). KHÔNG nhận từ client.
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_khao_sat_doan_id ON public.khach_hang_khao_sat (doan_id);
CREATE INDEX IF NOT EXISTS idx_khao_sat_created ON public.khach_hang_khao_sat (created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.khach_hang_khao_sat TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.khach_hang_khao_sat_id_seq TO authenticated, service_role;

ALTER TABLE public.khach_hang_khao_sat ENABLE ROW LEVEL SECURITY;

-- ĐỌC/sửa/xóa: CHỈ khảo sát của đoàn mà người dùng được phép thấy (scope theo VP).
-- `doan_id IN (SELECT id FROM doan)` chạy dưới RLS của bảng doan → chỉ khớp đoàn trong
-- scope người gọi (admin/kế toán thấy toàn bộ, OP chỉ VP của mình). Tránh 1 OP đọc PII
-- khách (tên/SĐT/email/góp ý) của đoàn VP khác qua bảng hoặc view summary.
-- Anon KHÔNG có policy → chỉ ghi được qua RPC SECURITY DEFINER (bypass RLS).
DROP POLICY IF EXISTS khao_sat_auth_read ON public.khach_hang_khao_sat;
CREATE POLICY khao_sat_auth_read ON public.khach_hang_khao_sat
  FOR ALL TO authenticated
  USING (doan_id IN (SELECT d.id FROM public.doan d))
  WITH CHECK (doan_id IN (SELECT d.id FROM public.doan d));

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC get_khao_sat_doan_info — pre-fill form public (anon không đọc doan).
--    Trả về info tối thiểu + hợp lệ để điền (đang chạy / mới kết thúc ≤ 45 ngày).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_khao_sat_doan_info(p_doan_id bigint)
RETURNS TABLE (
  doan_id      bigint,
  ma_doan      text,
  hdv_ten      text,
  truong_doan  text,
  hop_le       boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id,
         d.ten_doan,
         NULLIF(trim(concat_ws(' / ',
           (SELECT h.ten FROM huong_dan_vien h WHERE h.id = d.huong_dan_vien_id),
           (SELECT h.ten FROM huong_dan_vien h WHERE h.id = d.huong_dan_vien_id_2)
         )), ''),
         d.truong_doan,
         true AS hop_le
  FROM doan d
  WHERE d.id = p_doan_id
    -- CHỈ lộ tên HDV/trưởng đoàn/mã đoàn trong cửa sổ khảo sát: đoàn ĐÃ khởi hành
    -- (ngay_di <= hôm nay) VÀ kết thúc ≤ 45 ngày. Ngoài cửa sổ / chưa đi / không tồn
    -- tại → 0 row (frontend hiện "link không hợp lệ"). Chặn anon enumerate id tuần tự
    -- thu hoạch tên nhân sự/mã đoàn (kể cả đoàn TƯƠNG LAI) xuyên scope văn phòng.
    AND d.ngay_di <= current_date
    AND d.ngay_ve >= current_date - interval '45 days';
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_khao_sat_doan_info(bigint) TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC create_khao_sat_from_form — insert an toàn từ form public.
--    Validate đoàn tồn tại + trong cửa sổ 45 ngày. Validate 7 điểm 1-5.
--    Rate-limit: 1 submit / (đoàn + SĐT) / phút + burst 40 / đoàn / phút.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_khao_sat_from_form(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_doan_id  bigint;
  v_ma_doan  text;
  v_hdv      text;
  v_truong   text;
  v_sdt      text;
  v_id       bigint;
  v_key      text;
  v_val      int;
  v_nguon    text[];
  v_yeuto    text[];
BEGIN
  v_doan_id := NULLIF(payload->>'doan_id', '')::bigint;
  IF v_doan_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã đoàn';
  END IF;

  -- Validate đoàn tồn tại + trong cửa sổ khảo sát (mới kết thúc ≤ 45 ngày).
  -- KHÔNG lọc trang_thai: khảo sát điền lúc kết thúc, đoàn có thể đã đổi trạng thái.
  SELECT d.id,
         d.ten_doan,
         NULLIF(trim(concat_ws(' / ',
           (SELECT h.ten FROM huong_dan_vien h WHERE h.id = d.huong_dan_vien_id),
           (SELECT h.ten FROM huong_dan_vien h WHERE h.id = d.huong_dan_vien_id_2)
         )), ''),
         d.truong_doan
    INTO v_doan_id, v_ma_doan, v_hdv, v_truong
  FROM doan d
  WHERE d.id = v_doan_id
    AND d.ngay_di <= current_date
    AND d.ngay_ve >= current_date - interval '45 days';

  IF v_doan_id IS NULL THEN
    RAISE EXCEPTION 'Mã đoàn không hợp lệ hoặc đã quá hạn khảo sát';
  END IF;

  -- Validate điểm 1-5 (bỏ qua null). Duyệt các key dg_*.
  FOR v_key IN
    SELECT k FROM jsonb_object_keys(payload) k WHERE k LIKE 'dg_%'
  LOOP
    IF payload->>v_key IS NOT NULL AND payload->>v_key <> '' THEN
      v_val := (payload->>v_key)::int;
      IF v_val < 1 OR v_val > 5 THEN
        RAISE EXCEPTION 'Điểm đánh giá phải từ 1 đến 5 (%: %)', v_key, v_val;
      END IF;
    END IF;
  END LOOP;

  v_sdt := NULLIF(trim(payload->>'so_dien_thoai'), '');

  -- Rate-limit 1: chống double-submit — 1 submit / (đoàn + SĐT) / phút khi CÓ SĐT.
  IF v_sdt IS NOT NULL AND EXISTS (
    SELECT 1 FROM khach_hang_khao_sat
    WHERE doan_id = v_doan_id
      AND so_dien_thoai = v_sdt
      AND created_at > now() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Vui lòng đợi 1 phút trước khi gửi lại';
  END IF;

  -- Rate-limit 2: chống flood khi KHÔNG có SĐT (SĐT optional + client tự nhập →
  -- attacker bỏ trống để né rate-limit 1). Giới hạn burst / đoàn / phút. Ngưỡng 40
  -- đủ rộng cho cả đoàn (~40 khách) điền cùng lúc, nhưng chặn bot flood 1 doan_id.
  IF (
    SELECT count(*) FROM khach_hang_khao_sat
    WHERE doan_id = v_doan_id
      AND created_at > now() - interval '1 minute'
  ) >= 40 THEN
    RAISE EXCEPTION 'Hệ thống đang nhận quá nhiều phản hồi, vui lòng thử lại sau ít phút';
  END IF;

  -- Mảng multi-select: nhận JSON array, cắt mỗi phần tử 40 ký tự, giới hạn ≤ 12 phần tử.
  v_nguon := (
    SELECT array_agg(left(x, 40))
    FROM (
      SELECT x FROM jsonb_array_elements_text(
        coalesce(payload->'nguon_thong_tin', '[]'::jsonb)
      ) x
      LIMIT 12
    ) t
  );
  v_yeuto := (
    SELECT array_agg(left(x, 40))
    FROM (
      SELECT x FROM jsonb_array_elements_text(
        coalesce(payload->'yeu_to_mua', '[]'::jsonb)
      ) x
      LIMIT 12
    ) t
  );

  INSERT INTO khach_hang_khao_sat (
    doan_id, ma_doan_snapshot,
    ten_khach, gioi_tinh, tuoi_range, nghe_nghiep, so_dien_thoai, email, ngon_ngu,
    dg_khach_hang, dg_lich_trinh, dg_am_thuc, dg_luu_tru, dg_xe, dg_truong_doan, dg_huong_dan_vien,
    next_trip, y_kien_khac, diem_ban, nguon_thong_tin, yeu_to_mua,
    hdv_ten_snapshot, truong_doan_ten_snapshot, ip_hash
  ) VALUES (
    v_doan_id, v_ma_doan,
    -- left(): chặn bơm text nhiều MB gây phình DB qua endpoint public không captcha.
    left(NULLIF(trim(payload->>'ten_khach'), ''), 200),
    left(NULLIF(trim(payload->>'gioi_tinh'), ''), 10),
    left(NULLIF(trim(payload->>'tuoi_range'), ''), 10),
    left(NULLIF(trim(payload->>'nghe_nghiep'), ''), 200),
    left(v_sdt, 50),
    left(NULLIF(trim(payload->>'email'), ''), 200),
    left(NULLIF(trim(payload->>'ngon_ngu'), ''), 10),
    NULLIF(payload->>'dg_khach_hang', '')::smallint,
    NULLIF(payload->>'dg_lich_trinh', '')::smallint,
    NULLIF(payload->>'dg_am_thuc', '')::smallint,
    NULLIF(payload->>'dg_luu_tru', '')::smallint,
    NULLIF(payload->>'dg_xe', '')::smallint,
    NULLIF(payload->>'dg_truong_doan', '')::smallint,
    NULLIF(payload->>'dg_huong_dan_vien', '')::smallint,
    left(NULLIF(trim(payload->>'next_trip'), ''), 500),
    left(NULLIF(trim(payload->>'y_kien_khac'), ''), 2000),
    left(NULLIF(trim(payload->>'diem_ban'), ''), 20),
    v_nguon,
    v_yeuto,
    v_hdv, v_truong,
    NULL   -- ip_hash: KHÔNG nhận từ client (giả mạo được). Chỉ set server-side qua edge fn nếu cần.
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_khao_sat_from_form(jsonb) TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) View tổng hợp per đoàn — trung bình 7 tiêu chí + điểm chung + số response.
--    security_invoker → tôn trọng RLS người gọi.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.khao_sat_summary_per_doan
WITH (security_invoker = true) AS
SELECT
  doan_id,
  count(*)                                          AS so_response,
  -- so_thap_diem: số response có BẤT KỲ tiêu chí nào <= 2.
  count(*) FILTER (WHERE
       dg_khach_hang     <= 2 OR dg_lich_trinh <= 2 OR dg_am_thuc      <= 2
    OR dg_luu_tru        <= 2 OR dg_xe         <= 2 OR dg_truong_doan  <= 2
    OR dg_huong_dan_vien <= 2
  )                                                 AS so_thap_diem,
  round(avg(dg_khach_hang)::numeric, 2)             AS tb_khach_hang,
  round(avg(dg_lich_trinh)::numeric, 2)             AS tb_lich_trinh,
  round(avg(dg_am_thuc)::numeric, 2)                AS tb_am_thuc,
  round(avg(dg_luu_tru)::numeric, 2)                AS tb_luu_tru,
  round(avg(dg_xe)::numeric, 2)                     AS tb_xe,
  round(avg(dg_truong_doan)::numeric, 2)            AS tb_truong_doan,
  round(avg(dg_huong_dan_vien)::numeric, 2)         AS tb_huong_dan_vien,
  -- tb_chung: TB của các "điểm TB mỗi phản hồi" (mean of per-response averages) —
  -- khớp 平均分數 trên phiếu thật + computeKhaoSatAverages.tbChung ở client (màn 2).
  round(avg((
    coalesce(dg_khach_hang,0) + coalesce(dg_lich_trinh,0) + coalesce(dg_am_thuc,0)
    + coalesce(dg_luu_tru,0) + coalesce(dg_xe,0) + coalesce(dg_truong_doan,0)
    + coalesce(dg_huong_dan_vien,0)
  )::numeric / NULLIF((
    (dg_khach_hang IS NOT NULL)::int + (dg_lich_trinh IS NOT NULL)::int
    + (dg_am_thuc IS NOT NULL)::int + (dg_luu_tru IS NOT NULL)::int
    + (dg_xe IS NOT NULL)::int + (dg_truong_doan IS NOT NULL)::int
    + (dg_huong_dan_vien IS NOT NULL)::int
  ), 0)), 2)                                        AS tb_chung
FROM public.khach_hang_khao_sat
WHERE doan_id IS NOT NULL
GROUP BY doan_id;
GRANT SELECT ON public.khao_sat_summary_per_doan TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) View khao_sat_overview — MÀN 1 (tổng hợp toàn hệ thống theo đoàn).
--    security_invoker → tôn trọng RLS scope văn phòng của doan. Đoàn 0 phản hồi
--    vẫn hiện (so_response=0, tb_chung=NULL) nhờ LEFT JOIN.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.khao_sat_overview
WITH (security_invoker = true) AS
SELECT
  d.id                              AS doan_id,
  d.ngay_di,
  d.ngay_ve,
  d.ten_doan,
  dd.ten                            AS team_name,
  ur.ho_ten                         AS op_name,
  d.so_khach,
  coalesce(s.so_response, 0)        AS so_response,
  coalesce(s.so_thap_diem, 0)       AS so_thap_diem,
  s.tb_chung
FROM public.doan d
  LEFT JOIN public.dia_diem dd  ON dd.id = d.dia_diem_id
  LEFT JOIN public.user_roles ur ON ur.user_id = d.assigned_to
  LEFT JOIN public.khao_sat_summary_per_doan s ON s.doan_id = d.id;
GRANT SELECT ON public.khao_sat_overview TO authenticated, service_role;
