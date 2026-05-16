# 🧩 Phân việc đoàn theo sự kiện — Spec (chờ duyệt)

> Pipeline: tạo đoàn → modal phân việc → giao việc + thông báo đa người.
> Tái cấu trúc trên hệ `cong_viec` + `thong_bao` sẵn có (KHÔNG dựng song song).

## 0. Quyết định đã chốt
- Phân việc = rows `cong_viec` với bộ `loai_viec` cố định (prefix `pv_`). Không bảng mới.
- **Cột OP = người phụ trách Nhà hàng & DV** (suy từ phân việc), KHÔNG còn đọc `doan.assigned_to`. `assigned_to` = người tạo/chủ đoàn.
- Giám đốc nhận **mọi đoàn** (theo role `giam_doc`, không hardcode tên).
- Người điều-phối (Xuân) = **config theo role/flag**, không hardcode tên.
- Default đầu việc theo `loai_tour` (inbound/outbound/nội địa) — bảng dưới.

## 1. Bộ đầu việc + default theo loại tour
`loai_viec`: `pv_ks` · `pv_nh_dv` · `pv_xe` · `pv_visa` · `pv_ve_mb` (+ `pv_phancong` cho điều-phối).

| Đầu việc | Inbound | Outbound | Nội địa |
|---|---|---|---|
| Khách sạn (default = người tạo đoàn) | ✓ | ✓ | ✓ |
| Nhà hàng & DV (= OP) | ✓ | ✓ | ✓ |
| Xe | ✓ | ✓ | ✓ |
| Visa | ◻ hiện, không tích | ✓ | ✗ ẩn |
| Vé máy bay | ✗ ẩn | ◻ hiện, không tích | ◻ hiện, không tích |

✓ = hiện + tích sẵn · ◻ = hiện + KHÔNG tích · ✗ = ẩn (không áp dụng).
Default là **gợi ý sửa được** trong modal; có thể chuyển sang bảng config sau.

## 2. Data model (không migration bảng mới cho phần lõi)
- Dùng `cong_viec`: `doan_id`, `nguoi_giao` (người tạo đoàn / hệ thống), `nguoi_nhan` (người phụ trách), `loai_viec` (`pv_*`), `do_uu_tien`, `han_xu_ly`, `trang_thai` (`moi|dang_lam|xong|huy`), `ghi_chu_ket_qua`.
- `thong_bao`: phát cho người nhận + giám đốc, link `cong_viec_id` + `doan_id` (NotificationBell/`useThongBaoCount`/MyJob tự nhận).
- **Idempotent**: 1 đoàn không quá 1 `cong_viec` active / `loai_viec` (check trước insert; mở lại modal không nhân đôi).
- Điều-phối + giám đốc: xác định qua `user_roles` (role `giam_doc`; điều-phối = 1 flag/role — KHÔNG bảng config mới để khỏi vướng GRANT/RLS). *(Cần chốt: lấy field nào trên user_roles làm cờ điều-phối.)*

## 3. Trigger — PHỦ MỌI ĐƯỜNG TẠO ĐOÀN
1. **DoanDrawer tạo mới** → sau khi lưu doan → mở **Modal phân việc**.
2. **Chốt lead** (`useConvertLeadToDoan`) → tạo doan KHÔNG qua DoanDrawer → vẫn phải mở Modal phân việc (hoặc auto gán mặc định + báo điều-phối). *(Chốt: bật modal hay auto.)*
3. **Nhân bản đoàn** (Clone) → KHÔNG copy người phụ trách; mở modal phân việc mới.

## 4. Modal phân việc (UX)
```
┌ Phân việc — Đoàn S8HAN… ───────────────────────────┐
│ Agent: Guo · Hà Nội · 25 khách · 18/5 → 22/5        │
│ ─────────────────────────────────────────────────── │
│ [✓] Khách sạn      [▼ người tạo đoàn]               │
│ [✓] Nhà hàng & DV  [▼ chọn…]            (= OP)      │
│ [✓] Xe             [▼ chọn…]                        │
│ [◻] Visa           [▼ chọn…]                        │
│ [ ] Vé máy bay     [▼ chọn…]                        │
│              [Huỷ]            [Xác nhận phân việc]   │
└──────────────────────────────────────────────────────┘
```
- Dropdown người: lọc theo bộ phận hợp lệ (điều hành); KS default = người tạo (nếu người tạo không hợp lệ → để trống → coi như "thiếu người").
- **Huỷ modal**: đoàn vẫn tồn tại → mặc định gán KS = người tạo, các mục tích còn lại = trống → sinh việc cho điều-phối (không để đoàn "mồ côi phân việc").
- Không `<form>` (theo convention dự án).

