# 🧪 Manual Test Scenarios — S8 Travel CRM

**Mục đích**: Verify các bug fixes + pattern HYBRID mới (Điều tour ↔ Chi phí).
**Cách dùng**: Làm theo từng scenario. Nếu kết quả lệch số "Mong đợi" → báo lại.
**Tổng thời gian**: ~90 phút cho cả 9 scenarios.

> ⚠️ **Trước khi test**: tạo 1 đoàn mới (vd "Test Manual 2026-05") để dễ dọn sau khi xong. Đừng test trên đoàn thật.

---

## 📋 Phần A — Tests cho pattern HYBRID mới (Điều tour ↔ Chi phí)

### Scenario 1 — Cascade rebooking thuần (chưa override)

> **Verify**: Giảm số khách thành phần trong DoanDetail → tất cả chi phí cascade theo.
> Lưu ý: Số khách trong table Điều tour bị KHÓA, link với `doan.so_khach`. Phải sửa qua các trường khách thành phần (Lớn / Em1 / Em2 / Trẻ lớn) ở header DoanDetail.

**Setup**
- Tạo đoàn: **20 Khách lớn** (so_khach_lon=20, các trường khác=0) → tổng = 20
- 2 ngày, thêm cảnh điểm có phí: vé Cáp treo (giá 1.000.000đ/khách)
- Save đoàn (Save trên DoanDetail) → kích hoạt cascade INSERT chi phí

**Verify Setup** — vào tab Chi phí → Section Dịch vụ
- Row Cáp treo: SL=20, đơn giá=1.000.000đ, thành tiền=20.000.000đ
- Không có icon 🔒 (chưa override)

**Bước test**
1. Quay lại header DoanDetail → sửa **Số khách lớn**: 20 → 15 → tổng đoàn tự cập nhật về 15
2. Click **Save** trên DoanDetail
3. Quay lại tab Chi phí → Section Dịch vụ

**Mong đợi**
- Row Cáp treo: SL=**15**, đơn giá=1.000.000đ, thành tiền=**15.000.000đ** ✅
- Không có icon 🔒 (vẫn không override)
- DB: `doan.so_khach=15`, `doan_ngay_item.so_luong=15`, `doan_chi_phi.so_luong=15`

---

### Scenario 2 — Override bảo vệ khỏi cascade

> **Verify**: OP override 1 row → rebooking sau đó không đè row đã override.

**Setup**: đoàn 20, cảnh điểm Cáp treo + Vé bãi tắm (vd 500.000đ/khách)

**Bước test**
1. Vào Chi phí → Section Dịch vụ
2. Trên row Cáp treo, sửa SL: 20 → 19 → blur (click ra ngoài)
3. Verify: Row Cáp treo có icon 🔒 nhỏ (đã override)
4. Vào header DoanDetail → sửa **Số khách lớn**: 20 → 15 → Save
5. Quay lại Chi phí → Section Dịch vụ

**Mong đợi**
- Row **Cáp treo**: SL=**19** (giữ override), thành tiền=19.000.000đ, vẫn có 🔒
- Row **Bãi tắm**: SL=**15** (cascade sync), thành tiền=7.500.000đ, không 🔒

→ Override hoạt động đúng: 1 row được bảo vệ, các row khác vẫn theo Điều tour.

---

### Scenario 3 — Reset override → re-sync

> **Verify**: Click ↺ reset → row sync lại với Điều tour.

**Setup**: tiếp tục từ Scenario 2 (đoàn 15, Cáp treo SL=19 override)

**Bước test**
1. Trên row Cáp treo, click nút ↺ (reset)
2. Refresh page (F5)

**Mong đợi**
- Row Cáp treo: SL=**15** (sync lại từ Điều tour), 🔒 biến mất
- DB: `is_overridden = false`

---

### Scenario 4 — Lock UI khi đã thanh toán

> **Verify**: Input SL/đơn giá bị disable khi chi phí đã `paid` hoặc `partial_paid`. Phát sinh phải đi qua "Điều chỉnh".

