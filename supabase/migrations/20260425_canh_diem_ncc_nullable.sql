-- Allow canh_diem.nha_cung_cap_id to be NULL
-- Scenic spots don't always have a linked supplier
ALTER TABLE public.canh_diem
  ALTER COLUMN nha_cung_cap_id DROP NOT NULL;
