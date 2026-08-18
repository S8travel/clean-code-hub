-- 外網 — ba tab mới trong màn đoàn của cổng đối tác. Phần thuộc project CRM.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
--   1) build_portal_ks_xac_nhan  — dựng 飯店確認單 từ booking KS đã FINAL.
--   2) doan_trao_doi             — luồng hỏi/đáp giữa S8 và đối tác (CRM là bản gốc).
--   3) doan_tai_lieu.portal_enabled — cờ chia sẻ từng file cho đối tác.
--
-- Tài liệu KHÔNG cần bảng mới bên này: đã có doan_tai_lieu. push-portal chép file
-- sang kho riêng của cổng.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Cờ chia sẻ tài liệu
-- ───────────────────────────────────────────────────────────────────────────
-- NULL = theo mặc định của loại: hợp đồng + danh sách khách chia sẻ, còn lại thì
-- không. true/false = OP ép tay.
--
-- Vì sao không mặc định chia sẻ hết: 'khac' là ngăn tự do, OP vẫn ném vào đó thứ
-- nội bộ (bản nháp, ảnh chụp mail). Mặc định chia sẻ ngăn đó là mở cửa cho rò rỉ
-- mà không ai chủ động làm gì sai.
ALTER TABLE public.doan_tai_lieu
  ADD COLUMN IF NOT EXISTS portal_enabled boolean;

COMMENT ON COLUMN public.doan_tai_lieu.portal_enabled IS
  'Chia sẻ file này cho đối tác trên cổng 外網. NULL = theo mặc định của loại (hop_dong/danh_sach_khach = có).';

-- ───────────────────────────────────────────────────────────────────────────
-- 1) build_portal_ks_xac_nhan — 飯店確認單
-- ───────────────────────────────────────────────────────────────────────────
-- CHỈ khách sạn đã FINAL (ks_final_status = 'ks_xac_nhan_final') và chưa hủy.
--
-- Vì sao không đẩy khách sạn còn đang chờ: đối tác nhìn thấy dòng "chờ xác nhận"
-- là gọi thẳng khách sạn hỏi — đúng thứ đã cố tránh khi dựng cổng (khảo sát
-- 13/08). Chưa FINAL thì tab để trống, chương trình từng ngày vẫn có tên KS.
--
-- KHÔNG đọc doan_ks_dem: bảng đó RỖNG toàn bộ DB (đo 18/08/2026), dữ liệu
-- phòng thật nằm ở ô ks_final/ks_dat_truoc của booking. Tên trường cũng
-- tránh mọi khoá bị CHECK khong_co_gia_von() bên cổng chặn (don_gia, foc,
-- dat_truoc, booking_status...).
CREATE OR REPLACE FUNCTION public.build_portal_ks_xac_nhan(p_doan_ids bigint[])
RETURNS TABLE (doan_id bigint, noi_dung jsonb)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH da_final AS (
    SELECT b.id AS booking_id,
           b.doan_id,
           b.khach_san_id,
           portal_lam_sach_ten(coalesce(NULLIF(k.ten_zh, ''), k.ten)) AS ten,
           coalesce(NULLIF(k.dia_diem_zh, ''), k.dia_diem) AS dia_diem,
           k.dia_chi,
           k.so_dien_thoai,
           -- Nguồn phòng GIỐNG HỆT bản Word 訂房確認單: ks_final, chưa có thì rơi
           -- về ks_dat_truoc (xem getPreferredRoomInfoForDate).
           replace(coalesce(NULLIF(b.ks_final, ''), b.ks_dat_truoc, ''), chr(13), '') AS phong_text
    FROM doan_booking_ks b
    JOIN khach_san k ON k.id = b.khach_san_id
    WHERE b.doan_id = ANY(p_doan_ids)
      AND b.ks_final_status = 'ks_xac_nhan_final'
      AND coalesce(b.trang_thai, '') <> 'ks_huy'
  ),
  -- Đêm ở = ngày trong điều tour có gán đúng khách sạn này.
  dem AS (
    SELECT booking_id, ngay_date,
           row_number() OVER (PARTITION BY booking_id ORDER BY ngay_date) AS thu_tu
    FROM (
      SELECT DISTINCT f.booking_id, dn.ngay_date
      FROM da_final f
      JOIN doan_ngay dn
        ON dn.doan_id = f.doan_id AND dn.khach_san_id = f.khach_san_id
      WHERE dn.ngay_date IS NOT NULL
    ) x
  ),
  -- Ô phòng là TEXT NHIỀU DÒNG, mỗi dòng một đêm. Một dòng = dùng chung cho mọi
  -- đêm (đúng luật expandRoomValues bên client, đừng đổi lệch đi).
  dong AS (
    SELECT f.booking_id,
           (SELECT array_agg(btrim(u.l) ORDER BY u.i)
            FROM unnest(string_to_array(f.phong_text, chr(10))) WITH ORDINALITY AS u(l, i)) AS cac_dong
    FROM da_final f
  ),
  gom AS (
    SELECT f.doan_id,
           min(d.ngay_date) AS tu,
           f.ten,
           jsonb_build_object(
             'ten',        f.ten,
             'dia_diem',   f.dia_diem,
             'dia_chi',    f.dia_chi,
             'dien_thoai', f.so_dien_thoai,
             'ma_code',    m.ma_code,
             'nhan_phong', min(d.ngay_date),
             -- Đêm cuối là ngày nhận phòng cuối cùng → trả phòng là hôm sau.
             'tra_phong',  max(d.ngay_date) + 1,
             'dem', jsonb_agg(
                      jsonb_build_object(
                        'ngay',  d.ngay_date,
                        'phong', CASE
                                   WHEN coalesce(cardinality(g.cac_dong), 0) <= 1
                                     THEN coalesce(g.cac_dong[1], '')
                                   ELSE coalesce(g.cac_dong[d.thu_tu], '')
                                 END
                      ) ORDER BY d.ngay_date
                    )
           ) AS ks
    FROM da_final f
    -- INNER JOIN: booking còn treo mà khách sạn đã bị gỡ khỏi điều tour thì không
    -- còn đêm nào, đưa lên bản xác nhận chỉ làm đối tác tưởng vẫn ở đó.
    JOIN dem d ON d.booking_id = f.booking_id
    LEFT JOIN dong g ON g.booking_id = f.booking_id
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT NULLIF(btrim(dn.ks_ma_code), ''), ', ') AS ma_code
      FROM doan_ngay dn
      WHERE dn.doan_id = f.doan_id AND dn.khach_san_id = f.khach_san_id
    ) m ON true
    GROUP BY f.doan_id, f.ten, f.dia_diem, f.dia_chi, f.so_dien_thoai, m.ma_code, g.cac_dong
  )
  SELECT d.id,
         jsonb_build_object(
           'version', 1,
           'khach_san', coalesce(
             (SELECT jsonb_agg(g.ks ORDER BY g.tu, g.ten) FROM gom g WHERE g.doan_id = d.id),
             '[]'::jsonb
           )
         )
  FROM doan d
  WHERE d.id = ANY(p_doan_ids);