**Setup**: tạo đoàn mới 20 khách, vé Cáp treo 1.150.000đ → tổng 23.000.000đ
1. Tạo DNTT 23.000.000đ cho row Cáp treo → duyệt → mark paid (cash)
2. Verify cột "TT Thanh toán" hiện "Đã TT [ngày]"

**Bước test**
1. Hover vào ô SL của row Cáp treo

**Mong đợi**
- Input SL **bị disable** (không click vào edit được)
- Tooltip hiện: *"Đã có thanh toán — dùng nút Điều chỉnh để track công nợ"*
- Tương tự với đơn giá → disabled
- Nút "Điều chỉnh" (icon ⚙️ hoặc tương tự) **vẫn enable**

3. Click "Điều chỉnh" → modal hiện → nhập số tiền thực tế = 21.850.000đ → Save

**Mong đợi sau Điều chỉnh**
- DB chi_phi: `thanh_tien_thuc_te = 21.850.000đ`, `so_luong = 20` (KHÔNG đổi)
- DB cong_no mới: số tiền = 1.150.000đ với NCC, status = `con_du`
- UI hiện cột "Đã cấn trừ" hoặc tương tự

---

### Scenario 5 — Thanh_tien_thuc_te cleared khi cascade

> **Verify**: Sau Điều chỉnh + cascade rebooking → `thanh_tien_thuc_te` được clear + có toast cảnh báo.

**Setup**: tiếp tục từ Scenario 4 (đoàn 20, Cáp treo có Điều chỉnh 21.85tr, công nợ 1.15tr)

**Bước test**
1. Vào header DoanDetail → sửa Số khách lớn: 20 → 15 → Save

**Mong đợi**
- Toast vàng (warning) hiện: *"Đã reset điều chỉnh thanh_tien_thuc_te trên 1 chi phí do thay đổi số khách/đơn giá."* (số có thể khác tùy data)
- DB chi_phi #Cáp treo: `thanh_tien_thuc_te = NULL` (reset), `so_luong = 15`, `thanh_tien = 15 × 1.15tr = 17.250.000đ`
- DB cong_no cũ 1.15tr: **GIỮ NGUYÊN** (entity độc lập, NCC vẫn nợ tiền)

→ User cần review công nợ cũ thủ công sau rebooking nếu cần.

---

### Scenario 6 — NH meal tiền không bị reset khi save Điều tour (Bug NH fix)

> **Verify**: Sửa tien_cong_ty trong NH section, save lại Điều tour → tiền không bị wipe về 0.

**Setup**
1. Tạo đoàn 10 khách, 1 ngày, có 1 bữa trưa (chọn nhà hàng X có set menu giá 200.000đ)
2. Save Điều tour
3. Vào tab Chi phí → Section Nhà hàng → bữa trưa có row mới

**Bước test**
1. Trong NH section, sửa SL khách = 10 (nếu chưa) → đơn giá = 200.000đ → blur save
2. Verify: cột tien_cong_ty = 2.000.000đ (10 × 200k)
3. Mở DB hoặc UI khác để confirm `doan_chi_phi` của bữa trưa: tien_cong_ty = 2.000.000đ
4. Vào Điều tour → đổi 1 thứ khác (vd ghi chú ngày, không sửa NH) → Save

**Mong đợi**
- Quay lại NH section: tien_cong_ty **VẪN = 2.000.000đ** (KHÔNG bị reset 0)
- DB: `tien_cong_ty = 2000000` không đổi

→ Bug cũ "save Điều tour wipe tien_cong_ty" đã fix.

---

### Scenario 7 — Pre-check DNTT khi xóa cảnh điểm (2-layer defense)

> **Verify**: User cố xóa cảnh điểm đã có DNTT → toast error tức thì, cảnh điểm vẫn ở UI (không bị xóa rồi mới fail save).

