-- Quỹ trả trước NCC: tái dùng cong_no + can_tru (drawdown đã có sẵn).
-- 1) cong_no.loai: phân biệt 'phat_sinh' (chi thừa/hủy — mặc định) vs 'tra_truoc'
-- 2) nha_cung_cap.tra_truoc: cờ NCC theo mô hình trả trước → UI tự gợi ý cấn trừ
-- 3) cong_no_with_status: view dùng danh sách cột tường minh (KHÔNG c.*) →
--    phải REPLACE thêm passthrough c.loai (append ở CUỐI, giữ thứ tự cột cũ).
-- Toàn bộ là ALTER TABLE / REPLACE VIEW → bảng+view giữ grants cũ; vẫn re-grant
-- view cho chắc (idempotent).

ALTER TABLE public.cong_no
  ADD COLUMN IF NOT EXISTS loai text NOT NULL DEFAULT 'phat_sinh';

ALTER TABLE public.nha_cung_cap
  ADD COLUMN IF NOT EXISTS tra_truoc boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.cong_no_with_status AS
 SELECT c.id,
    c.doan_id,
    c.dntt_goc_id,
    c.nha_cung_cap_id,
    c.ten_nha_cung_cap,
    c.so_tien_goc,
    c.trang_thai,
    c.ly_do,
    c.ngay_tao,
    c.ghi_chu,
    c.created_at,
    COALESCE(used.so_tien_da_dung, 0::numeric) AS so_tien_da_dung,
    c.so_tien_goc - COALESCE(used.so_tien_da_dung, 0::numeric) AS so_tien_con_lai,
    c.loai
   FROM cong_no c
     LEFT JOIN ( SELECT payments.cong_no_id,
            sum(payments.so_tien) AS so_tien_da_dung
           FROM payments
          WHERE payments.method = 'can_tru'::text
          GROUP BY payments.cong_no_id) used ON used.cong_no_id = c.id;

GRANT SELECT ON public.cong_no_with_status TO anon, authenticated, service_role;
