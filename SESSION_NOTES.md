# 📝 Session Notes — S8 Travel CRM

> Mục đích: Onboard Claude session mới (vd ở máy công ty hôm sau) nhanh.
> Đọc file này **TRƯỚC** khi bắt đầu task mới. CLAUDE.md cho ngữ cảnh kỹ thuật, file này cho ngữ cảnh quyết định gần đây.

**Cập nhật lần cuối**: 2026-05-15
**User**: Nguyen — nghiệp vụ điều hành, biết sơ kế toán, **không phải dev** → giải thích bằng ngôn ngữ nghiệp vụ, tránh code-heavy.

---

## 🚧 TODO — việc cần Nguyen làm (sang 2026-05-16)

### Setup Google Sheets sync cho page Hóa đơn UNC

Code + cron đã deploy xong. Còn 4 bước thủ công phía user:

**A. GCP Console** (https://console.cloud.google.com):
1. Tạo project mới (vd `s8-crm-sheets`)
2. **APIs & Services → Library** → search "Google Sheets API" → **Enable**
3. **APIs & Services → Credentials → Create Credentials → Service account**
   - Name: `crm-sheet-writer` (tùy)
   - Bấm **Done** (không cần grant role)
4. Click service account → tab **Keys → Add Key → Create new key → JSON** → tải file `.json`
5. Copy **service account email** (dạng `crm-sheet-writer@<project>.iam.gserviceaccount.com`)

**B. Google Sheet đích**:
1. Tạo Sheet mới (vd `S8 — DNTT đã thanh toán`)
2. **Share** → paste service account email → quyền **Editor** → Send
3. Lấy **Spreadsheet ID** từ URL: `docs.google.com/spreadsheets/d/[SPREADSHEET ID]/edit`

**C. Supabase Dashboard** (https://supabase.com/dashboard/project/lflsbwoqzmbknzdpaequ/functions):
1. Click function `sync-dntt-to-sheet` → **Secrets**
2. Add 3 secrets:
   - `GCP_SA_JSON` = paste TOÀN BỘ nội dung file JSON tải ở bước A.4
   - `SHEET_ID` = Spreadsheet ID (bước B.3)
   - `SHEET_TAB` = `Sheet1` (hoặc tên tab đã đặt)

**D. Test**:
- Vào page Hóa đơn UNC → click nút "Đồng bộ Sheet" góc phải header
- Sheet sẽ tự ghi header + các DNTT paid chưa export

**Đã có sẵn (Nguyen không cần đụng)**:
- DB: cột `de_nghi_thanh_toan.exported_to_sheet_at` + index partial + RPC `get_dntt_pending_export()`
- Edge function: `sync-dntt-to-sheet` (JWT-sign service account → Sheets API append → mark exported)
- UI: nút "Đồng bộ Sheet" trên [HoaDonUNCPage](src/pages/HoaDonUNCPage.tsx) header
- Cron: pg_cron job `sync-dntt-to-sheet-30min` (`*/30 * * * *`, gọi qua pg_net)

**Sửa cột Sheet sau này**: edit `SHEET_HEADER` + map row trong [supabase/functions/sync-dntt-to-sheet/index.ts](supabase/functions/sync-dntt-to-sheet/index.ts) → deploy lại qua Supabase Dashboard hoặc CLI.
**Tắt cron**: `SELECT cron.unschedule('sync-dntt-to-sheet-30min');`

---

## 🎯 5 quyết định lớn đã chốt

### 1. Pattern HYBRID cho cảnh điểm/NH (Source of Truth)
- `doan_chi_phi.so_luong / don_gia` BIDIRECTIONAL với flag `is_overridden`
- Default cascade từ Điều tour. OP override → flag=true → cascade bỏ qua row đó
- Reset (↺ button) → flag=false, sync lại
- **KHÁCH SẠN** giữ pattern cũ (độc lập, không cascade)
- Chi tiết: CLAUDE.md section "🔄 HYBRID Pattern"

### 2. Lock UI khi paid/partial_paid
- Input SL/đơn giá trong DV/NH section → disabled khi chi phí đã `paid` hoặc `partial_paid`
- Phát sinh sau khi đã thanh toán → BUỘC qua nút "Điều chỉnh" để track công nợ NCC
- Modal "Điều chỉnh" mở rộng: 3 input (SL + đơn giá + tổng thực tế)

### 3. Aggregate-after-edits pattern (DV + NH)
- Modal "Điều chỉnh" CHỈ update chi_phi state, KHÔNG tạo cong_no/DNTT ngay
- Footer mỗi nhóm tính `delta = sumActual + CN + HT − sumPaid` (CHỈ rows có `tien_cong_ty > 0`, loại HDV-paid)
- `delta > 0` → button cam "Thanh toán bổ sung X ₫" → tạo DNTT bổ sung cho_duyet
- `delta < 0` → button tím "Ghi nhận công nợ X ₫" → tạo cong_no
- `delta = 0` → ẩn cả 2

Group key:
- DV: extras prefix `[dvps_<main.id>] `
- NH: extras prefix `[trua] ` / `[toi] `

### 4. HDV vs Công ty payer
- Chi phí Công ty trả: full DNTT lifecycle (cần duyệt/paid/adjust)
- Chi phí HDV trả: KHÔNG có DNTT, KHÔNG có nút "Điều chỉnh", chỉ track `tien_hdv` → aggregate ở Section HDV cho quyết toán
- Đoàn xác nhận flow này hôm nay

### 5. Số khách đoàn lock trong Điều tour
- Field "Số khách" ở table Điều tour bị KHÓA, link với `doan.so_khach`
- Sửa qua các trường thành phần ở header DoanDetail: Số khách lớn / Em1 / Em2 / Trẻ lớn
- Save DoanDetail trigger `useSaveDieuTour` → cascade xuống chi phí

---

## ✅ Đã fix hôm nay (verify từ DB + code)

### Bug Critical đã đóng
1. **#1 — Cộng đôi `thanh_tien_thuc_te`** — `use-dntt.ts:540-557` dùng `currentTotal` từ chi_phi thay vì `dnttGoc.so_tien` frozen
2. **#2 — FOC formula KS UI ≠ DB** — `ChiPhiKSSection.tsx:47-61` và `:569-584` đồng bộ công thức, đều KHÔNG nhân `so_dem`
3. **#3 — `useUpdateDNTT` validate paid** — `use-dntt.ts:406-415` chặn hạ `so_tien` dưới `paid_amount`
4. **#4 — Skip** (Claude Code phân tích lại — không phải bug)
5. **#5 — `usePaymentsByChiPhi` dedupe sai** — `ChiPhiKSSection.tsx:111-121` và NHSection xóa `seen.add(payment_id)`

### Vi phạm CLAUDE.md đã đóng
- 4 chỗ set `trang_thai_thanh_toan` thủ công đã xóa (use-dieu-tour.ts:473, 519; ChiPhiBaoHiemSection.tsx:104, 145)
- Migration DB default đổi `chua_thanh_toan` → `unpaid` (đã chạy + audit data, 0 row giá trị cũ)

### Bảo mật DB
- ✅ Bật RLS trên 54 bảng public (trước đó 46 bảng RLS off)
- ✅ Set search_path cho 18 functions
- 🟡 Còn 5 policy `WITH CHECK true` (INSERT) trên `dntt_allocations`, `nha_xe`, `don_vi_visa`, `loai_visa`, `nha_xe_loai_xe`
- 🟡 2 view chưa security_invoker: `dntt_with_payment_status`, `cong_no_with_status`
- 🟡 Anon vẫn EXECUTE được `is_admin`, `get_user_role` (DEFINER mode)

### Module Lead (commit `68e597a` lúc 01:16)
- 8 files component + 7 hooks + 5 DB tables (lead, lead_activity, lead_task, lead_campaign, lead_diem_den)
- Kanban view (drag-drop), table view, detail drawer, form drawer, stats widget, reports page
- 2 lead test + 9 activities trong DB
- Chưa verify e2e: chốt deal → tạo đoàn, auto-assign sales round-robin, quick actions tel/zalo/email

### Pattern HYBRID đã apply
- Migration: `doan_chi_phi.is_overridden` boolean DEFAULT false
- Cascade logic `use-dieu-tour.ts:513-540` (cảnh điểm) + `:561-590` (NH với alwaysFields/initialFields)
- UI: 🔒 indicator + ↺ reset button + lock paid/partial_paid
- Toast "Đã reset điều chỉnh thanh_tien_thuc_te trên X chi phí" — `DoanDetail.tsx:215`
- Hook `useUpdateChiPhiActual` — `use-chi-phi.ts:298`
- Footer commit button per group (DV/NH)
- Pre-check DNTT trước delete cảnh điểm — `use-dieu-tour.ts:329` `checkCanhDiemDeletable`, gọi từ `DayRow.tsx:232`
- Safety net onError invalidate queries — `DoanDetail.tsx:234`

---

## ⏳ Đang dở — cần làm tiếp

### Modal "Tạo ĐNTT bổ sung" thiếu breakdown
Hiện tại modal hiển thị:
```
Tổng thực tế (nhóm):  19,550,000 ₫
Đã thanh toán:        20,492,432 ₫
Chênh lệch còn lại:   +3,450,000 ₫ (thiếu)
```
→ Math 19.55 − 20.49 = −0.94, nhưng hiện +3.45 → user nhầm "tại sao thừa lại nói thiếu".

**Fix**: thêm 3 dòng giữa "Đã thanh toán" và "Chênh lệch":
```
(−) Đã ghi nhận công nợ: 3,242,432 ₫    (chỉ hiện nếu CN > 0)
(−) Đã hoàn tiền:        1,150,000 ₫    (chỉ hiện nếu HT > 0)
─────────────────────────
Còn cần thanh toán:     16,100,000 ₫
```

Tách `groupCongNoTotal` theo `cong_no.trang_thai`:
- `con_du` / `da_can_tru` → "Đã ghi nhận công nợ"
- `da_hoan_tien` → "Đã hoàn tiền"

Áp dụng cho:
- Modal "Tạo ĐNTT bổ sung" (delta > 0)
- Modal "Xử lý chênh lệch thừa" / "Ghi nhận công nợ" (delta < 0)
- Tooltip badge "DNTT lệch X" trên row (nếu có)

User đã confirm hôm nay. Chỉ chờ Claude Code làm.

### Còn lại từ CLAUDE.md violations (không gấp)
- 4 file dùng `<form>`: GroupDrawer.tsx:78, DoanDrawer.tsx:176, LockPhongFormDialog.tsx:395, 708
- InvoicePage.tsx:406, 644, 648 dùng "đ" thay vì "VND"

### Bảo mật DB (3 việc nhỏ ~20-30 phút tổng)
- Sửa 5 policy `WITH CHECK true` → check `auth.uid()`
- `ALTER VIEW ... SET (security_invoker = true)` cho 2 view
- `REVOKE EXECUTE FROM anon` cho `is_admin`, `get_user_role`

### Performance (chưa gấp — chờ data lớn)
- Lazy-load 27 route + `manualChunks` (`vite.config.ts`)
- Server-side pagination `useDoanList`
- Bỏ `any` (generate Supabase types)

### Test verification (user chưa test thực tế)
- 12 scenarios trong `MANUAL_TEST.md` (file đã được rewrite phù hợp pattern mới)
- Record 1678 (Cáp treo đoàn 63): `chi_phi.so_luong=19, is_overridden=false`, `item.so_luong=20` → nếu save Điều tour sẽ revert. Có 3 cách fix tạm thời, user chưa quyết.

### Module Lead — cần verify
- E2E flow chốt deal → tạo đoàn → set `lead.doan_id`
- Auto-assign sales round-robin
- Quick actions tel/zalo/email trong LeadDrawer
- Test data cho `lead_task`, `lead_campaign`, `lead_diem_den` (0 rows hiện tại)

---

## 🗂️ Files quan trọng cần biết

| File | Role |
|---|---|
| `CLAUDE.md` | Schema DB + rules nghiệp vụ (đã cập nhật pattern HYBRID) |
| `MANUAL_TEST.md` | 12 scenarios test thủ công (đã rewrite cho pattern mới) |
| `SESSION_NOTES.md` | File này — ngữ cảnh phiên |
| `src/hooks/use-dieu-tour.ts` | Cascade logic + checkCanhDiemDeletable |
| `src/hooks/use-dntt.ts` | useCreateAdjustment + useUpdateDNTT guard |
| `src/hooks/use-chi-phi.ts` | useUpdateChiPhiActual hook (line 298) |
| `src/components/chi-phi/ChiPhiDVSection.tsx` | DV section với footer aggregate |
| `src/components/chi-phi/ChiPhiNHSection.tsx` | NH section + FOC + CK |
| `src/components/chi-phi/ChiPhiKSSection.tsx` | KS section (độc lập, KHÔNG động) |
| `src/pages/DoanDetail.tsx` | Toast + onError safety net |

---

## 💡 Lưu ý onboard Claude mới

1. **Đọc CLAUDE.md đầy đủ** trước khi làm bất kỳ task gì
2. **User là nghiệp vụ**, KHÔNG phải dev — giải thích kế toán/business, tránh code chi tiết
3. **Logic accounting đã verify đúng** (FOC, useCreateAdjustment, payment dedupe) — KHÔNG động vào
4. **Pattern HYBRID đã thống nhất** — đừng đề xuất lại các pattern khác (Option C "disable always", Conditional Sync, snapshot column)
5. **Modal "Tạo ĐNTT bổ sung" breakdown** là việc dở dang gần nhất — confirm với user trước khi làm
6. **Khi sửa DB**: chạy `apply_migration` qua MCP Supabase, dự án id `lflsbwoqzmbknzdpaequ`

## 📐 Tools quan trọng có sẵn

- MCP Supabase: query DB, apply migration, get_advisors
- MCP Workspace bash: git log, diff, terminal commands
- File tools (Read/Write/Edit): truy cập trực tiếp workspace folder
- Agent tool: dispatch subagent cho task song song

---

## ✅ Trước khi end session

```bash
# Đẩy lên GitHub trước khi rời máy
cd E:\Clean\clean-code-hub
git add .
git commit -m "session notes 2026-05-10"
git push

# Mai sang máy công ty
git pull
# Mở Cowork → chọn folder clean-code-hub → "đọc SESSION_NOTES.md và CLAUDE.md trước"
```
