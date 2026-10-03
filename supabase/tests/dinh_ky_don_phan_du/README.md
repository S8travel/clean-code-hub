# Tests: dinh_ky_don_phan_du

Test SQL cho migration `supabase/migrations/20261003_dinh_ky_don_phan_du.sql`:
hàm `dinh_ky_don_phan_du` + trigger `trg_dinh_ky_don_phan_du` (tự dồn phần ĐNTT
định kỳ đang vượt chi phí của một dòng sang dòng còn thiếu cùng phiếu / cùng
NCC × kỳ) + bước dọn dữ liệu đang lệch lúc chạy migration.

## Cấu trúc

- `schema.sql` — bảng + cột hàm đọc/ghi, `auth.uid()` giả (đọc GUC `test.uid`),
  `is_tk_chi_xem()` bản sao prod. Chạy trong **database riêng** (`dinh_ky_test`) vì bộ
  `recalc_chi_phi_payment_status` dùng chung tên bảng nhưng ít cột hơn.
- `seed_lech.sql` — dữ liệu đang lệch có từ trước migration. Nạp **trước** migration
  để bước 4 (dọn dữ liệu) chạy đúng như khi apply lên prod.
- `test.sql` — A: kết quả bước dọn; B–M: trigger (cùng phiếu, tràn sang cùng NCC × kỳ
  và các dòng bị loại, hết chỗ, chỉ dồn phần vừa giảm, phiếu đã trả, không định kỳ,
  không đổi / tăng giá, nhiều dòng một câu UPDATE, phiếu đã hủy, giảm qua
  `thanh_tien_thuc_te`); N: tài khoản chỉ xem (hàm chặn, trigger nuốt lỗi + ghi nhật
  ký); P/S: công nợ ghi trước rồi mới giảm (trên phiếu định kỳ / phiếu per-đoàn cùng
  dòng) → không dồn; Q: dòng đổi NCC; R: số lẻ; O: `chia_theo_ty_le`.
- Hàm `recalc_chi_phi_payment_status` lấy từ migration
  `20261003b_recalc_khoa_dong_truoc.sql` (như bộ recalc) — bản prod có guard chỉ xem.
- Đồng thời (khóa, SKIP LOCKED, lock_timeout) không test được bằng một phiên psql —
  đã kiểm bằng 2 phiên trên PostgreSQL thật lúc review.

## Chạy local

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=test --name pg-dinh-ky-test postgres:15
sleep 2
psql "postgres://postgres:test@localhost:54329/postgres" -c "CREATE DATABASE dinh_ky_test"
psql "postgres://postgres:test@localhost:54329/dinh_ky_test" -v ON_ERROR_STOP=1 \
  -f supabase/tests/dinh_ky_don_phan_du/schema.sql \
  -f supabase/migrations/20261003b_recalc_khoa_dong_truoc.sql \
  -f supabase/tests/dinh_ky_don_phan_du/seed_lech.sql \
  -f supabase/migrations/20261003_dinh_ky_don_phan_du.sql \
  -f supabase/tests/dinh_ky_don_phan_du/test.sql
docker stop pg-dinh-ky-test
```

## Chạy trên CI

Job `db-test` trong `.github/workflows/ci.yml` (cùng container với 2 bộ kia, database riêng).
