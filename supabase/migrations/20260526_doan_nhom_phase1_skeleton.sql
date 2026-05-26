-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Skeleton "doan_nhom" (1 đoàn → N nhóm). Hiện tại mọi đoàn = 1 nhóm
-- mặc định "Toàn đoàn"; UI chưa thay đổi. Phase 2 sẽ add UI tabs nhóm.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Tạo bảng doan_nhom
CREATE TABLE public.doan_nhom (
  id BIGSERIAL PRIMARY KEY,
  doan_id BIGINT NOT NULL REFERENCES public.doan(id) ON DELETE CASCADE,
  ten_nhom TEXT NOT NULL,
  thu_tu INT NOT NULL DEFAULT 1,
  so_khach_lon INT,
  so_khach_em1 INT,
  so_khach_em2 INT,
  so_khach_tl INT,
  hdv_id BIGINT REFERENCES public.huong_dan_vien(id) ON DELETE SET NULL,
  xe_id BIGINT REFERENCES public.nha_xe_loai_xe(id) ON DELETE SET NULL,
  ghi_chu TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX doan_nhom_doan_id_idx ON public.doan_nhom (doan_id);
CREATE UNIQUE INDEX doan_nhom_doan_thutu_unique ON public.doan_nhom (doan_id, thu_tu);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doan_nhom TO authenticated, service_role;
GRANT SELECT ON public.doan_nhom TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.doan_nhom_id_seq TO authenticated, service_role;

ALTER TABLE public.doan_nhom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.doan_nhom
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Seed: mỗi đoàn → 1 nhóm "Toàn đoàn" (copy số khách từ doan)
INSERT INTO public.doan_nhom (doan_id, ten_nhom, thu_tu, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl)
SELECT id, 'Toàn đoàn', 1, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl
FROM public.doan;

-- 3) doan_ngay: thêm FK doan_nhom_id (nullable trước, backfill, rồi NOT NULL)
ALTER TABLE public.doan_ngay
  ADD COLUMN doan_nhom_id BIGINT REFERENCES public.doan_nhom(id) ON DELETE CASCADE;

-- Backfill: mỗi doan_ngay → nhóm "Toàn đoàn" (thu_tu=1) của đoàn tương ứng
UPDATE public.doan_ngay dn
SET doan_nhom_id = nh.id
FROM public.doan_nhom nh
WHERE nh.doan_id = dn.doan_id AND nh.thu_tu = 1;

-- Verify không còn NULL trước khi NOT NULL
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.doan_ngay WHERE doan_nhom_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill chưa xong: % doan_ngay có doan_nhom_id NULL', null_count;
  END IF;
END $$;

ALTER TABLE public.doan_ngay
  ALTER COLUMN doan_nhom_id SET NOT NULL;

CREATE INDEX doan_ngay_doan_nhom_id_idx ON public.doan_ngay (doan_nhom_id);

-- 4) Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION public.doan_nhom_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER doan_nhom_touch_updated_at
  BEFORE UPDATE ON public.doan_nhom
  FOR EACH ROW EXECUTE FUNCTION public.doan_nhom_touch_updated_at();
