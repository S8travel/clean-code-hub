-- Test cases cho hàm public.recalc_chi_phi_payment_status.
-- Mỗi case wrap trong DO block, reset data trước khi setup, ASSERT post-call.
-- Chạy với psql -v ON_ERROR_STOP=1 — assertion fail → exit code != 0 → CI đỏ.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION test_reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE payments, dntt_allocations, de_nghi_thanh_toan, doan_chi_phi RESTART IDENTITY;
END $$;

CREATE OR REPLACE FUNCTION test_assert_cp(
  p_id bigint,
  p_da_dntt numeric,
  p_da_tt numeric,
  p_tt_status text,
  p_dntt_status text,
  p_label text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r doan_chi_phi%ROWTYPE;
BEGIN
  SELECT * INTO r FROM doan_chi_phi WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL [%]: chi_phi id=% không tồn tại', p_label, p_id;
  END IF;
  IF r.so_tien_da_dntt <> p_da_dntt THEN
    RAISE EXCEPTION 'FAIL [%]: so_tien_da_dntt = % (expected %)', p_label, r.so_tien_da_dntt, p_da_dntt;
  END IF;
  IF r.so_tien_da_tt <> p_da_tt THEN
    RAISE EXCEPTION 'FAIL [%]: so_tien_da_tt = % (expected %)', p_label, r.so_tien_da_tt, p_da_tt;
  END IF;
  IF r.trang_thai_thanh_toan <> p_tt_status THEN
    RAISE EXCEPTION 'FAIL [%]: trang_thai_thanh_toan = % (expected %)', p_label, r.trang_thai_thanh_toan, p_tt_status;
  END IF;
  IF r.trang_thai_dntt <> p_dntt_status THEN
    RAISE EXCEPTION 'FAIL [%]: trang_thai_dntt = % (expected %)', p_label, r.trang_thai_dntt, p_dntt_status;
  END IF;
  RAISE NOTICE 'PASS [%]', p_label;
END $$;

------------------------------------------------------------------------------
-- 1. Empty: chi_phi không có allocation → reset về zero/unpaid/chua_de_nghi.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
-- Pre-populate giá trị "rác" để verify hàm CÓ reset.
UPDATE doan_chi_phi SET so_tien_da_dntt = 999, so_tien_da_tt = 555,
  trang_thai_thanh_toan = 'paid', trang_thai_dntt = 'da_thanh_toan' WHERE id = 1;
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 0, 0, 'unpaid', 'chua_de_nghi', '1. empty allocations resets to zero');

------------------------------------------------------------------------------
-- 2. 1 alloc + DNTT cho_duyet → da_dntt=alloc, da_tt=0, unpaid, cho_duyet.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'cho_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 0, 'unpaid', 'cho_duyet', '2. cho_duyet → da_dntt counted');

------------------------------------------------------------------------------
-- 3. 1 alloc + DNTT da_duyet, no payment → da_dntt=alloc, da_tt=0, unpaid, da_duyet.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 0, 'unpaid', 'da_duyet', '3. da_duyet no payment → dntt_status da_duyet (has_da_duyet_unpaid)');

------------------------------------------------------------------------------
-- 4. 1 alloc + DNTT da_duyet + partial payment → pro-rata da_tt, partial_paid, da_duyet.
--    Pro-rata: da_tt = alloc × (paid / dntt.so_tien) = 1000 × (400/1000) = 400.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 400);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 400, 'partial_paid', 'da_duyet', '4. partial payment → partial_paid, pro-rata');

------------------------------------------------------------------------------
-- 5. 1 alloc + DNTT da_duyet + full payment → da_tt=alloc, paid, da_thanh_toan.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 1000, 'paid', 'da_thanh_toan', '5. full payment → paid + da_thanh_toan');

------------------------------------------------------------------------------
-- 6. 1 alloc + DNTT tu_choi → da_dntt=0 (loại), unpaid, chua_de_nghi.
--    Đây là bug đã fix trong migration 20260521 — tu_choi KHÔNG được tính commitment.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'tu_choi');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 0, 0, 'unpaid', 'chua_de_nghi', '6. tu_choi excluded from commitment');

