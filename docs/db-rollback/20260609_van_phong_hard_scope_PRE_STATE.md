# PRE-STATE SNAPSHOT — trước migration `20260609_van_phong_hard_scope`

> Chụp lúc 2026-06-09, project `lflsbwoqzmbknzdpaequ`, TRƯỚC khi apply RLS tường cứng theo văn phòng.
> Dùng để rollback nếu policy mới khoá nhầm người. Rollback script: `20260609_van_phong_hard_scope_DOWN.sql`.

## 1. Bản chất thay đổi (rủi ro rollback = THẤP)

- **KHÔNG mutate dữ liệu hàng**: chỉ thêm 1 cột nullable `user_roles.van_phong_ids` (default NULL)
  + thay policy + thêm 3 helper function. Mọi giá trị `doan.van_phong_id`, `user_roles.van_phong_id`
  giữ NGUYÊN. → Rollback thuần DDL, không cần phục hồi data.
- Toàn bộ scope cũ vốn chỉ là client-side (RLS thật = `auth.uid() IS NOT NULL`).

## 2. Policy hiện tại (12 bảng — ĐỒNG NHẤT)

Mọi bảng dưới đây có **đúng 1 policy** `auth_required`:

```
policyname : auth_required
cmd        : ALL
permissive : PERMISSIVE
roles      : {public}
qual       : (auth.uid() IS NOT NULL)
with_check : (auth.uid() IS NOT NULL)
```

Bảng áp dụng:
`doan`, `doan_ngay`, `doan_ngay_item`, `doan_chi_phi`,
`doan_booking_ks`, `doan_booking_nh`, `doan_booking_dv`, `doan_ks_dem`,
`de_nghi_thanh_toan`, `dntt_allocations`, `payments`, `cong_no`.

> DOWN script tái tạo CHÍNH XÁC policy này cho từng bảng.

## 3. Đường join tới `doan.van_phong_id` (để hiểu policy mới)

| Bảng | Cách resolve VP |
|---|---|
| `doan` | `van_phong_id` trực tiếp |
| `doan_ngay`, `doan_ngay_item`, `doan_chi_phi`, `doan_booking_ks/nh/dv`, `doan_ks_dem`, `de_nghi_thanh_toan`, `cong_no` | `doan_id` → `doan.van_phong_id` |
| `payments` | `dntt_id` → `de_nghi_thanh_toan.doan_id` → `doan.van_phong_id` |
| `dntt_allocations` | `chi_phi_id` → `doan_chi_phi.doan_id` → `doan.van_phong_id` |

## 4. State dữ liệu lúc chụp

- 3 văn phòng: `1=Văn Phòng Quảng Ninh`, `2=Chi Nhánh Hà Nội`, `3=Trụ Sở Đà Nẵng`
- 301 đoàn — **2 đoàn `van_phong_id IS NULL`** (id 355, 358 — chỉ privileged thấy; assign VP qua UI sau)
- 26 user active — **8 thiếu `van_phong_id` TRƯỚC migration**, được backfill ở mục 1b:
  - → Hà Nội (2): Xe Tour, Nghĩa Nguyễn (admin), Test, Nguyễn Tiến Dũng (GĐ), Nguyễn Quang Huy (KT), Nguyễn Chí Linh (TP KT), Đỗ Xuân Huyên (KT)
  - → Đà Nẵng (3): Đỗ Phan Thục Nhi (KT)
- Phân bố sau backfill: HN(2)=12 user, ĐN(3)=14 user, QN(1)=0 user active
- **Seed van_phong_ids (mục 1c)**: HN(2) ↔ ĐN(3) xem chéo nhau; QN(1) tách riêng.
  → Thực tế hiện tại mọi user thấy HN+ĐN; tường cứng cô lập QN + hạ tầng cho tương lai.

## 5. Quy tắc bypass / scope trong policy mới

- **Cross-VP (bypass mọi VP)**: CHỈ `admin` | `giam_doc`.
- **Kế toán (`bo_phan='ke_toan'`)**: KHÔNG bypass — bị scope theo VP như điều hành.
  Xem nhiều VP → tích `van_phong_ids`. NGOẠI LỆ: bản ghi định kỳ/aggregate
  (`de_nghi_thanh_toan`/`cong_no`/`payments` có `doan_id IS NULL`) → kế toán VẪN thấy
  (định kỳ gộp nhiều VP, không quy về 1 VP). Helper `current_user_is_accounting()`.
- **Còn lại (điều hành)**: chỉ các VP trong `van_phong_ids ∪ {van_phong_id}`.
- Đoàn `van_phong_id IS NULL` → chỉ cross-VP.

## 6. Quy trình rollback khi sự cố

```
1. Apply DOWN script qua MCP apply_migration / supabase db (xem file _DOWN.sql)
   → khôi phục policy auth_required + drop helper + drop cột.
2. Revert PR client (git revert) để UI thôi gọi scope đa-VP.
```
Cột `van_phong_ids` có thể GIỮ lại (nullable, vô hại) nếu chỉ muốn tắt RLS gấp — DOWN
script vẫn drop để sạch.
