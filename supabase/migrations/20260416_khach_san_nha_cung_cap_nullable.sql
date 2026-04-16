-- Allow khach_san.nha_cung_cap_id to be NULL
-- Hotels may not always have a linked supplier
ALTER TABLE public.khach_san
  ALTER COLUMN nha_cung_cap_id DROP NOT NULL;
