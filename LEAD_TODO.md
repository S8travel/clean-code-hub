# 📋 Lead Module — Công việc cần làm

> Tổng hợp công việc cho module Lead. Đọc song song với `CLAUDE.md` (section "Module Lead Management") và `SESSION_NOTES.md`.

**Cập nhật**: 2026-05-11
**Status hiện tại**: Module đã build cơ bản (commit `68e597a`, 2,489 dòng), 2 lead test + 9 activities trong DB.

---

## 🔥 PHASE 1 — Verify & Test (làm trước, 1-2 ngày)

### 1.1 Verify auto-assign sales round-robin
- **File cần check**: `src/hooks/use-leads.ts` → `useCreateLead`
- **Logic mong đợi**: Khi tạo lead mới, code tự chọn 1 sales từ `user_roles WHERE bo_phan='dieu_hanh'` theo cơ chế xoay vòng
- **Cách test**:
  1. Có ≥3 sales user
  2. Tạo 5 lead mới liên tiếp
  3. Verify `sales_phu_trach_id` được phân đều, không bias 1 người
- **Nếu chưa có**: implement round-robin (track last_assigned_id ở đâu đó, vd `lead_assignment_counter` table hoặc query `MAX(created_at) GROUP BY sales_id`)

### 1.2 Verify quick actions trong LeadDrawer
- **File cần check**: `src/components/leads/LeadDrawer.tsx`
- **Mong đợi 3 nút header**:
  - 📞 `tel:${sdt}` — mở dialer
  - 💬 `https://zalo.me/${sdt}` — mở chat Zalo
  - 📧 `mailto:${email}` — mở mail client
- **Verify**: mở 1 lead có SDT + email → click từng nút → mở đúng app
- **Nếu thiếu**: thêm 3 button + link trên header drawer

### 1.3 Test e2e flow chốt deal → tạo đoàn
- **Setup**: Tạo lead có đủ thông tin (tên, SDT, email, số khách dự kiến, điểm đến, ngày đi)
- **Bước test**:
  1. Đổi status sang `chot_deal` (qua kanban drag hoặc dropdown)
  2. Verify: tự tạo đoàn mới với:
     - `doan.ten_doan`, `doan.so_khach_lon`, `doan.ngay_di`, `doan.ngay_ve`... pre-filled từ lead
     - `lead.doan_id` được set trỏ đến đoàn vừa tạo
  3. Verify: activity log mới với loại `chot_deal`
- **Edge cases**: lead thiếu thông tin bắt buộc (ngày đi, số khách) → có chặn không hay tạo đoàn rỗng?

### 1.4 Test mất khách bắt buộc lý do
- **Setup**: 1 lead status đang `dang_tu_van`
- **Bước test**:
  1. Đổi status sang `mat_khach` (qua kanban hoặc dropdown)
  2. Phải hiện modal/prompt yêu cầu nhập lý do
  3. Click cancel → status không đổi
  4. Nhập lý do + confirm → status đổi, lý do được lưu vào DB
- **Field cần lưu**: `lead.ly_do_mat` hoặc tương tự + activity log

### 1.5 Test kanban drag-drop tất cả các cặp trạng thái
- Drag lead từ status A sang status B với mỗi cặp khả thi
- Verify: status DB update + activity log mới với loại `doi_trang_thai`
- Edge case: drag sang `chot_deal` → trigger create đoàn flow
- Edge case: drag sang `mat_khach` → trigger lý do flow

### 1.6 Verify lead_task (việc cần làm)
- **File**: `src/hooks/use-lead-tasks.ts` + tab "Việc cần làm" trong LeadDrawer
- **Test**: tạo task có deadline → verify task hiện trong drawer + có cảnh báo khi quá hạn
- **Cần**: notification toast/badge khi đến hạn? Cron check hoặc on-load check

---

## 🟡 PHASE 2 — Hoàn thiện core (tuần này, 3-5 ngày)

### 2.1 Lead duplicate detection
- **Vấn đề**: Cùng khách hàng nhập 2 lần (vd SDT trùng) → 2 lead duplicate
- **Solution**:
  - Khi user nhập SDT (hoặc email) → query check trùng
  - Hiện cảnh báo: "Đã có lead với SDT này: [Tên khách]. Click để mở."
  - Cho phép user vẫn tạo nếu muốn (vd referral cùng 1 SDT)
- **File**: `LeadFormDrawer.tsx` thêm debounced check
- **Effort**: 1 ngày