**Setup**
1. Tạo đoàn mới với cảnh điểm Cáp treo có phí
2. Tạo DNTT cho row Cáp treo → duyệt (KHÔNG cần paid)

**Bước test 1 — Layer 1 (proactive check)**
1. Vào Điều tour → tìm row cảnh điểm Cáp treo → click nút X (xóa)

**Mong đợi**
- Toast lỗi tiếng Việt hiện **NGAY LẬP TỨC** (chưa cần Save), vd: *"Cảnh điểm 'Cáp treo' đã có ĐNTT #102. Hủy ĐNTT trước khi xóa khỏi tour."*
- Cảnh điểm **VẪN CÒN trên UI** (item không bị remove khỏi list)
- Không cần click Save mới phát hiện lỗi
- DB chi_phi không thay đổi

**Bước test 2 — Layer 2 (safety net) — optional advanced**
> Nếu Layer 1 hoạt động đúng, Layer 2 không bao giờ kích hoạt trong workflow thường. Test này verify safety net.

1. Tạo race condition giả: mở 2 tab cùng đoàn
2. Tab A: xóa cảnh điểm (chưa có DNTT) → Save
3. Tab B: cùng lúc tạo DNTT cho cảnh điểm đó (FK vẫn còn vì chưa save A)
4. Tab A save sẽ fail

**Mong đợi**
- Toast lỗi hiện
- UI tab A **tự khôi phục** state từ DB (cảnh điểm hiện lại) nhờ Layer 2 invalidate queries

**Bước test 3 — Happy path**
1. Hủy ĐNTT trước (qua DNTTTab → cancel) → quay lại Điều tour
2. Click X xóa cảnh điểm → OK ngay (không toast lỗi)
3. Save tour → save thành công, DB chi_phi bị xóa

---

## 📋 Phần B — Tests cho các bug critical đã fix trước đó

### Scenario 8 — FOC khách sạn 2 đêm (Bug FOC formula)

> **Verify**: Số FOC trên UI = số trong DB. Trước fix: lệch nhau khi đoàn ở >1 đêm.

**Setup**
- KS test có `foc_khach=10, foc_mien=1`
- Đoàn 25 khách, 2 đêm

**Bước test**
1. Vào Chi phí → Section KS → thêm 10 phòng × 1.000.000đ/đêm cho cả 2 đêm

**Mong đợi**
- Tổng KS hiện: **18.000.000đ** (20 phòng × 1tr − 2 phòng FOC × 1tr)
- DB: SUM(`tien_cong_ty`) cho danh_muc='khach_san' của đoàn = 18.000.000đ
- ❌ FAIL nếu DB lưu 36.000.000đ (nhân nhầm `so_dem`)

---

### Scenario 9 — Điều chỉnh ĐNTT 2 lần không cộng dồn (Bug #1)

> **Verify**: Điều chỉnh lần 2 không cộng dồn lỗi từ lần 1.

**Setup**: đoàn có 1 chi phí 1.000.000đ → tạo DNTT → duyệt → paid (cash)

**Bước test**

**Lần 1**: Click "Điều chỉnh" trên DNTT đó → nhập 1.200.000đ → Save
- Verify: tạo ĐNTT bổ sung 200.000đ
- DB chi_phi: `thanh_tien_thuc_te = 1.200.000đ`

**Lần 2**: Duyệt + paid ĐNTT bổ sung. Click "Điều chỉnh" trên DNTT GỐC lại → nhập 1.300.000đ → Save
- ✅ ĐNTT bổ sung lần 2 = **100.000đ** (đúng = 1.3tr − 1.2tr)
- ❌ FAIL nếu = 300.000đ (sai = 1.3tr − 1.0tr gốc)
- DB chi_phi: `thanh_tien_thuc_te = 1.300.000đ`
- ❌ FAIL nếu = 1.500.000đ (cộng dồn)

---

### Scenario 10 — Chặn sửa số tiền DNTT xuống dưới đã trả (Bug #3)

> **Verify**: View dntt_with_payment_status không bị "false positive paid".

