# Test Cases — Feature "1 đoàn → N nhóm"

Áp dụng cho branch `feat/doan-nhom-phase2-ui` (PR #71).

## Vicky case (golden path)

> 1 đoàn 100 khách = 75 tham quan + 25 golf. 2 nhóm lunch khác NH, dinner cùng NH, KS chung.

### TC-01 — Backward compat: đoàn cũ (1 nhóm)

**Goal**: User KHÔNG bị break khi đoàn không tách nhóm.

1. Mở 1 đoàn bất kỳ → tab **Điều Tour**
2. ✅ Hiện 1 button "**Tách thành nhiều nhóm**" ở góc phải (không tabs nhóm)
3. Sửa thanh phố / thêm cảnh điểm / chọn NH → blur 2s → toast "Đã lưu"
4. F5 reload → data giữ nguyên
5. Mở tab **Chi phí** → cảnh điểm + NH section hiển thị đúng như cũ
6. Mở tab **Booking KS/NH/DV** → hiển thị đúng

**Pass** = không có lỗi mới so với trước Phase 1+2.

---

### TC-02 — Tạo đoàn mới

1. Vào /danh-sach-doan → "Tạo đoàn mới" → fill form → Save
2. ✅ Đoàn xuất hiện trong list
3. Mở đoàn → tab Điều Tour
4. ✅ Hiện đúng số ngày theo `ngay_di - ngay_ve`
5. ✅ Hiện button "Tách thành nhiều nhóm" (chứng tỏ DB trigger đã tạo nhóm "Toàn đoàn")
6. Save tour bình thường — không lỗi FK

**Pass** = DB trigger `doan_auto_create_nhom_default` work.

---

### TC-03 — Tách thành nhóm 2

1. Mở đoàn có sẵn (vẫn 1 nhóm)
2. Click "**Tách thành nhiều nhóm**" → toast "Đã thêm nhóm mới"
3. ✅ UI chuyển sang tabs: "Toàn đoàn | Nhóm 2 | + Thêm nhóm"
4. ✅ Active tab tự switch sang "Nhóm 2"
5. ✅ Danh sách days **trống** (nhóm 2 chưa có lịch trình)
6. Click tab "**Toàn đoàn**" → lịch trình cũ vẫn còn nguyên

**Pass** = nhóm 1 + 2 có data độc lập.

---

### TC-04 — Đổi tên + số khách nhóm

1. Đang ở tab nhóm 2 (active) → click icon ✏️
2. Modal hiện ra: nhập tên "Nhóm golf 25 khách", set Khách lớn = 25
3. Click "Lưu" → toast "Đã lưu nhóm"
4. ✅ Tab title đổi thành "Nhóm golf 25 khách (25)"

---

### TC-05 — Thêm lịch trình cho nhóm 2

1. Đang ở tab "Nhóm golf 25 khách"
2. Day 3 → set Trưa = MONTGOMERIE GOLF, set_menu = "lunch buffet"
3. Day 3 → thêm cảnh điểm "Sân golf 18 hố"
4. Blur 2s → "Đã lưu"
5. F5 reload trang
6. ✅ Tab "Nhóm golf" → vẫn còn data đã save
7. Switch sang tab "Toàn đoàn" → KHÔNG có golf data trong day 3

**Pass** = filter `doan_nhom_id` hoạt động đúng ở client.

---

### TC-06 — NH section ở tab Chi phí (KIỂM TRA KỸ)

**Đây là trọng tâm Phase 3** — verify chi phí có hiển thị đúng theo nhóm.

1. Đoàn 2 nhóm:
   - Nhóm 1: day 3 lunch = BUFFET VINWONDER (75 khách)
   - Nhóm 2: day 3 lunch = MONTGOMERIE GOLF (25 khách)
2. Mở tab **Chi phí** → section NH
3. ✅ Hiện CẢ 2 meal rows? Hoặc gộp 1? **Báo lại behavior thực tế.**
4. Nếu hiện 2 rows: số khách + đơn giá + tổng đúng theo từng nhóm
5. Nếu hiện 1 row gộp: ⚠️ Phase 3 phải fix

**Expected** (Phase 3): hiện 2 rows tách rõ ràng.

---

### TC-07 — Booking NH ở tab Booking

1. Mở tab **Booking NH** trong cùng đoàn 2 nhóm
2. ✅ Hiện 1 list meals (bao gồm cả lunch 2 nhóm)?
3. ✅ Có cách phân biệt nhóm nào không? (vd icon, ghi chú)
4. **Báo lại behavior + đề xuất nếu UX confusing**

---

### TC-08 — Xóa nhóm

1. Đang ở tab "Nhóm golf 25 khách" có lịch trình
2. Click icon 🗑 → confirm modal hiện
3. Click "Xóa nhóm" → toast "Đã xóa nhóm"
4. ✅ Tabs còn lại chỉ "Toàn đoàn" → ẩn tabs (chỉ còn button "Tách...")
5. Tab Chi phí: chi phí của nhóm golf đã biến mất (CASCADE)
6. Tab Booking NH: meals của nhóm golf đã biến mất

---

### TC-09 — Không thể xóa nhóm cuối

1. Đoàn còn 1 nhóm duy nhất (sau TC-08)
2. UI không hiện tabs → không có nút xóa
3. Thử gọi `useDeleteDoanNhom` thẳng từ DevTools console:
   ```js
   // Should throw error
   ```
4. ✅ Toast error "Đoàn phải có ít nhất 1 nhóm"

---

### TC-10 — Áp seri (apply seri tour)

1. Đoàn mới → tab Điều Tour
2. Áp seri (vd "Seri 5N4Đ Đài Loan")
3. ✅ Lịch trình + cảnh điểm seri append vào nhóm "Toàn đoàn" (active tab)
4. Tách nhóm 2 → tab nhóm 2 trống (seri KHÔNG nhân đôi sang nhóm 2)

**Phase 3 enhancement**: tùy chọn "Áp seri vào nhóm hiện tại" / "Tất cả nhóm".

---

### TC-11 — Cascade khi sửa ngày đoàn

1. Đoàn 2 nhóm, mỗi nhóm có 5 ngày
2. Mở DoanDrawer → sửa `ngay_ve` thêm 1 ngày → save
3. ✅ Nhóm "Toàn đoàn": tự thêm 1 doan_ngay mới (ngay_so 6)
4. ✅ Nhóm "Nhóm golf": KHÔNG tự thêm (vì cascade chỉ hit nhóm default)
5. **Báo lại**: có nên cascade cho tất cả nhóm không? Hoặc chỉ default?

---

### TC-12 — Export Word

1. Đoàn 2 nhóm
2. Tab Điều Tour → click "Xuất Word"
3. ✅ Word in lịch trình của nhóm active hiện tại (vì query đã filter)
4. **Phase 3 enhancement**: nút "In tất cả nhóm" hoặc dropdown chọn nhóm in

---

## Edge cases — báo nếu gặp

| Case | Mô tả | Expected |
|---|---|---|
| EC-01 | Đoàn 0 nhóm (bug seed?) | Trigger DB auto-create → không xảy ra |
| EC-02 | 1 đoàn có 3+ nhóm | Tabs hiển thị scroll horizontal |
| EC-03 | Tên nhóm có ký tự đặc biệt (`<`, `'`) | Hiển thị safe, không XSS |
| EC-04 | 2 nhóm cùng `thu_tu` | UNIQUE constraint chặn → toast error |
| EC-05 | Xóa đoàn (CASCADE) | Nhóm + doan_ngay + items xóa hết |
| EC-06 | Khôi phục đoàn đã xóa | Không thể (hard delete) |
| EC-07 | Concurrent edit 2 user 2 nhóm khác | Không conflict (mỗi nhóm doan_ngay riêng) |
| EC-08 | Realtime: máy khác tạo nhóm | Tabs hiện ra qua invalidate query (cần verify) |

---

## Sau khi test

Báo lại theo format:

```
TC-01: ✅ Pass
TC-02: ✅ Pass
TC-03: ⚠️ Tabs hiện nhưng tự switch tab không hoạt động
TC-06: ⚠️ Chi phí gộp 1 row — phải fix Phase 3
...
```

Mình sẽ scope Phase 3 dựa vào gaps cụ thể.

## Phase 3 dự kiến (chờ test results)

Dựa vào pattern Phase 2:
- Hook `useChiPhiList`, `useBookingNH`, `useChiPhiNHSection`, `useBookingKS`, `useBookingDV` → nhận thêm `doanNhomId` param, filter qua join `doan_ngay`
- Render `DoanNhomTabs` ở các tab khác (Chi phí, Booking) — share state `activeNhomId` từ DoanDetail
- KS / Visa / Xe / Bảo hiểm: thuộc đoàn-level (không gắn nhóm) — hiển thị tổng đoàn
- Export Word: option "in nhóm hiện tại" / "in gộp tất cả nhóm"
