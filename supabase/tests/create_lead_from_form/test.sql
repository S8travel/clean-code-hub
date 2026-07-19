-- Test cases cho public.create_lead_from_form — endpoint GHI công khai (anon).
-- Trọng tâm: cap độ dài text + rate-limit (đợt vá 20260720).
-- Chạy với psql -v ON_ERROR_STOP=1 — assertion fail → exit code != 0 → CI đỏ.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION test_reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE lead, lead_diem_den, lead_activity, khach_hang, user_roles RESTART IDENTITY;
END $$;

-- Gọi hàm và bắt lỗi: trả về SQLERRM nếu RAISE, NULL nếu chạy lọt.
CREATE OR REPLACE FUNCTION test_expect_raise(p_sql text, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL [%]: mong đợi bị chặn nhưng hàm chạy lọt', p_label;
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL [%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS [%] — chặn đúng: %', p_label, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION test_assert_eq(p_actual anyelement, p_expected anyelement, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: giá trị = % (mong đợi %)', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS [%]', p_label;
END $$;

------------------------------------------------------------------------------
-- 1. Golden path — tạo lead + activity + diem_den, gắn khach_hang.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form('Nguyễn Văn A', '0901234567', 'a@example.com',
  'outbound', 'Đài Loan', 2, 1, NULL, NULL, NULL, 'Ăn chay', 'Ghi chú', 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 1, '1a. tạo 1 lead');
SELECT test_assert_eq((SELECT ho_ten FROM lead), 'Nguyễn Văn A', '1b. ho_ten đúng');
SELECT test_assert_eq((SELECT so_nguoi_lon FROM lead), 2, '1c. so_nguoi_lon');
SELECT test_assert_eq((SELECT count(*)::int FROM lead_activity), 1, '1d. có activity tao_lead');
SELECT test_assert_eq((SELECT diem_den FROM lead_diem_den), 'Đài Loan', '1e. diem_den');
SELECT test_assert_eq((SELECT count(*)::int FROM khach_hang), 1, '1f. gắn khach_hang');

------------------------------------------------------------------------------
-- 2. Cap độ dài — bơm text lớn qua mọi trường, không trường nào vượt ngưỡng.
--    Đây là lỗ hổng chính: trước đây INSERT thẳng, bot bơm MB làm phình DB.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form(
  repeat('A', 500000),      -- ho_ten   → cap 200
  repeat('9', 5000),        -- sdt      → cap 50
  repeat('e', 5000),        -- email    → cap 200
  repeat('t', 5000),        -- loai_tour→ cap 20
  repeat('D', 500000),      -- diem_den → cap 200
  1, 0, NULL, NULL, NULL,
  repeat('Y', 1000000),     -- yeu_cau  → cap 2000
  repeat('G', 1000000),     -- ghi_chu  → cap 2000
  repeat('n', 5000)         -- nguon    → cap 50
);
SELECT test_assert_eq((SELECT length(ho_ten) FROM lead), 200, '2a. ho_ten cap 200');
SELECT test_assert_eq((SELECT length(so_dien_thoai) FROM lead), 50, '2b. sdt cap 50');
SELECT test_assert_eq((SELECT length(email) FROM lead), 200, '2c. email cap 200');
SELECT test_assert_eq((SELECT length(loai_tour) FROM lead), 20, '2d. loai_tour cap 20');
SELECT test_assert_eq((SELECT length(yeu_cau_dac_biet) FROM lead), 2000, '2e. yeu_cau cap 2000');
SELECT test_assert_eq((SELECT length(ghi_chu) FROM lead), 2000, '2f. ghi_chu cap 2000');
SELECT test_assert_eq((SELECT length(nguon) FROM lead), 50, '2g. nguon cap 50');
SELECT test_assert_eq((SELECT length(diem_den) FROM lead_diem_den), 200, '2h. diem_den cap 200');
-- Giá trị truyền xuống find_or_create_khach_hang cũng phải ĐÃ cap — anon ghi
-- gián tiếp vào khach_hang qua ngữ cảnh SECURITY DEFINER.
SELECT test_assert_eq((SELECT length(ho_ten) FROM khach_hang), 200, '2i. khach_hang.ho_ten đã cap');

------------------------------------------------------------------------------
-- 3. Clamp số khách — bot gửi số phi lý không làm hỏng báo cáo.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form('B', '0900000001', NULL, 'outbound', NULL,
  2147483647, 2147483647, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT so_nguoi_lon FROM lead), 1000, '3a. so_nguoi_lon clamp 1000');
SELECT test_assert_eq((SELECT so_nguoi_em FROM lead), 1000, '3b. so_nguoi_em clamp 1000');

SELECT test_reset();
SELECT create_lead_from_form('C', '0900000002', NULL, 'outbound', NULL,
  -50, -50, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT so_nguoi_lon FROM lead), 1, '3c. số âm → sàn 1');
