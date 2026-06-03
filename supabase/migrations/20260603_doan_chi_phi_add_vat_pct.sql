-- VAT % cho chi phí (hiện dùng cho xe). Nullable → dòng cũ = NULL = 0% (không đổi tiền).
-- Dòng mới do app set (xe mặc định 8). don_gia đã là giá VAT-inclusive nên thanh_tien
-- (generated = don_gia*so_luong) tự gồm VAT; don_gia_raw giữ giá chưa VAT cho UI.
ALTER TABLE public.doan_chi_phi
  ADD COLUMN IF NOT EXISTS vat_pct numeric;

COMMENT ON COLUMN public.doan_chi_phi.vat_pct IS
  '% VAT (xe). NULL=không VAT. don_gia=round(don_gia_raw*(1+vat_pct/100)); don_gia_raw=giá chưa VAT.';