## 5. Sau khi xác nhận → hệ thống làm
1. Mục được tích + có người → insert `cong_viec` (`trang_thai='moi'`), `thong_bao` cho `nguoi_nhan`: "Đoàn X — bạn phụ trách [việc]" (deep-link đoàn).
2. Mục được tích + KHÔNG người → 1 `cong_viec` `pv_phancong` giao **điều-phối**: "Đoàn X thiếu người: [Xe, Visa] — phân giúp" + `thong_bao`.
3. **Giám đốc** (role `giam_doc`): `thong_bao` tổng/đoàn: "Đoàn X · KS=A · NH&DV=B · Xe=? …".
4. Cột OP đoàn = `nguoi_nhan` của `cong_viec` `pv_nh_dv`.

## 6. Vòng đời sau tạo (edge — phần user dễ bỏ sót)
- **Điều-phối gán bù**: panel cho điều-phối chọn người cho mục thiếu → tạo `cong_viec` mục đó + `thong_bao` người mới → `cong_viec` `pv_phancong` chuyển `xong` khi hết mục thiếu.
- **Đổi người phụ trách** (panel ở DoanDetail): báo người cũ (huỷ việc cũ) + người mới; nếu là NH&DV → cột OP đổi theo.
- **Đoàn đổi ngày/số khách/địa điểm**: `thong_bao` cho tất cả người phụ trách đoàn ("đoàn bạn phụ trách đã đổi …"). *(Chốt: chỉ vài field material.)*
- **Đoàn huỷ** (`trang_thai='huy'`): set các `cong_viec pv_*` của đoàn → `huy` + `thong_bao` "đoàn huỷ, dừng việc" cho người phụ trách + giám đốc.
- **Lịch sử**: ghi log đổi phân việc (ai/khi) — dùng `ghi_chu_ket_qua` hoặc bảng log nhẹ. *(Chốt mức độ.)*

## 7. Refactor cột OP — phạm vi (ripple, làm đồng bộ)
OP suy từ phân việc NH&DV thay vì `doan.assigned_to`. Sửa các nơi đọc OP:
- `src/components/DoanTable.tsx` (`getOpName`)
- `src/hooks/use-dashboard.ts` (thống kê theo OP)
- `src/pages/Index.tsx` (filter "Tất cả OP")
- `src/pages/MyJobPage.tsx` (nếu lọc theo OP)
→ Tạo 1 helper chung "OP của đoàn = nguoi_nhan cong_viec pv_nh_dv" để 4 nơi dùng chung (tránh lệch logic). `assigned_to` giữ nguyên cho các chỗ khác (chủ đoàn/quyền).

## 8. Phân quyền
- Ai mở modal/sửa phân việc: người tạo đoàn + điều-phối + giám đốc + (điều hành?). *(Chốt.)*
- Người phụ trách chỉ thấy việc của mình (MyJob đã có) + đoàn liên quan.

## 9. Phasing
- **MVP**: Modal khi tạo (DoanDrawer) + insert cong_viec + thông báo người nhận + giám đốc + việc cho điều-phối + refactor cột OP. (Đủ chạy.)
- **Kế tiếp**: phủ đường chốt-lead & clone · panel đổi người ở DoanDetail · báo khi đổi ngày/huỷ đoàn · vòng đóng việc điều-phối.

## 10. Chốt nốt vài vi-điểm trước khi build
1. Cờ "điều-phối" lấy ở đâu trên `user_roles` (role riêng? thêm 1 cột boolean? — đề xuất: thêm `user_roles.la_dieu_phoi boolean` ALTER, không cần GRANT).
2. Chốt-lead: bật modal phân việc hay auto-gán-mặc-định-rồi-báo-điều-phối (đề xuất: auto + báo điều-phối, vì luồng chốt lead đang nhanh-gọn).
3. Trường "material" trigger báo-đổi: `ngay_di, ngay_ve, so_khach*`, `dia_diem_id`? (đề xuất đúng 4 nhóm này).
4. Quyền sửa phân việc: đề xuất người tạo + điều-phối + giám đốc.

Duyệt spec (gật/sửa mục 10) → mình build theo Phase MVP, mỗi bước 1 commit + verify tsc/build + push như các module trước.
