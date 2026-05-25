-- Báo giá: snapshot xe (tên + giá) thay vì FK nha_xe_loai_xe.
-- Lý do: nguồn xe chuyển sang bang_gia_dich_vu (import bảng giá tour) cho
-- nhất quán với các dịch vụ khác. Snapshot vào báo giá → re-import bảng giá
-- không ảnh hưởng báo giá cũ (match triết lý snapshot của module chi phí).

ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS xe_ten text,
  ADD COLUMN IF NOT EXISTS xe_gia numeric;

-- Backfill cho báo giá đang trỏ FK cũ — gộp "Nhà xe — Tên xe (X chỗ)"
-- để giữ nguyên label hiển thị; gia copy 1-1.
UPDATE public.bao_gia bg
SET
  xe_ten = COALESCE(nx.ten || ' — ', '') || lx.ten_xe ||
           CASE WHEN lx.so_cho IS NOT NULL THEN ' (' || lx.so_cho || ' chỗ)' ELSE '' END,
  xe_gia = lx.gia
FROM public.nha_xe_loai_xe lx
LEFT JOIN public.nha_xe nx ON nx.id = lx.nha_xe_id
WHERE bg.xe_loai_id = lx.id AND bg.xe_ten IS NULL;

ALTER TABLE public.bao_gia DROP COLUMN IF EXISTS xe_loai_id;