$$;

GRANT EXECUTE ON FUNCTION public.build_portal_ks_xac_nhan(bigint[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) doan_trao_doi — hỏi/đáp giữa S8 và đối tác
-- ───────────────────────────────────────────────────────────────────────────
-- MỘT DÒNG = MỘT LƯỢT HỎI + LƯỢT ĐÁP của nó. Không tách thành hai dòng riêng vì
-- yêu cầu nghiệp vụ là nhìn một dòng thấy ngay "gửi lúc nào, trả lời lúc nào" —
-- tách ra thì phải ghép lại khi hiển thị và dễ đếm sai thời gian chờ.
--
-- Bên nào cũng mở lượt được (ben_gui), bên kia trả lời vào chính dòng đó.
-- CRM là bản gốc; cổng giữ một bản sao để đối tác đọc offline khỏi CRM.
CREATE TABLE IF NOT EXISTS public.doan_trao_doi (
  id            bigserial PRIMARY KEY,
  doan_id       bigint NOT NULL REFERENCES public.doan(id) ON DELETE CASCADE,
  agent_id      bigint REFERENCES public.agents(id),
  ben_gui       text NOT NULL CHECK (ben_gui IN ('doi_tac', 's8')),
  nguoi_gui     text,
  noi_dung      text NOT NULL,
  gui_luc       timestamptz NOT NULL DEFAULT now(),
  tra_loi       text,
  nguoi_tra_loi text,
  tra_loi_boi   uuid,
  tra_loi_luc   timestamptz,
  /** id của chính dòng này bên cổng — có khi lượt hỏi do đối tác mở. */
  portal_id     bigint,
  tao_luc       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doan_trao_doi_doan ON public.doan_trao_doi (doan_id, gui_luc DESC);
-- Lọc nhanh "đối tác đang chờ trả lời" cho chuông thông báo + trang tổng hợp.
CREATE INDEX IF NOT EXISTS idx_doan_trao_doi_cho_tra_loi
  ON public.doan_trao_doi (gui_luc DESC)
  WHERE ben_gui = 'doi_tac' AND tra_loi IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doan_trao_doi TO authenticated, service_role;
GRANT SELECT ON public.doan_trao_doi TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.doan_trao_doi_id_seq TO authenticated, service_role;

ALTER TABLE public.doan_trao_doi ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON public.doan_trao_doi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tài khoản chỉ xem: migration 20260728_tai_khoan_chi_xem quét MỘT LẦN các bảng
-- có sẵn lúc đó, bảng tạo sau phải tự khoá ghi.
CREATE POLICY chi_xem_block_insert ON public.doan_trao_doi AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_update ON public.doan_trao_doi AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_delete ON public.doan_trao_doi AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));

COMMENT ON TABLE public.doan_trao_doi IS
  'Hỏi/đáp giữa S8 và đối tác trên cổng 外網. 1 dòng = 1 lượt hỏi + lượt đáp của nó.';