------------------------------------------------------------------------------
-- 7. 1 alloc + DNTT da_huy → da_dntt=0 (loại), unpaid, chua_de_nghi.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_huy');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 0, 0, 'unpaid', 'chua_de_nghi', '7. da_huy excluded from commitment');

------------------------------------------------------------------------------
-- 8. thanh_toan_mot_phan branch — cần: no cho_duyet, no da_duyet_unpaid,
--    da_tt > 0, da_tt < thanh_tien. Setup: 2 alloc, một paid full, một paid full
--    nhưng tổng alloc < thanh_tien. Hoặc dùng 1 alloc=400 paid full nhưng
--    thanh_tien=1000 → da_tt=400 < 1000.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 400, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 400);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 400);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 400, 400, 'partial_paid', 'thanh_toan_mot_phan', '8. alloc < total + paid full → thanh_toan_mot_phan');

------------------------------------------------------------------------------
-- 9. thanh_tien_thuc_te override: chi_phi.thanh_tien=100 (computed = gross sai),
--    thuc_te=200 (đã điều chỉnh). Payment đầy đủ 100 → da_tt=100. Compare với
--    thuc_te=200 → 100 < 200 → partial_paid (KHÔNG paid theo thanh_tien=100).
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien, thanh_tien_thuc_te) VALUES (1, 100, 200);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 100, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 100);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 100);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
-- da_tt=100, thuc_te=200, has_da_duyet_unpaid=false (paid==so_tien), no cho_duyet
-- → CASE da_tt >= thuc_te? 100 >= 200? false → da_tt > 0 → thanh_toan_mot_phan.
SELECT test_assert_cp(1, 100, 100, 'partial_paid', 'thanh_toan_mot_phan', '9. thanh_tien_thuc_te override controls paid threshold');

------------------------------------------------------------------------------
-- 10. Multiple chi_phi, chỉ update id trong array — id ngoài array giữ nguyên.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000), (2, 500);
-- cp 2 có giá trị cũ — không nằm trong array → KHÔNG được đụng.
UPDATE doan_chi_phi SET so_tien_da_dntt = 999, trang_thai_thanh_toan = 'paid' WHERE id = 2;
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 1000);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 1000, 'paid', 'da_thanh_toan', '10a. id trong array → updated');
SELECT test_assert_cp(2, 999, 0, 'paid', 'chua_de_nghi', '10b. id ngoài array → giữ nguyên');

------------------------------------------------------------------------------
-- 11. cho_duyet override da_duyet_unpaid: nếu CÓ ít nhất 1 DNTT cho_duyet,
--     trang_thai_dntt = 'cho_duyet' bất kể có da_duyet_unpaid hay không.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 2000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES
  (10, 1000, 'da_duyet'),
  (11, 1000, 'cho_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES
  (10, 1, 1000),
  (11, 1, 1000);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 500);
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
-- da_dntt = 1000 + 1000 = 2000 (cả cho_duyet + da_duyet)
-- da_tt = 1000 * (500/1000) = 500 (chỉ da_duyet partial)
-- has_cho_duyet = true → dntt_status = cho_duyet (override mọi case khác)
SELECT test_assert_cp(1, 2000, 500, 'partial_paid', 'cho_duyet', '11. cho_duyet wins precedence');

------------------------------------------------------------------------------
-- 12. Overpayment: payment > dntt.so_tien → da_tt capped at alloc (LEAST 1.0).
--     dntt.so_tien=1000, paid=1500 → ratio capped at 1.0 → da_tt = alloc × 1.0 = 1000.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO doan_chi_phi (id, thanh_tien) VALUES (1, 1000);
INSERT INTO de_nghi_thanh_toan (id, so_tien, trang_thai_duyet) VALUES (10, 1000, 'da_duyet');
INSERT INTO dntt_allocations (dntt_id, chi_phi_id, so_tien) VALUES (10, 1, 1000);
INSERT INTO payments (dntt_id, so_tien) VALUES (10, 800), (10, 700); -- tổng 1500 > 1000
SELECT recalc_chi_phi_payment_status(ARRAY[1]::bigint[]);
SELECT test_assert_cp(1, 1000, 1000, 'paid', 'da_thanh_toan', '12. overpayment capped at alloc');

\echo ALL TESTS PASSED
