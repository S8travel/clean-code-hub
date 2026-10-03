-- Test migration 20261003_dinh_ky_don_phan_du.sql.
-- Thứ tự nạp (xem README): schema.sql → 20261003b (recalc) → seed_lech.sql →
-- migration 20261003 (bước 4 dọn dữ liệu seed) → file này.
-- Assertion fail → RAISE EXCEPTION → psql ON_ERROR_STOP → CI đỏ.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION t_eq(p_label text, p_actual numeric, p_expected numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: % (expected %)', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS [%]', p_label;
END $$;

CREATE OR REPLACE FUNCTION t_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL [%]', p_label;
  END IF;
  RAISE NOTICE 'PASS [%]', p_label;
END $$;

-- Allocation của 1 dòng trong 1 phiếu (NULL = không có dòng allocation).
CREATE OR REPLACE FUNCTION t_alloc(p_dntt bigint, p_cp bigint)
RETURNS numeric LANGUAGE sql AS $$
  SELECT so_tien FROM dntt_allocations WHERE dntt_id = p_dntt AND chi_phi_id = p_cp
$$;

CREATE OR REPLACE FUNCTION t_tong_phieu(p_dntt bigint)
RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(sum(so_tien), 0) FROM dntt_allocations WHERE dntt_id = p_dntt
$$;

-- "Còn" y như trang Thanh toán định kỳ: Σ max(0, net − so_tien_da_dntt) trên dòng
-- hiện ở trang (lọc như useDinhKyChiPhiList) của cụm NCC × kỳ.
CREATE OR REPLACE FUNCTION t_con(p_ncc bigint, p_ky text)
RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(sum(GREATEST(COALESCE(c.thanh_tien_thuc_te, c.tien_cong_ty, 0) - c.so_tien_da_dntt, 0)), 0)
  FROM doan_chi_phi c JOIN doan d ON d.id = c.doan_id
  WHERE c.thanh_toan_dinh_ky AND NOT c.ks_huy AND c.trang_thai_thanh_toan <> 'paid'
    AND c.nha_cung_cap_id = p_ncc
    AND COALESCE(c.ky_thanh_toan,
          to_char(CASE WHEN c.ngoai_tour AND c.ngoai_tour_ci IS NOT NULL
                       THEN c.ngoai_tour_ci ELSE d.ngay_di END, 'YYYY-MM')) = p_ky
$$;

CREATE OR REPLACE FUNCTION t_reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE activity_log, payments, dntt_allocations, de_nghi_thanh_toan, cong_no,
           doan_chi_phi, doan, user_roles RESTART IDENTITY;
END $$;

-- Sửa chi phí kiểu tab Chi phí: ghi cả don_gia lẫn tien_cong_ty.
CREATE OR REPLACE FUNCTION t_setnet(p_id bigint, p_net numeric) RETURNS void
LANGUAGE sql AS $$
  UPDATE doan_chi_phi SET don_gia = p_net, tien_cong_ty = p_net WHERE id = p_id
$$;

-- Dựng dòng định kỳ: 1 dòng / 1 đoàn (id đoàn = id dòng).
CREATE OR REPLACE FUNCTION t_dong(
  p_id bigint, p_ncc bigint, p_net numeric,
  p_ngay date DEFAULT '2026-09-10', p_dinh_ky boolean DEFAULT true
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO doan (id, ten_doan, ngay_di) VALUES (p_id, 'Đoàn ' || p_id, p_ngay);
  INSERT INTO doan_chi_phi (id, doan_id, nha_cung_cap_id, don_gia, tien_cong_ty, thanh_toan_dinh_ky)
  VALUES (p_id, p_id, p_ncc, p_net, p_net, p_dinh_ky);
$$;

CREATE OR REPLACE FUNCTION t_phieu(
  p_id bigint, p_ncc bigint, p_so_tien numeric,
  p_loai text DEFAULT 'dinh_ky', p_duyet text DEFAULT 'da_duyet'
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO de_nghi_thanh_toan (id, loai, ref_loai, nha_cung_cap_id, so_tien, trang_thai_duyet)
  VALUES (p_id, p_loai, p_loai, p_ncc, p_so_tien, p_duyet);
$$;

CREATE OR REPLACE FUNCTION t_recalc_all() RETURNS void LANGUAGE sql AS $$
  SELECT recalc_chi_phi_payment_status(ARRAY(SELECT id FROM doan_chi_phi)::bigint[])
$$;

------------------------------------------------------------------------------
-- A. Bước 4 của migration đã dọn dữ liệu seed_lech.sql
------------------------------------------------------------------------------
SELECT t_eq('A1 tổng phiếu cọc giữ nguyên', t_tong_phieu(100), 13000000);
SELECT t_true('A2 dòng 2 (về 0) hết allocation', t_alloc(100, 2) IS NULL);
SELECT t_true('A3 dòng 4 (về 0) hết allocation', t_alloc(100, 4) IS NULL);
-- Dòng 2 dồn 3tr theo phần còn thiếu 5tr:4tr → 1.666.667 / 1.333.333; rồi dòng 4
-- dồn 1tr theo 3.333.333:2.666.667 → 555.556 / 444.444 (hòa phần lẻ → dòng id nhỏ).
SELECT t_eq('A4 dòng 1 nhận phần dồn', t_alloc(100, 1), 7222223);
SELECT t_eq('A5 dòng 3 nhận phần dồn', t_alloc(100, 3), 5777777);
SELECT t_true('A6 dòng 5 (ngoài phiếu) không bị kéo vào — cùng phiếu còn đủ chỗ', t_alloc(100, 5) IS NULL);
SELECT t_eq('A7 Còn của cụm = Tổng − đã đề nghị', t_con(1, '2026-08'), 12000000);
SELECT t_eq('A8 recalc: dòng 2 cam kết về 0', (SELECT so_tien_da_dntt FROM doan_chi_phi WHERE id = 2), 0);
SELECT t_eq('A9 recalc: dòng 1 cam kết mới', (SELECT so_tien_da_dntt FROM doan_chi_phi WHERE id = 1), 7222223);
SELECT t_eq('A10 ghi chú phiếu: 2 lần phân bổ lại',
  (SELECT (length(ghi_chu) - length(replace(ghi_chu, '[Tự phân bổ lại', ''))) / length('[Tự phân bổ lại')
   FROM de_nghi_thanh_toan WHERE id = 100), 2);
SELECT t_eq('A11 nhật ký đoàn 2 + 4',
  (SELECT count(*) FROM activity_log WHERE table_name = 'dntt_allocations' AND doan_id IN (2, 4)), 2);
SELECT t_eq('A12 đoàn đã có công nợ với NCC → bỏ qua (dòng 11)', t_alloc(200, 11), 2000000);
SELECT t_eq('A13 phiếu của dòng bị bỏ qua giữ nguyên (dòng 12)', t_alloc(200, 12), 1000000);
SELECT t_true('A14 phiếu bị bỏ qua không có ghi chú', (SELECT ghi_chu FROM de_nghi_thanh_toan WHERE id = 200) IS NULL);
SELECT t_eq('A15 dòng không định kỳ không đụng', t_alloc(300, 21), 2000000);
SELECT t_eq('A16 phiếu đã có công nợ đối ứng (dntt_goc_id) → không dồn', t_alloc(400, 31), 1000000);
SELECT t_eq('A17 dòng nhận của phiếu có công nợ giữ nguyên', t_alloc(400, 32), 1000000);

------------------------------------------------------------------------------
-- B. Trigger: dồn trong CÙNG phiếu, chia theo phần còn thiếu
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(1, 900, 10000000); SELECT t_dong(2, 900, 6000000); SELECT t_dong(3, 900, 4000000);
SELECT t_phieu(100, 900, 8000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (100, 1, 4000000), (100, 2, 2400000), (100, 3, 1600000);
SELECT t_recalc_all();
SELECT t_setnet(1, 0);
SELECT t_true('B1 dòng về 0 hết allocation', t_alloc(100, 1) IS NULL);
SELECT t_eq('B2 dòng 2 nhận 2.4tr', t_alloc(100, 2), 4800000);
SELECT t_eq('B3 dòng 3 nhận 1.6tr', t_alloc(100, 3), 3200000);
SELECT t_eq('B4 tổng phiếu giữ nguyên', t_tong_phieu(100), 8000000);
SELECT t_eq('B5 Còn = (0+6+4) − 8', t_con(900, '2026-09'), 2000000);
SELECT t_true('B6 recalc dòng về 0',
  (SELECT so_tien_da_dntt = 0 AND trang_thai_dntt = 'chua_de_nghi' FROM doan_chi_phi WHERE id = 1));
SELECT t_true('B7 ghi chú phiếu đúng định dạng tiền',
  (SELECT position('chuyển 4.000.000 ₫ sang 2 chi phí' IN ghi_chu) > 0 FROM de_nghi_thanh_toan WHERE id = 100));
SELECT t_eq('B8 nhật ký vào đúng đoàn của dòng bị giảm',
  (SELECT count(*) FROM activity_log WHERE doan_id = 1 AND record_id = '1'), 1);

------------------------------------------------------------------------------
-- C. Cùng phiếu hết chỗ → dòng cùng NCC × kỳ ngoài phiếu (thêm allocation);
--    loại NCC khác / kỳ khác / KS hủy / đoàn hủy / đã paid / cong_no
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(11, 901, 5000000); SELECT t_dong(12, 901, 5000000);
SELECT t_dong(13, 901, 3000000);                       -- nhận
SELECT t_dong(14, 902, 3000000);                       -- NCC khác
SELECT t_dong(15, 901, 2000000, '2026-10-05');         -- kỳ khác
SELECT t_dong(16, 901, 2000000);                       -- KS hủy
SELECT t_dong(17, 901, 2000000);                       -- đoàn hủy
SELECT t_dong(18, 901, 2000000, '2026-08-28');         -- đẩy kỳ sang 09 → cùng cụm, nhận
SELECT t_dong(19, 901, 2000000);                       -- đã paid
SELECT t_dong(20, 901, 2000000);                       -- trang_thai_dntt cong_no
UPDATE doan_chi_phi SET ks_huy = true WHERE id = 16;
UPDATE doan SET trang_thai = 'huy' WHERE id = 17;
UPDATE doan_chi_phi SET ky_thanh_toan = '2026-09' WHERE id = 18;
SELECT t_phieu(110, 901, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (110, 11, 5000000), (110, 12, 5000000);
SELECT t_recalc_all();
UPDATE doan_chi_phi SET trang_thai_thanh_toan = 'paid' WHERE id = 19;
UPDATE doan_chi_phi SET trang_thai_dntt = 'cong_no' WHERE id = 20;
SELECT t_setnet(11, 2000000);
SELECT t_eq('C1 dòng bị giảm còn đúng chi phí mới', t_alloc(110, 11), 2000000);
SELECT t_eq('C2 dòng 13 nhận 3tr×3/5', t_alloc(110, 13), 1800000);
SELECT t_eq('C3 dòng 18 (đẩy kỳ) nhận 3tr×2/5', t_alloc(110, 18), 1200000);
SELECT t_true('C4 không đụng dòng bị loại',
  (SELECT count(*) = 0 FROM dntt_allocations WHERE dntt_id = 110 AND chi_phi_id IN (14, 15, 16, 17, 19, 20)));
SELECT t_eq('C5 tổng phiếu giữ nguyên', t_tong_phieu(110), 10000000);

------------------------------------------------------------------------------
-- D. Cả cụm hết chỗ → để yên (đề nghị dư thật, người xử lý)
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(21, 903, 5000000); SELECT t_dong(22, 903, 5000000);
SELECT t_phieu(120, 903, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (120, 21, 5000000), (120, 22, 5000000);
SELECT t_recalc_all();
SELECT t_setnet(21, 1000000);
SELECT t_eq('D1 allocation giữ nguyên', t_alloc(120, 21), 5000000);
SELECT t_true('D2 không ghi chú', (SELECT ghi_chu FROM de_nghi_thanh_toan WHERE id = 120) IS NULL);
SELECT t_eq('D3 không nhật ký', (SELECT count(*) FROM activity_log), 0);

------------------------------------------------------------------------------
-- E. Chỉ dồn phần vượt DO LẦN GIẢM NÀY — phần vượt cũ (có thể đã ghi công nợ) giữ
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(31, 904, 5000000); SELECT t_dong(32, 904, 10000000);
SELECT t_phieu(130, 904, 8000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (130, 31, 6000000), (130, 32, 2000000);
SELECT t_recalc_all();
SELECT t_setnet(31, 4000000);
SELECT t_eq('E1 dòng 31: 6tr → 5tr (chỉ rút 1tr vừa giảm)', t_alloc(130, 31), 5000000);
SELECT t_eq('E2 dòng 32: 2tr → 3tr', t_alloc(130, 32), 3000000);

------------------------------------------------------------------------------
-- F. Phiếu ĐÃ TRẢ đủ: tiền đã trả đi theo allocation
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(41, 905, 10000000); SELECT t_dong(42, 905, 10000000);
SELECT t_phieu(140, 905, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (140, 41, 5000000), (140, 42, 5000000);
INSERT INTO payments (dntt_id, so_tien) VALUES (140, 10000000);
SELECT t_recalc_all();
SELECT t_setnet(41, 0);
SELECT t_true('F1 dòng về 0: 0 / 0 / unpaid',
  (SELECT so_tien_da_dntt = 0 AND so_tien_da_tt = 0 AND trang_thai_thanh_toan = 'unpaid' FROM doan_chi_phi WHERE id = 41));
SELECT t_true('F2 dòng nhận: đề nghị 10tr, đã trả 10tr, paid',
  (SELECT so_tien_da_dntt = 10000000 AND so_tien_da_tt = 10000000 AND trang_thai_thanh_toan = 'paid' FROM doan_chi_phi WHERE id = 42));

------------------------------------------------------------------------------
-- G/H. Dòng không định kỳ / phiếu không phải dinh_ky → không đụng
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(51, 906, 5000000, '2026-09-10', false); SELECT t_dong(52, 906, 5000000, '2026-09-10', false);
SELECT t_phieu(150, 906, 4000000, 'dich_vu');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (150, 51, 2000000), (150, 52, 2000000);
SELECT t_dong(61, 907, 5000000); SELECT t_dong(62, 907, 5000000);
SELECT t_phieu(160, 907, 4000000, 'nha_hang');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (160, 61, 2000000), (160, 62, 2000000);
SELECT t_recalc_all();
SELECT t_setnet(51, 0);
SELECT t_setnet(61, 0);
SELECT t_eq('G1 dòng không định kỳ giữ allocation', t_alloc(150, 51), 2000000);
SELECT t_eq('H1 dòng định kỳ trong phiếu per-đoàn giữ allocation', t_alloc(160, 61), 2000000);

------------------------------------------------------------------------------
-- I. Lưu lại không đổi / tăng giá → trigger không chạy
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(71, 908, 1000000); SELECT t_dong(72, 908, 9000000);
SELECT t_phieu(170, 908, 3000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (170, 71, 2000000), (170, 72, 1000000);
SELECT t_recalc_all();
SELECT t_setnet(71, 1000000);
SELECT t_setnet(71, 1500000);
SELECT t_eq('I1 allocation giữ nguyên', t_alloc(170, 71), 2000000);

------------------------------------------------------------------------------
-- J. Một câu UPDATE giảm nhiều dòng cùng phiếu
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(81, 909, 4000000); SELECT t_dong(82, 909, 4000000); SELECT t_dong(83, 909, 12000000);
SELECT t_phieu(180, 909, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (180, 81, 2000000), (180, 82, 2000000), (180, 83, 6000000);
SELECT t_recalc_all();
UPDATE doan_chi_phi SET don_gia = 0, tien_cong_ty = 0 WHERE id IN (81, 82);
SELECT t_true('J1 hai dòng về 0 hết allocation', t_alloc(180, 81) IS NULL AND t_alloc(180, 82) IS NULL);
SELECT t_eq('J2 dòng còn lại nhận đủ', t_alloc(180, 83), 10000000);

------------------------------------------------------------------------------
-- L. Phiếu đã hủy không tính vào cam kết
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(91, 910, 10000000); SELECT t_dong(92, 910, 6000000);
SELECT t_phieu(190, 910, 10000000, 'dinh_ky', 'da_huy');
SELECT t_phieu(191, 910, 6000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (190, 91, 10000000), (191, 91, 4000000), (191, 92, 2000000);
SELECT t_recalc_all();
SELECT t_setnet(91, 3000000);
SELECT t_eq('L1 phiếu sống: dòng 91 còn 3tr', t_alloc(191, 91), 3000000);
SELECT t_eq('L2 phiếu sống: dòng 92 nhận 1tr', t_alloc(191, 92), 3000000);
SELECT t_eq('L3 phiếu đã hủy không đụng', t_alloc(190, 91), 10000000);

------------------------------------------------------------------------------
-- M. Giảm qua thanh_tien_thuc_te (điều chỉnh thực tế)
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(101, 911, 10000000); SELECT t_dong(102, 911, 5000000);
SELECT t_phieu(192, 911, 7000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (192, 101, 6000000), (192, 102, 1000000);
SELECT t_recalc_all();
UPDATE doan_chi_phi SET thanh_tien_thuc_te = 2000000 WHERE id = 101;
SELECT t_eq('M1 dòng 101 còn 2tr', t_alloc(192, 101), 2000000);
SELECT t_eq('M2 dòng 102 nhận 4tr', t_alloc(192, 102), 5000000);

------------------------------------------------------------------------------
-- N. Tài khoản chỉ xem: hàm có ghi phải chặn; trigger nuốt lỗi (ghi nhật ký 'loi')
--    để KHÔNG làm hỏng lần lưu chi phí — phần dư nằm yên, trang hiện cảnh báo.
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(111, 912, 10000000); SELECT t_dong(112, 912, 10000000);
SELECT t_phieu(193, 912, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (193, 111, 5000000), (193, 112, 5000000);
SELECT t_recalc_all();
INSERT INTO user_roles (user_id, chi_xem) VALUES ('00000000-0000-0000-0000-0000000000aa', true);
DO $$
DECLARE
  v_chan   boolean := false;
  v_lo_sua boolean := false;
BEGIN
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000aa', true);
  BEGIN
    PERFORM dinh_ky_don_phan_du(111, 5000000);
  EXCEPTION WHEN insufficient_privilege THEN
    v_chan := true;
  END;
  BEGIN
    PERFORM t_setnet(111, 0);
  EXCEPTION WHEN OTHERS THEN
    v_lo_sua := true;
  END;
  PERFORM set_config('test.uid', '', true);
  PERFORM t_true('N1 gọi thẳng hàm bằng tài khoản chỉ xem bị chặn (42501)', v_chan);
  PERFORM t_true('N2 lỗi khi dồn không làm hỏng lần lưu chi phí', NOT v_lo_sua);
END $$;
SELECT t_eq('N3 chi phí vẫn lưu được', (SELECT tien_cong_ty FROM doan_chi_phi WHERE id = 111), 0);
SELECT t_eq('N4 allocation không đổi (không dồn)', t_alloc(193, 111), 5000000);
SELECT t_eq('N5 nhật ký ghi lỗi để người soát', (SELECT count(*) FROM activity_log WHERE action = 'loi' AND record_id = '111'), 1);

------------------------------------------------------------------------------
-- P. "Điều chỉnh sau thanh toán" trên phiếu định kỳ: công nợ ghi TRƯỚC rồi mới hạ
--    thanh_tien_thuc_te từng dòng → trigger KHÔNG dồn (tránh tính khoản dư 2 lần)
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(121, 913, 6000000); SELECT t_dong(122, 913, 4000000);
SELECT t_dong(123, 913, 5000000);                        -- cùng NCC × kỳ, còn thiếu
SELECT t_phieu(194, 913, 10000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (194, 121, 6000000), (194, 122, 4000000);
INSERT INTO payments (dntt_id, so_tien) VALUES (194, 10000000);
SELECT t_recalc_all();
INSERT INTO cong_no (doan_id, dntt_goc_id, nha_cung_cap_id, so_tien_goc) VALUES (NULL, 194, 913, 2000000);
UPDATE doan_chi_phi SET thanh_tien_thuc_te = 4800000 WHERE id = 121;
UPDATE doan_chi_phi SET thanh_tien_thuc_te = 3200000 WHERE id = 122;
SELECT t_eq('P1 dòng 121 giữ allocation', t_alloc(194, 121), 6000000);
SELECT t_eq('P2 dòng 122 giữ allocation', t_alloc(194, 122), 4000000);
SELECT t_true('P3 không kéo phiếu sang dòng 123', t_alloc(194, 123) IS NULL);
SELECT t_eq('P4 không nhật ký dồn', (SELECT count(*) FROM activity_log), 0);

------------------------------------------------------------------------------
-- S. Dòng nằm trong CẢ phiếu per-đoàn (cọc KS) lẫn phiếu định kỳ: "Điều chỉnh sau
--    thanh toán" trên phiếu per-đoàn ghi công nợ (tính trên cam kết của cả 2 phiếu)
--    rồi mới hạ thanh_tien_thuc_te → trigger KHÔNG dồn phần định kỳ (kẻo trừ 2 lần)
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(151, 917, 10000000); SELECT t_dong(152, 917, 10000000);
SELECT t_phieu(197, 917, 4000000, 'khach_san');
SELECT t_phieu(198, 917, 6000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (197, 151, 4000000), (198, 151, 6000000);
INSERT INTO payments (dntt_id, so_tien) VALUES (197, 4000000), (198, 6000000);
SELECT t_recalc_all();
INSERT INTO cong_no (doan_id, dntt_goc_id, nha_cung_cap_id, so_tien_goc) VALUES (151, 197, 917, 2000000);
UPDATE doan_chi_phi SET thanh_tien_thuc_te = 8000000 WHERE id = 151;
SELECT t_eq('S1 phiếu định kỳ giữ allocation trên dòng 151', t_alloc(198, 151), 6000000);
SELECT t_true('S2 không kéo phiếu định kỳ sang dòng 152', t_alloc(198, 152) IS NULL);
SELECT t_eq('S3 không nhật ký dồn', (SELECT count(*) FROM activity_log), 0);

------------------------------------------------------------------------------
-- Q. Dòng cùng phiếu nhưng đã đổi sang NCC khác → KHÔNG nhận tiền của NCC phiếu
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(131, 914, 6000000); SELECT t_dong(132, 914, 6000000);
SELECT t_phieu(195, 914, 6000000);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (195, 131, 3000000), (195, 132, 3000000);
SELECT t_recalc_all();
UPDATE doan_chi_phi SET nha_cung_cap_id = 915 WHERE id = 132;   -- danh mục đổi NCC sau khi đề nghị
SELECT t_setnet(131, 0);
SELECT t_eq('Q1 dòng NCC khác không nhận', t_alloc(195, 132), 3000000);
SELECT t_eq('Q2 phần dư nằm yên (không có chỗ cùng NCC)', t_alloc(195, 131), 3000000);

------------------------------------------------------------------------------
-- R. Chi phí số lẻ: chỉ dồn đồng nguyên → tổng phiếu khớp tuyệt đối, không dồn quá chỗ
------------------------------------------------------------------------------
SELECT t_reset();
SELECT t_dong(141, 916, 100); SELECT t_dong(142, 916, 50.5);
SELECT t_phieu(196, 916, 100);
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (196, 141, 100);
SELECT t_recalc_all();
SELECT t_setnet(141, 0);
SELECT t_eq('R1 tổng phiếu giữ nguyên', t_tong_phieu(196), 100);
SELECT t_eq('R2 dòng nhận lấy phần nguyên của chỗ trống', t_alloc(196, 142), 50);
SELECT t_eq('R3 phần không dồn được nằm lại dòng nguồn', t_alloc(196, 141), 50);

------------------------------------------------------------------------------
-- O. chia_theo_ty_le
------------------------------------------------------------------------------
SELECT t_true('O1 10 chia đều 3 phần → 4/3/3',
  (SELECT string_agg(so_tien::text, ',' ORDER BY chi_phi_id)
   FROM chia_theo_ty_le(10, ARRAY[1, 2, 3]::bigint[], ARRAY[1, 1, 1]::numeric[])) = '4,3,3');
SELECT t_true('O2 bỏ trọng số <= 0, tổng vẫn khớp',
  (SELECT count(*) = 1 AND sum(so_tien) = 100
   FROM chia_theo_ty_le(100, ARRAY[1, 2, 3]::bigint[], ARRAY[0, -5, 7]::numeric[])));
SELECT t_true('O3 tổng = Σ trọng số → mỗi phần đúng bằng trọng số',
  (SELECT string_agg(so_tien::text, ',' ORDER BY chi_phi_id)
   FROM chia_theo_ty_le(18, ARRAY[1, 2, 3]::bigint[], ARRAY[7, 5, 6]::numeric[])) = '7,5,6');

SELECT 'ALL dinh_ky_don_phan_du TESTS PASSED' AS result;
