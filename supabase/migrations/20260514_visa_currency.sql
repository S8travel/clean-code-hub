-- Visa thanh toán cho NCC nước ngoài (USD/RMB/NT). Lưu metadata để FE có thể
-- hiển thị + edit raw ngoại tệ; cột don_gia + tien_cong_ty trong DB lưu giá
-- trị VND đã quy đổi (= raw × ty_gia × (1 - chiet_khau_pct/100)).

ALTER TABLE doan_chi_phi
  ADD COLUMN IF NOT EXISTS tien_te_loai text,        -- 'USD' | 'RMB' | 'NT' | NULL (visa)
  ADD COLUMN IF NOT EXISTS ty_gia numeric,            -- 1 đơn vị ngoại tệ = ? VND
  ADD COLUMN IF NOT EXISTS chiet_khau_pct numeric;    -- chiết khấu % (visa nhập tay)
