-- Auto-create nhóm "Toàn đoàn" khi INSERT đoàn mới — để Phase 1 ship standalone
-- (Phase 2 sẽ wire DoanDrawer trực tiếp + hỗ trợ tạo N nhóm khi cần)

CREATE OR REPLACE FUNCTION public.doan_auto_create_nhom_default()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.doan_nhom (
    doan_id, ten_nhom, thu_tu,
    so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl
  ) VALUES (
    NEW.id, 'Toàn đoàn', 1,
    NEW.so_khach_lon, NEW.so_khach_em1, NEW.so_khach_em2, NEW.so_khach_tl
  );
  RETURN NEW;
END $$;

CREATE TRIGGER doan_auto_create_nhom_default
  AFTER INSERT ON public.doan
  FOR EACH ROW EXECUTE FUNCTION public.doan_auto_create_nhom_default();
