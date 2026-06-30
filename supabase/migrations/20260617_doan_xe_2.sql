-- Nhà xe thứ 2 cho đoàn (PR A — nền + chi phí). Booking xe 2 ở PR sau.
-- ALTER ADD COLUMN trên bảng có sẵn → KHÔNG cần GRANT lại (giữ grants cũ).

-- doan: xe phụ + cờ hủy riêng (mirror xe_id / xe_da_huy hiện có).
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS xe_id_2 bigint NULL REFERENCES public.nha_xe_loai_xe(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS xe_da_huy_2 boolean NOT NULL DEFAULT false;

-- doan_chi_phi: tag chi phí xe thuộc xe nào (để tách báo cáo theo từng xe).
-- NULL = chi phí xe cũ / không gắn xe cụ thể. FK loại xe; xoá loại xe → set null.
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS xe_id bigint NULL REFERENCES public.nha_xe_loai_xe(id) ON DELETE SET NULL;

-- Backfill: chi phí xe hiện có (danh_muc='xe') gắn về xe chính của đoàn (xe_id),
-- chỉ khi đoàn có đúng 1 xe (xe_id_2 vẫn NULL ở thời điểm này) để không gán nhầm.
UPDATE public.doan_chi_phi cp
SET xe_id = d.xe_id
FROM public.doan d
WHERE cp.doan_id = d.id
  AND cp.danh_muc = 'xe'
  AND cp.xe_id IS NULL
  AND d.xe_id IS NOT NULL;