### 2.2 Convert lead → đoàn pre-fill chi tiết
- **Hiện tại**: chốt deal → có tạo đoàn, nhưng có thể auto-fill chưa đủ
- **Bổ sung pre-fill**:
  - `doan.ten_doan` = "Đoàn [tên khách] - [điểm đến]"
  - `doan.so_khach_*` từ breakdown lead (nếu có)
  - `doan.dia_diem_id` từ `lead.diem_den` (nếu có map)
  - `doan.loai_tour` từ `lead.loai_tour`
  - `doan.assigned_to` = `lead.sales_phu_trach_id`
  - `doan.ghi_chu` = tóm tắt activities của lead
- **Effort**: 1 ngày

### 2.3 Reminder / follow-up notification
- **Vấn đề**: Sales quên follow-up lead → mất khách
- **Solution**:
  - Mỗi lead có field `ngay_lien_he_tiep` (next contact date)
  - Dashboard widget hiển thị "Có X lead cần follow-up hôm nay"
  - LeadsPage filter "follow_up=today/overdue" (đã có URL params)
  - Badge đỏ trên row lead nếu quá hạn
- **File**: `useLeadsList` + `LeadStatsWidget`
- **Effort**: 1 ngày (phần lớn đã có)

### 2.4 Activity log đầy đủ các loại
- **Mong đợi** các loại activity:
  - `doi_trang_thai` ✅ (đã có)
  - `tao_lead` — khi tạo mới
  - `cap_nhat_thong_tin` — khi sửa thông tin lead (lưu diff)
  - `goi_dien` — khi click nút 📞 (manual log)
  - `gui_zalo` / `gui_email` — khi click 💬 / 📧
  - `tao_bao_gia` / `gui_bao_gia` — workflow báo giá
  - `tao_task` / `hoan_thanh_task` — task lifecycle
- **Verify code**: `use-lead-activities.ts` có hàm tạo từng loại không
- **Effort**: 0.5 ngày (chủ yếu trigger ở đúng chỗ)

### 2.5 Tab "Báo giá" trong LeadDrawer
- **Mong đợi**: hiển thị list báo giá đã tạo + nút "Tạo báo giá mới"
- **Source**: Module Báo giá đã có (`use-bao-gia.ts`, `BaoGiaUpload.tsx`, `BaoGiaResultTable.tsx`)
- **Link**: lead → bao_gia (cần field `bao_gia.lead_id` hoặc tương tự)
- **Verify**: hiện code có link không, nếu chưa thì thêm
- **Effort**: 1-2 ngày tùy độ phức tạp

### 2.6 Tạo data mẫu để test các view chưa exercise
- `lead_task`: 0 rows hiện tại → cần ít nhất 5 task với deadline khác nhau (quá hạn, hôm nay, tương lai)
- `lead_campaign`: 0 rows → tạo 2-3 campaign mẫu (FB ads, Zalo OA, Web SEO)
- `lead_diem_den`: 0 rows → check ý nghĩa bảng này + tạo data nếu cần

---

## 🟢 PHASE 3 — Nâng cao (tháng này, 1-2 tuần)

### 3.1 Gửi email tới lead từ CRM
- **Use case**: gửi quote, follow-up, lời chào...
- **Stack**: dùng Resend (đã thảo luận) hoặc Edge function tương tự booking
- **UI**: nút "Gửi email" trong LeadDrawer → modal compose
- **Track**: log activity `gui_email` với subject + body snapshot
- **Effort**: 2-3 ngày

### 3.2 Email threading 2 chiều với khách
- **Tương tự booking**: lead gửi email từ CRM → khách reply → CRM tự parse reply
- **Cần**: Inbound email parse setup (Postmark/Mailgun)
- **UI**: tab "Email" trong LeadDrawer hiển thị timeline mail in/out
- **Effort**: 2-3 ngày (sau khi setup booking inbound)

### 3.3 Lead source attribution / UTM tracking
- **Use case**: biết lead đến từ campaign nào → đánh giá hiệu quả marketing
- **DB**: bảng `lead_campaign` đã có (10 cols), nhưng 0 rows → chưa dùng
- **Implementation**:
  - Lead source breakdown trong reports
  - UTM params capture (nếu có form web)
  - Manual assign campaign khi nhập lead
- **Effort**: 1-2 ngày

### 3.4 Bulk actions (assign batch, đổi status batch)
- **Use case**: 50 lead từ event → muốn assign tất cả cho 1 sales
- **UI**: checkbox chọn nhiều lead → action bar (Assign / Tag / Đổi status)
- **Effort**: 1 ngày

