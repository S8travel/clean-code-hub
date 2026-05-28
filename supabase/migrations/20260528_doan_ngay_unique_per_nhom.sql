-- Phase 1 đã add doan_nhom_id vào doan_ngay nhưng QUÊN update UNIQUE constraint.
-- UNIQUE (doan_id, ngay_so) cũ chặn 2 nhóm cùng ngay_so → save nhóm 2 fail,
-- apply seri fail. Thay bằng UNIQUE (doan_id, doan_nhom_id, ngay_so) — mỗi
-- nhóm có lịch trình riêng nhưng không trùng ngày trong cùng nhóm.

ALTER TABLE public.doan_ngay
  DROP CONSTRAINT IF EXISTS doan_ngay_doan_id_ngay_so_key,
  DROP CONSTRAINT IF EXISTS doan_ngay_unique;

ALTER TABLE public.doan_ngay
  ADD CONSTRAINT doan_ngay_doan_nhom_ngay_so_key
    UNIQUE (doan_id, doan_nhom_id, ngay_so);
