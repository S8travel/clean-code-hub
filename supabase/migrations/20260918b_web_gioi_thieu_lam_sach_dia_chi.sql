-- Trang gioi thieu doi tac la trang CONG KHAI (repo s8-gioi-thieu public, Vercel).
-- O dia_chi trong danh muc do OP dan nguyen "Dia chi: ... So dien thoai: ... CTY
-- THANH TOAN ..." -> nhieu nha hang + mot so khach san lo so tong dai NCC, vai dong
-- lo dieu khoan thanh toan noi bo. Lam sach o tang VIEW, du lieu goc giu nguyen
-- cho CRM. Luat PHAI giong _S8_WEB_ANH/_lam_sach_dia_chi.py (ban tinh lay DATA
-- tu v10, loc bang Python).
-- Da apply prod 18/09/2026 qua MCP (web_gioi_thieu_lam_sach_dia_chi + ..._nhan_dc).

CREATE OR REPLACE FUNCTION public.web_clean_dia_chi(x text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT NULLIF(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(x,
            -- cat tu nhan dien thoai / ghi chu thanh toan tro di (het chuoi, ke ca xuong dong)
            '(số điện thoại|Số điện thoại|điện thoại|Điện thoại|sđt|SĐT|sdt|đt\s*:|ĐT\s*:|\mtel\M|hotline|phone|cty\s+(tt\M|thanh)).*$', '', 'i'),
          -- bo nhan "Dia chi:" / "D/c:" dau chuoi
          '^\s*(địa chỉ|Địa chỉ|dia chi|đ/c|Đ/c|Đ/C|đc|ĐC)\s*:\s*', '', 'i'),
        -- day >= 7 chu so (cho phep 1 ky tu ngan giua moi chu so) = so dien thoai
        '\+?\(?\d(?:[\s().+/-]?\d){6,}\)?', '', 'g'),
      '\s+', ' ', 'g'),
    ' -,.;:/|'), '')
$$;

-- Hai view SECURITY DEFINER co y (memory project_web_view_security_definer_co_y).
-- CREATE OR REPLACE giu nguyen ten/kieu/thu tu cot -> khong phai DROP.
CREATE OR REPLACE VIEW public.web_khach_san AS
WITH b AS (
  SELECT k.id, k.ten, k.dia_chi, k.dia_diem, k.website, k.ten_zh, k.dia_diem_zh,
         COALESCE(NULLIF(TRIM(BOTH FROM k.dia_diem), ''::text), k.dia_chi) AS nguon_dd
  FROM public.khach_san k
)
SELECT b.id,
  b.ten,
  NULLIF(b.ten_zh, ''::text) AS ten_zh,
  c.ten_en,
  public.web_clean_dia_chi(b.dia_chi) AS dia_chi,
  public.web_norm_city(b.nguon_dd) AS thanh_pho,
  public.web_mien(b.nguon_dd) AS mien,
  -- o dia diem tieng Trung ma chua so dien thoai = dan nham dia chi vao -> bo
  CASE WHEN b.dia_diem_zh ~ '\d(?:[\s().+/-]?\d){6,}' OR b.dia_diem_zh ~* 'sdt|sđt|điện thoại'
       THEN NULL ELSE NULLIF(b.dia_diem_zh, ''::text) END AS dia_diem_zh,
  COALESCE(c.la_du_thuyen, lower(b.ten) ~ 'cruise|thuyền|thuyen|junk|du thuy|yacht'::text) AS la_du_thuyen,
  CASE
    WHEN COALESCE(c.la_du_thuyen, lower(b.ten) ~ 'cruise|thuyền|thuyen|junk|du thuy|yacht'::text)
    THEN COALESCE(c.loai_du_thuyen,
      CASE WHEN lower(b.ten) ~ 'day cruise|day tour|dinner cruise|trong ngày|trong ngay|nửa ngày|nua ngay'::text
           THEN 'day'::text ELSE 'overnight'::text END)
    ELSE NULL::text
  END AS loai_du_thuyen,
  public.web_clean_url(b.website) AS website,
  c.logo_url,
  c.anh_url,
  c.mo_ta_vi,
  c.mo_ta_en,
  c.mo_ta_zh,
  COALESCE(c.la_san_golf, lower(b.ten) ~ 'golf'::text AND lower(b.ten) !~ 'hotel'::text) AS la_san_golf
FROM b
LEFT JOIN public.web_showcase_content c ON c.loai = 'khach_san'::text AND c.ref_id = b.id
WHERE NOT COALESCE(c.an_tren_web, false);

CREATE OR REPLACE VIEW public.web_nha_hang AS
WITH b AS (
  SELECT n.id, n.ten, n.dia_chi, n.dia_diem, n.website, n.ten_zh, n.dia_diem_zh, n.loai,
         COALESCE(NULLIF(TRIM(BOTH FROM n.dia_diem), ''::text), n.dia_chi) AS nguon_dd
  FROM public.nha_hang n
)
SELECT b.id,
  b.ten,
  NULLIF(b.ten_zh, ''::text) AS ten_zh,
  c.ten_en,
  public.web_clean_dia_chi(b.dia_chi) AS dia_chi,
  public.web_norm_city(b.nguon_dd) AS thanh_pho,
  public.web_mien(b.nguon_dd) AS mien,
  CASE WHEN b.dia_diem_zh ~ '\d(?:[\s().+/-]?\d){6,}' OR b.dia_diem_zh ~* 'sdt|sđt|điện thoại'
       THEN NULL ELSE NULLIF(b.dia_diem_zh, ''::text) END AS dia_diem_zh,
  b.loai,
  public.web_clean_url(b.website) AS website,
  c.logo_url,
  c.anh_url,
  c.mo_ta_vi,
  c.mo_ta_en,
  c.mo_ta_zh
FROM b
LEFT JOIN public.web_showcase_content c ON c.loai = 'nha_hang'::text AND c.ref_id = b.id
WHERE NOT COALESCE(c.an_tren_web, false);