### 3.5 Lead history audit log
- **Use case**: biết ai đã sửa thông tin lead lúc nào
- **DB**: bảng `lead_history` (hoặc reuse `lead_activity` với loại `cap_nhat_thong_tin`)
- **UI**: tab "Lịch sử" trong LeadDrawer
- **Effort**: 1 ngày

### 3.6 Webhook in từ FB Lead Ads
- **Use case**: chạy ads FB → form FB → lead tự đẩy vào CRM
- **Stack**:
  - FB Lead Ads webhook
  - Edge function nhận webhook → INSERT lead
  - Auto-assign sales
- **Effort**: 2-3 ngày (cần setup FB Business)

---

## 🔵 PHASE 4 — Tương lai xa (quý sau, optional)

| Tính năng | Lợi ích | Effort |
|---|---|---|
| Mobile app cho sales | Update lead khi gặp khách | 2-4 tuần |
| Zalo OA integration | Chat trực tiếp khách từ CRM | 1 tuần |
| Auto follow-up sequence | Email/SMS định kỳ nếu lead không phản hồi | 3-5 ngày |
| Lead score (auto) | Chấm điểm lead theo behavior | 3-5 ngày |
| Pipeline forecasting | Dự đoán doanh thu tháng | 1 tuần |
| Form builder web | Embed vào landing page S8 | 1 tuần |
| WhatsApp integration | Chat khách qua WhatsApp | 1 tuần |
| Email tracking (open/click) | Biết khách đọc quote chưa | 3 ngày |

---

## 🎯 Đề xuất thứ tự thực hiện

### Tuần này (Phase 1 + một phần 2)
**Mục tiêu**: hệ thống Lead hoạt động đầy đủ, không có bug ẩn

- [ ] 1.1 — Verify auto-assign round-robin
- [ ] 1.2 — Verify quick actions (tel/zalo/email)
- [ ] 1.3 — Test chốt deal → tạo đoàn e2e
- [ ] 1.4 — Test mất khách bắt buộc lý do
- [ ] 1.5 — Test kanban drag-drop tất cả cặp
- [ ] 1.6 — Test lead_task workflow
- [ ] 2.1 — Lead duplicate detection
- [ ] 2.6 — Tạo data mẫu

### Tuần sau (Phase 2)
**Mục tiêu**: hoàn thiện UX, tránh lỗi nghiệp vụ

- [ ] 2.2 — Convert lead → đoàn pre-fill chi tiết
- [ ] 2.3 — Reminder / follow-up notification
- [ ] 2.4 — Activity log đầy đủ các loại
- [ ] 2.5 — Tab Báo giá link với module hiện có

### Tháng này (Phase 3, chọn 2-3 việc)
**Mục tiêu**: nâng cấp công cụ sales

- [ ] 3.1 — Gửi email tới lead từ CRM (nếu Resend đã setup)
- [ ] 3.4 — Bulk actions
- [ ] 3.3 — Lead source attribution

### Quý sau (Phase 4, optional)
Chỉ làm khi đã có nhu cầu thực tế từ dữ liệu vận hành.

---

## ⚠️ Lưu ý quan trọng

1. **User là nghiệp vụ, không phải dev** — mỗi feature làm xong cần Manual Test scenarios để user verify thực tế
2. **CLAUDE.md "Module Lead Management"** là source of truth nghiệp vụ — đối chiếu trước khi code
3. **Tích hợp với module hiện có**:
   - `leads.sales_phu_trach` → `user_roles.user_id` (chỉ `bo_phan='dieu_hanh'`)
   - `leads.doan_id` → `doan.id` (set khi chốt deal)
   - Báo giá module có sẵn, không build lại
4. **DB tables đã có** — chỉ thêm column nếu thiếu, không tạo bảng mới khi có thể reuse
5. **Email features** nên đợi sau khi setup Resend/Inbound cho booking — chia sẻ infrastructure

---

## 📞 Câu hỏi cần user trả lời trước khi làm

1. **Round-robin assign**: chỉ trong giờ làm việc, hay 24/7? Có cần skip sales đang off không?
2. **Chốt deal**: lead chốt nhưng chưa có ngày đi cụ thể → vẫn tạo đoàn rỗng hay đợi?
3. **Mất khách lý do**: có list lý do predefined (giá cao, không phù hợp tour, đối thủ...) hay free text?
4. **Email tới lead**: có template sẵn (chào hỏi, gửi quote, theo dõi) không?
5. **Báo giá link**: 1 lead có nhiều báo giá (đàm phán nhiều lần) hay 1 lead = 1 báo giá final?
