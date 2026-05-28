-- Schema tối thiểu để test hàm public.recalc_chi_phi_payment_status.
-- Chỉ tạo các bảng + cột mà hàm đọc/ghi. KHÔNG mock Supabase auth/RLS — hàm
-- này thuần plpgsql, không phụ thuộc auth.uid().

CREATE TABLE doan_chi_phi (
  id bigint PRIMARY KEY,
  thanh_tien numeric NOT NULL DEFAULT 0,
  thanh_tien_thuc_te numeric,
  so_tien_da_dntt numeric NOT NULL DEFAULT 0,
  so_tien_da_tt numeric NOT NULL DEFAULT 0,
  trang_thai_thanh_toan text NOT NULL DEFAULT 'unpaid',
  trang_thai_dntt text NOT NULL DEFAULT 'chua_de_nghi'
);

CREATE TABLE de_nghi_thanh_toan (
  id bigint PRIMARY KEY,
  so_tien numeric NOT NULL,
  trang_thai_duyet text NOT NULL
    CHECK (trang_thai_duyet IN ('cho_duyet','da_duyet','tu_choi','da_huy'))
);

CREATE TABLE dntt_allocations (
  dntt_id bigint NOT NULL REFERENCES de_nghi_thanh_toan(id) ON DELETE CASCADE,
  chi_phi_id bigint NOT NULL REFERENCES doan_chi_phi(id) ON DELETE CASCADE,
  so_tien numeric NOT NULL,
  PRIMARY KEY (dntt_id, chi_phi_id)
);

CREATE TABLE payments (
  id bigserial PRIMARY KEY,
  dntt_id bigint NOT NULL REFERENCES de_nghi_thanh_toan(id) ON DELETE CASCADE,
  so_tien numeric NOT NULL
);