SELECT test_assert_eq((SELECT so_nguoi_em FROM lead), 0, '3d. số âm → sàn 0');

------------------------------------------------------------------------------
-- 4. Rate-limit 1 — cùng SĐT trong 1 phút bị chặn.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form('D', '0912345678', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('D', '0912345678', NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '4a. cùng SĐT trong 1 phút bị chặn');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 1, '4b. không tạo lead thứ 2');

-- Chuẩn hoá: đổi dấu cách / gạch ngang KHÔNG né được rate-limit.
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('D', '0912-345-678', NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '4c. SĐT khác định dạng vẫn bị chặn');
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('D', '0912 345 678', NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '4d. SĐT có dấu cách vẫn bị chặn');

-- SĐT khác → cho qua (rate-limit không được chặn nhầm khách thật).
SELECT create_lead_from_form('E', '0987654321', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 2, '4e. SĐT khác vẫn tạo được');

------------------------------------------------------------------------------
-- 5. Rate-limit 1 theo email khi KHÔNG có SĐT.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form('F', NULL, 'f@example.com', 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('F', NULL, 'F@Example.COM', 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '5a. cùng email (khác hoa/thường) bị chặn');
SELECT create_lead_from_form('G', NULL, 'g@example.com', 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 2, '5b. email khác vẫn tạo được');

------------------------------------------------------------------------------
-- 6. Rate-limit hết hạn — lead cũ hơn 1 phút KHÔNG chặn khách quay lại.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT create_lead_from_form('H', '0911111111', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
UPDATE lead SET created_at = now() - interval '5 minutes';
SELECT create_lead_from_form('H', '0911111111', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 2, '6. quá 1 phút → gửi lại được');

------------------------------------------------------------------------------
-- 7. Rate-limit 2 — trần burst toàn cục, chặn bot randomize SĐT.
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO lead (ho_ten, so_dien_thoai, created_at)
SELECT 'bot' || i, '09990000' || lpad(i::text, 2, '0'), now()
FROM generate_series(1, 29) i;
-- 29 lead trong 1 phút → chưa chạm ngưỡng 30, vẫn cho qua.
SELECT create_lead_from_form('I', '0922222222', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 30, '7a. dưới ngưỡng vẫn cho qua');
-- Giờ đã 30 → chặn.
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('J', '0933333333', NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '7b. chạm ngưỡng 30/phút → chặn burst');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 30, '7c. không tạo thêm');

-- Lead cũ không tính vào cửa sổ → hệ thống tự phục hồi, không khoá vĩnh viễn.
UPDATE lead SET created_at = now() - interval '5 minutes';
SELECT create_lead_from_form('K', '0944444444', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 31, '7d. qua cửa sổ → nhận lead lại');

------------------------------------------------------------------------------
-- 8. Validate bắt buộc — giữ nguyên hành vi cũ.
------------------------------------------------------------------------------
SELECT test_reset();
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('   ', '0900000009', NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '8a. ho_ten rỗng → lỗi');
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('L', NULL, NULL, 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '8b. thiếu cả SĐT lẫn email → lỗi');
SELECT test_expect_raise(
  $q$ SELECT create_lead_from_form('M', '   ', '  ', 'outbound', NULL,
      1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form') $q$,
  '8c. SĐT/email chỉ có khoảng trắng → lỗi');
SELECT test_assert_eq((SELECT count(*)::int FROM lead), 0, '8d. không lead nào được tạo');

------------------------------------------------------------------------------
-- 9. Round-robin assign — giữ nguyên logic cũ (không hồi quy).
------------------------------------------------------------------------------
SELECT test_reset();
INSERT INTO user_roles (user_id, bo_phan, active, phan_loai_tour) VALUES
  ('11111111-1111-1111-1111-111111111111', 'sales', true, ARRAY['outbound']),
  ('22222222-2222-2222-2222-222222222222', 'sales', true, ARRAY['outbound']);
SELECT create_lead_from_form('N', '0955555555', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq(
  (SELECT assigned_to FROM lead), '11111111-1111-1111-1111-111111111111'::uuid,
  '9a. assign cho sales chưa từng nhận lead');
UPDATE lead SET created_at = now() - interval '5 minutes';
SELECT create_lead_from_form('O', '0966666666', NULL, 'outbound', NULL,
  1, 0, NULL, NULL, NULL, NULL, NULL, 'web_form');
SELECT test_assert_eq(
  (SELECT assigned_to FROM lead ORDER BY id DESC LIMIT 1),
  '22222222-2222-2222-2222-222222222222'::uuid,
  '9b. lead sau xoay sang sales còn lại');

SELECT 'Tất cả test create_lead_from_form ĐÃ PASS' AS ket_qua;
