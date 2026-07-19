# Tests: create_lead_from_form

Test SQL cho `public.create_lead_from_form` — RPC **ghi công khai**, `anon` có
`GRANT EXECUTE` (form lead public + FB webhook đều gọi hàm này).

Vì anon gọi được, hàm là bề mặt tấn công trực tiếp vào DB. Rào chắn duy nhất là
cap độ dài text + rate-limit bên trong hàm → phải có test gác.

## Cấu trúc

- `schema.sql` — minimal table (5 bảng) chỉ chứa cột hàm đọc/ghi, + role stub
  (`anon`/`authenticated`/`service_role`) để câu `GRANT` cuối migration chạy được
  trên Postgres thuần, + stub `find_or_create_khach_hang`.
- `test.sql` — 9 nhóm case. Fail → exit code ≠ 0 → CI đỏ.
- Function source: lấy thẳng từ `supabase/migrations/20260720_harden_create_lead_from_form.sql`.
  KHÔNG duplicate trong test/ — single source of truth.

> `find_or_create_khach_hang` trong `schema.sql` là **stub**, không phải hàm thật.
> Hàm thật làm dedup theo `sdt_norm` và gọi `auth.uid()` — ngoài phạm vi test này.
> Stub vẫn INSERT vào `khach_hang` để bắt được trường hợp giá trị truyền xuống
> chưa bị cap.

## Chạy local

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=test --name pg-lead-test postgres:15
sleep 2
psql "postgres://postgres:test@localhost:54329/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/create_lead_from_form/schema.sql \
  -f supabase/migrations/20260720_harden_create_lead_from_form.sql \
  -f supabase/tests/create_lead_from_form/test.sql
docker stop pg-lead-test
```

## Chạy trên CI

Job `db-test` trong `.github/workflows/ci.yml` (dùng chung container với bộ test
`recalc_chi_phi_payment_status`; bảng của 2 bộ không trùng tên).

## Khi sửa hàm

1. Tạo migration mới `CREATE OR REPLACE FUNCTION create_lead_from_form ...`.
2. Trỏ step `Load function (create_lead_from_form)` trong CI tới migration mới.
3. Cập nhật test nếu ngưỡng cap / rate-limit đổi.

## Test cases

1. Golden path — lead + activity + diem_den + khach_hang
2. **Cap độ dài** — bơm 500KB–1MB vào mọi trường text, assert đúng ngưỡng
   (ho_ten 200, sdt 50, email 200, loai_tour 20, diem_den 200, yeu_cau/ghi_chu 2000,
   nguon 50) + giá trị truyền xuống `khach_hang` cũng đã cap
3. Clamp số khách — `2147483647` → 1000; số âm → sàn 1/0
4. **Rate-limit 1 (SĐT)** — cùng SĐT trong 1 phút bị chặn; đổi định dạng
   (`0912-345-678`, `0912 345 678`) vẫn bị chặn; SĐT khác vẫn qua
5. **Rate-limit 1 (email)** — khi không có SĐT, khớp theo email không phân biệt hoa/thường
6. Hết hạn rate-limit — lead cũ > 1 phút không chặn khách quay lại
7. **Rate-limit 2 (burst)** — 29 lead/phút vẫn qua, chạm 30 thì chặn, qua cửa sổ
   thì nhận lại (không khoá vĩnh viễn)
8. Validate bắt buộc — ho_ten rỗng / thiếu cả SĐT lẫn email → lỗi
9. Round-robin assign — không hồi quy logic phân sales
