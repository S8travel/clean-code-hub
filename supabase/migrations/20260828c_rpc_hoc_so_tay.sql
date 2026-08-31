-- Ghi vào sổ tay theo kiểu GỘP, không đè-lại.
--
-- Vì sao không upsert thẳng từ client: một lượt học có thể mang dòng CHỈ CÓ TÊN
-- (người nhập mới sửa bản dịch, chưa động tới giá). Upsert thẳng sẽ ghi
-- don_gia = NULL đè lên giá đã học → mất giá lặng lẽ. Hàm này gộp theo từng cột:
-- có giá mới thì lấy, không thì giữ nguyên cái cũ.
--
-- SECURITY INVOKER (mặc định) — CỐ Ý: chạy bằng quyền người gọi nên RLS và ba
-- policy chi_xem_* tự áp dụng. Đổi sang DEFINER là mở đường cho tài khoản chỉ xem
-- ghi được, lúc đó phải tự chèn guard is_tk_chi_xem().
CREATE OR REPLACE FUNCTION public.hoc_so_tay_bao_gia(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_so integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN 0;
  END IF;

  INSERT INTO public.bao_gia_so_tay AS s
    (khoa_zh, zh_goc, ten_vi, loai, don_gia, foc_khach, foc_mien,
     so_lan_dung, lan_cuoi_dung, nguon, tao_boi)
  SELECT
    x.khoa_zh, x.zh_goc, NULLIF(btrim(x.ten_vi), ''), x.loai,
    x.don_gia, x.foc_khach, x.foc_mien,
    1, now(), 'nguoi_nhap', auth.uid()
  FROM jsonb_to_recordset(p_items) AS x(
    khoa_zh text, zh_goc text, ten_vi text, loai text,
    don_gia numeric, foc_khach integer, foc_mien numeric
  )
  WHERE COALESCE(btrim(x.khoa_zh), '') <> ''
    AND x.loai IN ('hotel','meal','ticket','dich_vu')
  ON CONFLICT (khoa_zh, loai) DO UPDATE SET
    -- Giá mới thắng, nhưng KHÔNG được xoá giá cũ bằng NULL.
    don_gia       = COALESCE(EXCLUDED.don_gia,   s.don_gia),
    ten_vi        = COALESCE(EXCLUDED.ten_vi,    s.ten_vi),
    foc_khach     = COALESCE(EXCLUDED.foc_khach, s.foc_khach),
    foc_mien      = COALESCE(EXCLUDED.foc_mien,  s.foc_mien),
    -- zh_goc giữ bản ĐẦU TIÊN: đổi liên tục thì người soát không còn mốc nào.
    zh_goc        = COALESCE(s.zh_goc, EXCLUDED.zh_goc),
    so_lan_dung   = s.so_lan_dung + 1,
    lan_cuoi_dung = now(),
    -- Dòng từng bị ngưng mà người nhập dùng lại = họ muốn nó sống lại.
    ngung         = false;

  GET DIAGNOSTICS v_so = ROW_COUNT;
  RETURN v_so;
END $$;

REVOKE ALL ON FUNCTION public.hoc_so_tay_bao_gia(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hoc_so_tay_bao_gia(jsonb) TO authenticated, service_role;
