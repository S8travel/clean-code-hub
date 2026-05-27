# Tests: recalc_chi_phi_payment_status

Test SQL cho hàm `public.recalc_chi_phi_payment_status` — "nguồn chân lý" cho
trạng thái thanh toán chi phí. Hàm này thuần plpgsql, không phụ thuộc Supabase
auth/RLS → dùng Postgres container thuần là đủ.

## Cấu trúc

- `schema.sql` — minimal table (4 bảng) chỉ chứa cột mà hàm đọc/ghi.
- `test.sql` — 12 test cases, mỗi case wrap trong `DO $$ ... ASSERT ... $$`. Fail → exit code ≠ 0.
- Function source: lấy thẳng từ migration `supabase/migrations/20260521_dntt_tu_choi_no_commitment.sql`
  (định nghĩa mới nhất của hàm). KHÔNG duplicate trong test/ — keep single source of truth.

## Chạy local

```bash
# Cần postgres client (psql) trong PATH
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=test --name pg-recalc-test postgres:15
sleep 2
psql "postgres://postgres:test@localhost:54329/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/recalc_chi_phi_payment_status/schema.sql \
  -f supabase/migrations/20260521_dntt_tu_choi_no_commitment.sql \
  -f supabase/tests/recalc_chi_phi_payment_status/test.sql
docker stop pg-recalc-test
```

> ⚠️ Migration 20260521 cuối file có `SELECT recalc_chi_phi_payment_status(...)` chạy
> backfill — vô hại trên DB rỗng (array rỗng, không update gì).

## Chạy trên CI

Job `db-test` trong `.github/workflows/ci.yml` tự spin up `postgres:15` service
container và chạy tự động trên mọi push/PR. Fail → CI đỏ → block merge.

## Khi sửa migration

Nếu sửa logic hàm `recalc_chi_phi_payment_status`:
1. Tạo migration mới với `CREATE OR REPLACE FUNCTION ...`.
2. Cập nhật path trong CI job (`Run function migration` step) trỏ tới migration mới nhất.
3. Cập nhật test cases nếu behavior thay đổi.

## Test cases (12)

1. Empty allocations → reset zero/unpaid/chua_de_nghi
2. cho_duyet → counted in da_dntt, status cho_duyet
3. da_duyet no payment → da_duyet status (has_da_duyet_unpaid)
4. partial payment → pro-rata da_tt, partial_paid
5. full payment → paid + da_thanh_toan
6. tu_choi → excluded (fix migration 20260521)
7. da_huy → excluded
8. paid full nhưng alloc < total → thanh_toan_mot_phan branch
9. thanh_tien_thuc_te override → so sánh dùng thuc_te
10. id ngoài array → KHÔNG bị đụng
11. cho_duyet override precedence (wins over da_duyet)
12. overpayment → capped at alloc (LEAST 1.0)
