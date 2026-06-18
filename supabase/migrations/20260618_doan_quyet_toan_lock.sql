-- Khóa toàn đoàn khi ĐNTT quyết toán HDV được Kế toán trưởng (KTT) duyệt cấp 3.
--
-- "Bị khóa" = đoàn có DNTT ref_loai='hdv_quyet_toan' với trang_thai_duyet='da_duyet'
-- (KTT duyệt = ktt_duyet_luc được set). Lúc đó đoàn đã đi xong, HDV nộp giấy tờ,
-- kế toán check rồi mới quyết toán → chốt số, không cho sửa nữa.
--
-- quyet_toan_mo_khoa: cờ admin MỞ KHÓA tạm. true → đoàn editable lại dù vẫn còn DNTT
--   quyết toán đã KTT-duyệt. Chỉ admin bật/tắt (kèm log activity_log + audit cột dưới).
--   Mặc định false. Lock hiệu lực = (có DNTT QT KTT-duyệt) AND (mo_khoa=false) AND (user != admin).
--
-- ALTER trên bảng có sẵn → KHÔNG cần GRANT lại.
ALTER TABLE public.doan
  ADD COLUMN IF NOT EXISTS quyet_toan_mo_khoa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quyet_toan_mo_khoa_boi uuid,
  ADD COLUMN IF NOT EXISTS quyet_toan_mo_khoa_luc timestamptz,
  ADD COLUMN IF NOT EXISTS quyet_toan_mo_khoa_ly_do text;

COMMENT ON COLUMN public.doan.quyet_toan_mo_khoa IS
  'Cờ admin mở khóa tạm sau khi đoàn đã bị khóa do KTT duyệt quyết toán HDV. true → cho sửa lại. Chỉ admin đổi được.';
COMMENT ON COLUMN public.doan.quyet_toan_mo_khoa_boi IS 'auth.users.id của admin mở/khóa lại lần gần nhất.';
COMMENT ON COLUMN public.doan.quyet_toan_mo_khoa_luc IS 'Thời điểm mở/khóa lại lần gần nhất.';
COMMENT ON COLUMN public.doan.quyet_toan_mo_khoa_ly_do IS 'Lý do admin mở khóa (bắt buộc nhập khi mở).';
