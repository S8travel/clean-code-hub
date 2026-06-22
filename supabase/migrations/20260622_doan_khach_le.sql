-- Đoàn ghép / trọn gói + roster khách lẻ (thu tiền per khách)
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.

-- 1) Trục phân loại GOM khách (KHÁC loai_tour): 'tron_goi' | 'ghep' | NULL
ALTER TABLE public.doan ADD COLUMN IF NOT EXISTS kieu_gom text;

-- 2) Roster khách lẻ cho đoàn ghép. Mỗi row = 1 booking khách lẻ (1 khách/nhóm nhỏ)
--    + theo dõi thu tiền per khách. Số khách đoàn = tổng roster (sync ở tầng app).
CREATE TABLE IF NOT EXISTS public.doan_khach_le (
  id             bigserial PRIMARY KEY,
  doan_id        bigint NOT NULL REFERENCES public.doan(id) ON DELETE CASCADE,
  khach_hang_id  bigint REFERENCES public.khach_hang(id) ON DELETE SET NULL,
  lead_id        bigint REFERENCES public.lead(id) ON DELETE SET NULL,
  ho_ten         text NOT NULL,
  so_dien_thoai  text,
  so_khach_lon   integer NOT NULL DEFAULT 0,
  so_khach_em1   integer NOT NULL DEFAULT 0,  -- trẻ em 50%
  so_khach_em2   integer NOT NULL DEFAULT 0,  -- trẻ em free
  gia_ban        numeric NOT NULL DEFAULT 0,  -- tổng giá bán cho khách lẻ này
  da_thu         numeric NOT NULL DEFAULT 0,  -- đã thu (cọc + thu thêm)
  ghi_chu        text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doan_khach_le_doan ON public.doan_khach_le (doan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doan_khach_le TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.doan_khach_le_id_seq TO authenticated, service_role;

ALTER TABLE public.doan_khach_le ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS van_phong_scope ON public.doan_khach_le;
CREATE POLICY van_phong_scope ON public.doan_khach_le
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_cross_vp() OR EXISTS (
        SELECT 1 FROM public.doan d
        WHERE d.id = doan_khach_le.doan_id AND can_access_van_phong(d.van_phong_id)
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      current_user_cross_vp() OR EXISTS (
        SELECT 1 FROM public.doan d
        WHERE d.id = doan_khach_le.doan_id AND can_access_van_phong(d.van_phong_id)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.doan_khach_le_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_doan_khach_le_updated_at ON public.doan_khach_le;
CREATE TRIGGER trg_doan_khach_le_updated_at
  BEFORE UPDATE ON public.doan_khach_le
  FOR EACH ROW EXECUTE FUNCTION public.doan_khach_le_touch_updated_at();
