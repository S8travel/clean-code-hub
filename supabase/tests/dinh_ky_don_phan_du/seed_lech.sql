-- Dữ liệu ĐANG LỆCH có từ trước migration — nạp TRƯỚC 20261003 để bước 4 (dọn dữ
-- liệu) của migration xử lý đúng như khi apply lên prod. Số liệu tổng hợp.

-- Cụm A — NCC 1 × kỳ 2026-08. Phiếu cọc #100 = 13.000.000 chia theo tỷ lệ cho dòng
-- 1..4; SAU đó dòng 2 (6tr) và dòng 4 (2tr) bị sửa về 0, dòng 5 thêm sau phiếu.
--   Tổng phải trả = 10 + 0 + 8 + 0 + 7 = 25.000.000 → Còn đúng = 12.000.000
--   Trang tính theo từng dòng = 5 + 0 + 4 + 0 + 7 = 16.000.000 (phình 4.000.000)
INSERT INTO doan (id, ten_doan, ngay_di) VALUES
  (1, 'Đoàn A1', '2026-08-03'), (2, 'Đoàn A2', '2026-08-08'), (3, 'Đoàn A3', '2026-08-12'),
  (4, 'Đoàn A4', '2026-08-20'), (5, 'Đoàn A5', '2026-08-27');
INSERT INTO doan_chi_phi (id, doan_id, nha_cung_cap_id, don_gia, tien_cong_ty, thanh_toan_dinh_ky) VALUES
  (1, 1, 1, 10000000, 10000000, true),
  (2, 2, 1, 0, 0, true),
  (3, 3, 1, 8000000, 8000000, true),
  (4, 4, 1, 0, 0, true),
  (5, 5, 1, 7000000, 7000000, true);
INSERT INTO de_nghi_thanh_toan (id, loai, ref_loai, nha_cung_cap_id, so_tien, trang_thai_duyet)
VALUES (100, 'dinh_ky', 'dinh_ky', 1, 13000000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES
  (100, 1, 5000000), (100, 2, 3000000), (100, 3, 4000000), (100, 4, 1000000);

-- Cụm B — NCC 2: dòng 11 vượt nhưng đoàn của nó ĐÃ CÓ công nợ với NCC 2 → bỏ qua
-- (phần vượt có thể đã được ghi công nợ rồi; dồn nữa là xử lý hai lần).
INSERT INTO doan (id, ten_doan, ngay_di) VALUES (11, 'Đoàn B1', '2026-08-05'), (12, 'Đoàn B2', '2026-08-06');
INSERT INTO doan_chi_phi (id, doan_id, nha_cung_cap_id, don_gia, tien_cong_ty, thanh_toan_dinh_ky) VALUES
  (11, 11, 2, 0, 0, true),
  (12, 12, 2, 5000000, 5000000, true);
INSERT INTO de_nghi_thanh_toan (id, loai, ref_loai, nha_cung_cap_id, so_tien, trang_thai_duyet)
VALUES (200, 'dinh_ky', 'dinh_ky', 2, 3000000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (200, 11, 2000000), (200, 12, 1000000);
INSERT INTO cong_no (doan_id, nha_cung_cap_id, so_tien_goc) VALUES (11, 2, 2000000);

-- Cụm C — dòng KHÔNG định kỳ vượt trong phiếu per-đoàn → không phải việc của migration.
INSERT INTO doan (id, ten_doan, ngay_di) VALUES (21, 'Đoàn C1', '2026-08-09');
INSERT INTO doan_chi_phi (id, doan_id, nha_cung_cap_id, don_gia, tien_cong_ty, thanh_toan_dinh_ky) VALUES
  (21, 21, 3, 1000000, 1000000, false),
  (22, 21, 3, 4000000, 4000000, false);
INSERT INTO de_nghi_thanh_toan (id, doan_id, loai, ref_loai, nha_cung_cap_id, so_tien, trang_thai_duyet)
VALUES (300, 21, 'dich_vu', 'doan_chi_phi', 3, 2500000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (300, 21, 2000000), (300, 22, 500000);

-- Cụm D — NCC 4: phiếu #400 đã có công nợ đối ứng (cong_no.dntt_goc_id, doan_id NULL
-- như "Điều chỉnh sau thanh toán" ghi cho phiếu định kỳ) → không dồn.
INSERT INTO doan (id, ten_doan, ngay_di) VALUES (31, 'Đoàn D1', '2026-08-11'), (32, 'Đoàn D2', '2026-08-12');
INSERT INTO doan_chi_phi (id, doan_id, nha_cung_cap_id, don_gia, tien_cong_ty, thanh_toan_dinh_ky) VALUES
  (31, 31, 4, 0, 0, true),
  (32, 32, 4, 5000000, 5000000, true);
INSERT INTO de_nghi_thanh_toan (id, loai, ref_loai, nha_cung_cap_id, so_tien, trang_thai_duyet)
VALUES (400, 'dinh_ky', 'dinh_ky', 4, 2000000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (400, 31, 1000000), (400, 32, 1000000);
INSERT INTO cong_no (doan_id, dntt_goc_id, nha_cung_cap_id, so_tien_goc) VALUES (NULL, 400, 4, 1000000);

SELECT recalc_chi_phi_payment_status(ARRAY[1, 2, 3, 4, 5, 11, 12, 21, 22, 31, 32]::bigint[]);
