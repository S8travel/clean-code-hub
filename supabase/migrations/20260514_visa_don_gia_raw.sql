-- Lưu đơn giá raw (USD/RMB/NT) riêng, độc lập với don_gia (VND đã quy đổi).
-- Tránh reverse-engineer raw từ VND (sai khi user chưa nhập tỷ giá).
ALTER TABLE doan_chi_phi
  ADD COLUMN IF NOT EXISTS don_gia_raw numeric;