**Setup**: DNTT 10.000.000đ, partial paid 7.000.000đ, status `cho_duyet`

**Bước test**
1. Vào ĐNTT đó → click Sửa số tiền → nhập 5.000.000đ (thấp hơn 7tr đã trả)

**Mong đợi**
- Toast lỗi đỏ: *"Không thể hạ số tiền xuống dưới số đã thanh toán (7.000.000đ). Hủy ĐNTT hoặc tạo ĐNTT bổ sung thay thế."*
- DNTT vẫn 10tr, status không đổi
- Thử với 12tr (tăng) → OK

---

### Scenario 11 — Cấn trừ công nợ chia chéo đoàn (Bug #5)

> **Verify**: Cột "Đã cấn trừ" hiển thị đầy đủ ở cả 2 đoàn.

**Setup**
- Công nợ NCC X = 10.000.000đ, status `con_du`, thuộc Đoàn A
- Đoàn B + Đoàn C, mỗi đoàn 1 chi phí của NCC X = 5.000.000đ, đánh dấu `thanh_toan_dinh_ky=true`

**Bước test**
1. Vào trang Thanh toán định kỳ → chọn NCC X → tick cả 2 chi phí → tạo ĐNTT gộp 10tr → duyệt
2. Mark paid bằng method "Cấn trừ" → chọn công nợ 10tr của Đoàn A
3. Vào tab Chi phí Đoàn B → cột "Đã cấn trừ" cho row 5tr của NCC X
4. Vào tab Chi phí Đoàn C → tương tự

**Mong đợi**
- Đoàn B: cột "Đã cấn trừ" = **5.000.000đ**
- Đoàn C: cột "Đã cấn trừ" = **5.000.000đ**
- ❌ FAIL nếu 1 đoàn = 10tr, đoàn kia = 0 (bug dedupe cũ)

---

### Scenario 12 — KS không bị ảnh hưởng

> **Verify**: KS section editable, không có flag override, không bị đè khi save Điều tour.

**Bước test**
1. Tạo đoàn mới + KS, nhập cơ cấu phòng (vd 5 phòng đôi 1tr/đêm + 2 phòng đơn 800k/đêm) trong tab Chi phí → Section KS
2. Save lại Điều tour (không sửa KS)
3. Quay lại KS section

**Mong đợi**
- Cơ cấu phòng giữ nguyên 5+2
- Số phòng, đơn giá editable bình thường (không 🔒)
- Không có nút Reset override

---

## 📊 Checklist tổng

| # | Scenario | PASS | FAIL | Note |
|---|---|---|---|---|
| 1 | Cascade rebooking thuần | ☐ | ☐ | |
| 2 | Override bảo vệ khỏi cascade | ☐ | ☐ | |
| 3 | Reset override re-sync | ☐ | ☐ | |
| 4 | Lock UI khi paid | ☐ | ☐ | |
| 5 | Thuc_te cleared + toast | ☐ | ☐ | |
| 6 | NH tien_cong_ty không reset | ☐ | ☐ | |
| 7 | Pre-check DNTT khi xóa cảnh điểm | ☐ | ☐ | |
| 8 | FOC khách sạn 2 đêm | ☐ | ☐ | |
| 9 | Điều chỉnh DNTT 2 lần | ☐ | ☐ | |
| 10 | Chặn sửa DNTT xuống dưới paid | ☐ | ☐ | |
| 11 | Cấn trừ chia chéo đoàn | ☐ | ☐ | |
| 12 | KS không bị ảnh hưởng | ☐ | ☐ | |

---

## 💡 Mẹo khi test

- Tạo 1 đoàn riêng cho mỗi scenario nếu muốn dọn sạch sau test
- Mở **Supabase** trong tab khác để verify trực tiếp DB sau mỗi bước
- Sau test xong, có thể xóa các đoàn test bằng SQL (cẩn thận FK)
- Nếu scenario nào FAIL → screenshot UI + copy data từ DB → gửi mình check
