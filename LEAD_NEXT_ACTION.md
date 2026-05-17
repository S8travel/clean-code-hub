# 🎯 Lead Next-Action System — Spec chi tiết

> Phần này quyết định **tỷ lệ chốt deal** của công ty. Khách là nguồn sống.
> Đọc cùng `LEAD_TODO.md`.

**Triết lý cốt lõi**: thay vì "nhắc follow-up theo ngày", hệ thống chỉ rõ **việc tiếp theo cần làm, nói gì, với ai, lúc nào** + tự bám đuổi đa kênh nhưng có nhịp điệu, không spam.

---

## 🔄 REVISED SCOPE (sau review) — Đọc PHẦN NÀY TRƯỚC

Spec gốc bên dưới (Section 1-10) là **vision đầy đủ tham khảo**. Sau review, scope thực thi điều chỉnh như sau để khớp với hiện trạng data (8 lead test, chưa email-send, không telemetry):

### ✅ LÀM (MVP, ~2 tuần)

#### A. Next Action core (tối giản)
- **1 bảng** `lead_next_action` (xem Section 8 — kèm GRANT + RLS chuẩn)
- **1 pure function** `nextAction(lead, lastOutcome)` → `{type, due_at, priority, suggested_script}` — testable, không AI, deterministic
- **Next Action Box** trong LeadDrawer (top, trên tabs) — như Section 3.2
- **Page "Việc hôm nay"** — tái dùng pattern của `MyJobPage` / Dashboard widget hiện có, KHÔNG build từ đầu
- **Cadence config trong DB**, KHÔNG hardcode TS:
  ```sql
  CREATE TABLE lead_cadence_config (
    id bigserial PRIMARY KEY,
    stage text NOT NULL,
    touch_order int NOT NULL,
    delay_hours int NOT NULL,      -- giờ từ touch trước
    channel text NOT NULL,
    template_scenario text,         -- match với lead_template.scenario
    max_total_touches int,
    PRIMARY KEY (stage, touch_order)
  );
  -- GRANT + RLS theo template CLAUDE.md
  ```
  → Admin chỉnh cadence qua page Quản lý (tương tự danh mục), không deploy code

#### B. Templates lite
- **1 bảng** `lead_template` (xem Section 5 — kèm GRANT + RLS)
- **Fill placeholder** `{{ten_khach}}`, `{{diem_den}}`...
- **Action duy nhất**: "Sao chép vào clipboard" — KHÔNG gửi từ CRM
- User dán vào Zalo / Gmail / SMS thủ công như hiện tại

#### E. Manager funnel cơ bản (gần như free)
- Funnel chart: đếm theo `lead.trang_thai` (data đã có)
- Loss reasons: group by `lead.ly_do_mat` (data đã có)
- Tái dùng pattern dashboard widget vừa làm cho HoaDonUNC sync, etc.

### ⏸️ HOÃN — Anti-pester (Phase C)

- Touch limit, channel rotation enforcement, cooldown rules
- **Lý do**: cần data touch THẬT mới biết có "pester" thực không. Hardcode rule trước khi có data = tối ưu hoá vấn đề chưa tồn tại
- **Khi nào làm**: sau khi có ≥50 lead thật + ≥200 touches log
- Rules vẫn để trong Section 6 để tham khảo, KHÔNG implement

### ❌ BỎ — Smart Suggestions (Phase D)

- Engagement score, best time to call, channel effectiveness, email open/click tracking
- **Lý do**: phụ thuộc tín hiệu CRM KHÔNG thu được:
  - Email open/click → cần gửi từ CRM (chưa có) + tracking pixel
  - Zalo → không có API public, mãi mãi chỉ là `zalo.me/sdt` + copy script
  - Gọi → không tích hợp tổng đài, duration là honor system
- **Hệ quả**: rule "smart" sẽ là rác trên dữ liệu trống. Bỏ hẳn khỏi kế hoạch, **chỉ tính lại khi đã có email-send + lead volume thật**

---

## 🚨 Điểm chỉnh khác từ review

### 1. KHÔNG tạo `lead_touch` — mở rộng `lead_activity`

Bảng `lead_touch` trong Section 8 **trùng lắp** với `lead_activity` đã có. Sales sẽ phải log 2 lần hoặc data lệch. Thay vào đó:

```sql
ALTER TABLE lead_activity
  ADD COLUMN channel text,           -- call/email/zalo/sms/meeting/internal
  ADD COLUMN direction text,         -- outbound/inbound
  ADD COLUMN outcome text,           -- rep_interested/rep_not_interested/no_response/...
  ADD COLUMN duration_seconds int,   -- cho call
  ADD COLUMN next_action_id bigint REFERENCES lead_next_action(id);

-- KHÔNG cần GRANT/RLS bổ sung — ALTER TABLE giữ quyền cũ
```

→ 1 timeline duy nhất, log 1 lần.

### 2. Migration phải có GRANT + RLS

Theo CLAUDE.md rule (từ 30/10/2026, Supabase enforce): mọi `CREATE TABLE` public mới phải:

```sql
CREATE TABLE public.lead_next_action (...);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_next_action 
  TO authenticated, service_role;
GRANT SELECT ON public.lead_next_action TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.lead_next_action_id_seq 
  TO authenticated, service_role;

ALTER TABLE public.lead_next_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.lead_next_action
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Áp tương tự cho `lead_template` và `lead_cadence_config`. Nếu thiếu → error 42501 lúc query.

### 3. Suggestions là ADVISORY — KHÔNG chặn

Rủi ro lớn nhất của hệ thống này không phải code, mà là **văn hoá**:
- Sales kỳ cựu thấy AI bảo "Gọi A" nhưng họ biết B quan trọng hơn → phớt lờ → UI thành chết
- Đây là lý do #1 các CRM Next-Action thất bại

Nguyên tắc bắt buộc trong UI:
- Suggestion **chỉ là gợi ý** — sales có thể: ✓ Làm theo / ⏰ Hoãn 1 click / ❌ Bỏ qua 1 click / 📝 Override (tạo action tự chọn)
- Không có nút "buộc làm" hay block UI
- Cadence khởi đầu **lỏng** (touch ít hơn spec), siết dần theo data thật
- Manager dashboard có cột "Sales override rate" — nếu cao → cadence config sai, không phải sales sai

---

## 📐 MVP timeline điều chỉnh (~2 tuần)

| Tuần | Việc | Output |
|---|---|---|
| **1** | Bảng + RLS + migration; pure function `nextAction()` với 7-10 rules; Next Action Box UI | Lead drawer có box gợi ý action, sales mark done/skip/snooze |
| **2** | Page "Việc hôm nay" (reuse pattern), `lead_template` + clipboard copy, funnel chart cơ bản | Sales mở app thấy danh sách việc + templates, manager xem funnel |

→ **2 tuần** xong MVP đáng dùng. Phase C/D không có trong timeline này.

---

## ⚠️ Section gốc bên dưới — REFERENCE ONLY

Section 1-10 bên dưới là **vision đầy đủ**, dùng để tham khảo khi mở rộng tương lai. Implementation hiện tại chỉ làm các phần đã đánh dấu ✅ ở trên. Trước khi build bất kỳ thứ gì khác (anti-pester, smart suggestions), **review section "REVISED SCOPE"** này trước.

---

## 1. Khái niệm cốt lõi

### 1.1 Next Action = "việc cần làm tiếp" cho từng lead

Mỗi lead, tại mọi thời điểm, **luôn có 1 next action rõ ràng**:
- **Type**: Gọi điện / Email / Zalo / Đặt lịch hẹn / ...
- **When**: Hôm nay / 2 ngày tới / 1 tuần / Sau ngày X
- **Why**: Lý do hành động này (sau khi gửi quote chưa rep, sau khi đổi status, ...)
- **What to say**: Script/template gợi ý cụ thể
- **Priority**: 🔴 gấp / 🟡 bình thường / 🟢 không gấp

Khi sales làm xong action → mark complete → hệ thống suggest action tiếp theo dựa trên outcome (rep / không rep / từ chối / hứa mua / ...).

### 1.2 Cadence = nhịp điệu touch

Không spam, không quên. Mỗi stage có **cadence chuẩn**:
- Lead mới (`moi`): touch 1 trong vòng 5 phút (đoán: lead nóng nhất khi mới điền form)
- Đã liên hệ (`da_lien_he`): nếu chưa rep → 2 ngày sau retry
- Đang tư vấn (`dang_tu_van`): cách 3-5 ngày check progress
- Đã báo giá (`da_bao_gia`): 24h follow up đầu, 3 ngày, 7 ngày, 14 ngày, 30 ngày
- Chờ chốt (`cho_chot`): cách 2 ngày touch nhẹ

### 1.3 Anti-pester = chống làm phiền

3 nguyên tắc:
1. **Max 7 touches** trước khi đánh dấu `mat_khach` (trừ khi khách chủ động rep)
2. **Mix channels** — không gọi 7 lần liên tiếp. Call → Email → Zalo → Call → ...
3. **Provide value mỗi touch** — không phải "anh quyết chưa?", phải có nội dung mới (offer, info, content)

---

## 2. Stages chi tiết + Cadence + Actions

### Stage 1: 📥 `moi` — Lead mới (chưa ai động vào)

**Goal**: Liên hệ trong vòng 5 phút (lead càng mới càng nóng)
**SLA**: 5 phút (không hài lòng nếu > 1 giờ)
**Cadence**:
| Lần | Khi nào | Channel | Outcome |
|---|---|---|---|
| 1 | Ngay | 📞 Gọi | Rep → `da_lien_he` |
| 2 | +30 phút (nếu chưa rep) | 💬 Zalo | Rep → `da_lien_he` |
| 3 | +2 giờ | 📧 Email warm intro | Rep → `da_lien_he` |
| 4 | +1 ngày | 📞 Gọi lại | Rep → `da_lien_he` / không rep → giữ stage |

**Script gọi đầu tiên** (template):
```
"Chào anh/chị [Tên], em [Tên sale] bên S8 Travel. 
Em vừa nhận được thông tin anh/chị quan tâm tour [Điểm đến] cho [N] khách. 
Anh/chị tiện trao đổi với em ít phút về chuyến đi không ạ?"

Nếu khách bận:
"Dạ vâng, em hiểu. Anh/chị tiện lúc mấy giờ em gọi lại được ạ?"

Nếu khách muốn email trước:
"Em sẽ gửi gợi ý tour kèm bảng giá ngay. Anh/chị check email rồi mình hẹn 1 cuộc gọi 15 phút để em tư vấn kỹ hơn nhé."
```

---

### Stage 2: 📞 `da_lien_he` — Đã liên hệ được

**Goal**: Hiểu nhu cầu (qualify) — số khách, ngày, ngân sách, mong đợi
**SLA**: Hoàn tất qualify trong 24h sau cuộc gọi đầu
**Cadence**:
| Lần | Khi nào | Channel | Outcome |
|---|---|---|---|
| 1 | Ngay sau Stage 1 | 📞 Gọi qualify | Đủ info → `dang_tu_van` |
| 2 | +2 ngày (nếu chưa đủ info) | 💬 Zalo gửi câu hỏi cụ thể | Trả lời → `dang_tu_van` |
| 3 | +5 ngày | 📞 Gọi lại / Email reminder | Im lặng → mark cold |

**Câu hỏi qualify chuẩn** (lưu vào lead):
1. Số khách (lớn / em / trẻ lớn)
2. Ngày đi dự kiến + flexible bao nhiêu?
3. Ngân sách/khách ước tính
4. Điểm đến cụ thể hay open?
5. Mục đích: gia đình / công ty / honeymoon / ...
6. Nỗi lo lớn nhất? (chi phí ẩn, an toàn, lịch trình mệt...)

**Script qualify**:
```
"Để em tư vấn tour phù hợp nhất, em hỏi anh/chị vài thông tin nhanh nhé:
- Mình dự kiến đi bao nhiêu người ạ? Trong đó có em nhỏ không?
- Mình muốn đi vào khoảng tháng/tuần nào ạ?
- Anh/chị có ngân sách dự kiến chưa, để em chọn tour phù hợp?
- Có địa điểm nào cụ thể trong đầu rồi không, hay anh/chị muốn em gợi ý ạ?"
```

---

### Stage 3: 💡 `dang_tu_van` — Đang tư vấn (đã hiểu nhu cầu)

**Goal**: Gửi gợi ý tour cụ thể (2-3 options) → confirm để chuyển sang `da_bao_gia`
**SLA**: Gửi gợi ý trong 24h sau qualify
**Cadence**:
| Lần | Khi nào | Channel | Outcome |
|---|---|---|---|
| 1 | +1 ngày sau qualify | 📧 Email 2-3 tour options + brochure | Khách chọn → `da_bao_gia` |
| 2 | +3 ngày | 📞 Gọi check phản hồi | Chọn → `da_bao_gia` |
| 3 | +5 ngày | 💬 Zalo gửi review / video tour | Engaged → stay |
| 4 | +10 ngày | 📞 Last call "có còn quan tâm không" | Im lặng → `mat_khach` (lý do: không phản hồi) |

**Template email gợi ý tour**:
```
Subject: 3 gợi ý tour [Điểm đến] cho gia đình anh/chị

Anh/chị [Tên] thân mến,

Cảm ơn anh/chị đã chia sẻ về kế hoạch đi [Điểm đến]. Dựa trên 
[N khách, ngày, ngân sách], em chuẩn bị 3 option để anh/chị lựa chọn:

📍 OPTION 1 — TIẾT KIỆM (giá rẻ nhưng đủ điểm tham quan)
[Link/PDF]

📍 OPTION 2 — TỐI ƯU (recommend) ⭐
[Link/PDF]

📍 OPTION 3 — CAO CẤP (5 sao + private tour)
[Link/PDF]

Em sẵn sàng tư vấn thêm. Anh/chị có thể trả lời email này, hoặc 
gọi/Zalo em qua [SDT].

Trân trọng,
[Tên sale]
```

---

### Stage 4: 💰 `da_bao_gia` — Đã gửi báo giá

**Goal**: Đẩy quyết định trong 2 tuần. Stage này là quan trọng nhất.
**SLA**: Follow up trong 24h sau gửi quote
**Cadence**:
| Lần | Khi nào | Channel | Mục đích | Outcome |
|---|---|---|---|---|
| 1 | +1 ngày | 📞 Gọi check quote | "Anh/chị xem quote chưa, có thắc mắc gì?" | Có câu hỏi → trả lời / Yes → `cho_chot` |
| 2 | +3 ngày | 💬 Zalo gửi review + ảnh tour | Build trust | Engaged → stay |
| 3 | +7 ngày | 📧 Email "lưu ý chỗ còn ít" / offer khuyến mãi | FOMO + value | Trả lời → `cho_chot` |
| 4 | +14 ngày | 📞 Gọi final check | Last attempt | Yes → `cho_chot` / No → `mat_khach` |
| 5 | +30 ngày | 📧 Email "nếu sau này quan tâm trở lại" | Khép gracefully | Lưu thông tin |

**Anti-pester rules trong stage này**:
- Mỗi lần touch PHẢI có giá trị mới (info, content, offer) — không chỉ "anh quyết chưa?"
- Đa kênh: không gọi 5 lần liên tiếp. Mix: call → email → zalo → call
- Tôn trọng "không": nếu khách nói rõ "không mua" → mark `mat_khach` ngay

**Scripts xử lý objection** (lưu thành template):

**"Để tôi suy nghĩ"** (procrastination)
```
"Dạ em hiểu, đây là quyết định quan trọng. Anh/chị đang cân nhắc 
chỗ nào ạ? Em có thể giải đáp thêm về [giá / lịch trình / 
khách sạn] để anh/chị có thông tin đầy đủ hơn."
```

**"Giá hơi cao"** (price)
```
"Dạ vâng, em hiểu. Anh/chị có muốn em recommend tour cùng điểm 
đến nhưng giá tốt hơn không? Hoặc nếu booking sớm tuần này 
em có thể xin được ưu đãi [-X%]."
```

**"Tôi đang xem chỗ khác"** (competition)
```
"Dạ vâng, anh/chị cẩn thận là đúng. Cho em biết anh/chị 
đang so sánh với bên nào để em phân tích giúp ưu/nhược điểm 
khách quan ạ. Quan trọng là anh/chị chọn được nơi tin cậy."
```

**"Để gia đình bàn lại"** (decision-maker not present)
```
"Dạ vâng. Anh/chị thấy thông tin nào cần em chuẩn bị thêm 
cho buổi bàn gia đình không? Em có thể tham gia 1 cuộc gọi 
nhanh với cả nhà để trả lời thắc mắc của mọi người."
```

---

### Stage 5: ✅ `cho_chot` — Sắp chốt

**Goal**: Lock booking + nhận cọc trong 3-5 ngày
**SLA**: Xử lý booking trong 24h
**Cadence**:
| Lần | Khi nào | Channel | Mục đích |
|---|---|---|---|
| 1 | Ngay | 📞 Gọi xác nhận chi tiết + hướng dẫn cọc | Lock |
| 2 | +1 ngày | 💬 Zalo gửi info ngân hàng + hợp đồng | Tiện |
| 3 | +3 ngày | 📞 Nhắc cọc | Push |
| 4 | +5 ngày | 📞 Last call → nếu vẫn chưa → `mat_khach` (đổi ý) |

---

### Stage 6a: 🎉 `chot_deal` — Đã chốt

**Goal**: Onboarding trải nghiệm khách suôn sẻ → repeat customer + word-of-mouth
**Tự động**:
- Tạo đoàn (đã có)
- Gửi email cảm ơn + tài liệu chuẩn bị chuyến đi
- Đặt reminder: 7 ngày trước chuyến → gọi nhắc
- Đặt reminder: sau chuyến 1 tuần → gửi survey + xin review

### Stage 6b: ❌ `mat_khach` — Mất khách

**Bắt buộc**:
- Lý do (predefined list): giá cao / không phù hợp / đã đặt chỗ khác / không phản hồi / khác
- Note tự do (optional)
- **Đặt lịch re-engage**: 3-6 tháng sau gửi email "Bạn còn nhớ S8 không? Có tour [mới] có thể anh/chị quan tâm" — vì khách cũ vẫn có cơ hội mua lần sau

---

## 3. UI/UX Design

### 3.1 Dashboard "Việc hôm nay" cho mỗi sales

Khi sales mở app, **landing page** là:

```
┌─ Việc của [Tên Sales] — Hôm nay (Thứ 5, 16/05) ───────────┐
│                                                              │
│ 🔴 GẤP (3)                                                  │
│  • Lead Nguyễn Văn A — Gọi follow quote (hết hạn 2h trước) │
│  • Lead Trần Thị B — Last call (sắp mất)                    │
│  • Lead Lê C — Xác nhận cọc                                 │
│                                                              │
│ 🟡 BÌNH THƯỜNG (8)                                          │
│  • Lead D — Zalo gửi ảnh tour                              │
│  • Lead E — Email review                                    │
│  ... [Xem thêm]                                             │
│                                                              │
│ 🟢 KHÔNG GẤP (5)                                            │
│  ... [Xem thêm]                                             │
│                                                              │
│ ✅ Đã làm hôm nay (4)                                       │
│  • 09:15 — Lead F — ☎️ Gọi qualify (4 phút)                │
│  ...                                                         │
│                                                              │
│ 📊 Tuần này: 23 touches · 5 chốt · tỷ lệ 21.7%             │
└──────────────────────────────────────────────────────────────┘
```

Mỗi item click → mở LeadDrawer.

### 3.2 LeadDrawer — Next Action Box nổi bật

Trong drawer, **action box** đặt trên cùng (trên tabs):

```
┌─ 🎯 Việc tiếp theo ──────────────────────────────────────┐
│                                                            │
│ 📞 Gọi follow quote                            🔴 GẤP     │
│ Lý do: Đã 2 ngày từ khi gửi quote, chưa rep              │
│ Hạn: Hôm nay trước 17:00 (còn 3h)                        │
│                                                            │
│ 💡 Gợi ý nói:                                             │
│ "Chào anh A, em gọi follow quote em gửi 2 ngày trước.    │
│ Anh đã xem chưa, có thắc mắc gì để em giải đáp giúp?"    │
│ [Xem template đầy đủ]                                     │
│                                                            │
│ Hành động:                                                 │
│ [✓ Đã gọi - Rep]  [✓ Đã gọi - Không rep]                │
│ [💬 Đổi sang Zalo]  [⏰ Hoãn 1 ngày]  [❌ Bỏ qua]        │
└────────────────────────────────────────────────────────────┘
```

User click "Đã gọi - Rep" → modal nhỏ hỏi outcome:
- Có quan tâm tiếp → đổi status, gợi ý action tiếp
- Hỏi thêm thông tin → log + đặt action follow
- Từ chối → đến modal Mất khách
- Hứa quyết định cuối tuần → tự đặt next action "Gọi check thứ 2"

### 3.3 Activity Timeline (đã có, nâng cấp)

Thêm vào activity log:
- Icon channel (📞 / 💬 / 📧)
- Outcome ngắn ("Rep, quan tâm option 2", "Không rep, đã để lại voicemail")
- Thời gian touch
- Phân biệt visual: touch của bot/auto vs manual sales

### 3.4 Indicator visual

- 🔴 Quá hạn next action
- 🟠 Sắp hết hạn (trong 2h)
- 🟡 Trong ngày
- 🟢 Tương lai
- 🔇 No action set (lead đang "ngủ")

---

## 4. Smart Suggestions — gợi ý hành động tiếp

Dựa trên rule + heuristic, hệ thống tự suggest next action:

### Rules cơ bản

| Tình huống | Hành động gợi ý | Channel | Khi nào |
|---|---|---|---|
| Lead mới (`moi`) | Gọi qualify | 📞 | Ngay |
| Đã gọi, không rep | Thử Zalo | 💬 | +30 phút |
| Vẫn không rep sau 24h | Gửi email warm intro | 📧 | +24h |
| Đã qualify, chưa gửi quote | Soạn + gửi quote | 📧 | +24h |
| Đã gửi quote, chưa rep | Gọi check quote | 📞 | +24h |
| Đã rep quote, hỏi thêm | Trả lời + gọi follow | 💬 | Trong ngày |
| Đã chốt | Gửi welcome email | 📧 | Ngay |
| Im lặng > 14 ngày sau quote | Last attempt | 📞 | Force action |

### Smart logic nâng cao

- **Best time to call**: dựa trên thời điểm khách phản hồi trước đó (vd nếu khách hay rep buổi tối → suggest gọi sau 19h)
- **Channel preference**: nếu khách rep Zalo nhiều → suggest Zalo trước (channel they prefer)
- **Engagement score**: lead nào engage cao (mở email, click link, rep nhanh) → priority cao hơn
- **Stale lead nudge**: nếu lead trong `dang_tu_van` quá 30 ngày không touch → suggest "re-engage hoặc move sang `mat_khach`"

---

## 5. Templates Library

UI: panel sliding bên phải / popup hiển thị templates phù hợp với context (channel + stage).

### Cấu trúc DB

```sql
CREATE TABLE lead_template (
  id bigserial PRIMARY KEY,
  ten text NOT NULL,
  channel text NOT NULL,  -- email/zalo/sms/call_script
  stage text,             -- moi/da_lien_he/.../da_bao_gia/...
  scenario text,          -- first_contact/follow_quote/objection_price/...
  subject text,           -- cho email
  body text NOT NULL,     -- text với placeholder {{ten_khach}}, {{diem_den}}
  used_count int DEFAULT 0,
  conversion_rate numeric, -- % chốt khi dùng template này
  active boolean DEFAULT true
);
```

### Templates cần seed

**Email**:
- `intro_new_lead` — Email chào lead mới
- `quote_3_options` — Gửi 3 options tour
- `quote_follow_24h` — Follow quote 1 ngày
- `quote_follow_3d_with_review` — Follow 3 ngày kèm review
- `promo_limited_time` — Ưu đãi giới hạn (FOMO)
- `last_chance` — Last call
- `mat_khach_gracefully` — Khép lịch sự
- `re_engage_6m` — Re-engage sau 6 tháng

**Zalo**:
- `gua_giua_voi_khach` — Ngắn, thân mật
- `gui_anh_tour` — Gửi ảnh + caption
- `gui_video_review` — Gửi video

**Call scripts**:
- `qualify_questions` — Câu hỏi qualify
- `objection_price` — Xử lý "giá cao"
- `objection_thinking` — Xử lý "để suy nghĩ"
- `objection_competition` — Xử lý "đang xem chỗ khác"
- `soft_close` — Soft close kỹ thuật

### Personalization

Template hỗ trợ placeholder:
- `{{ten_khach}}` → tên lead
- `{{sales_name}}` → tên sale
- `{{diem_den}}` → điểm đến lead quan tâm
- `{{so_khach}}` → số khách
- `{{ngay_di}}` → ngày dự kiến
- `{{quote_link}}` → link quote
- `{{ngan_sach}}` → ngân sách

Khi user click "Dùng template" → tự fill placeholder + cho phép edit trước khi send.

---

## 6. Anti-Pester Implementation

### 6.1 Touch limit per stage

```typescript
const MAX_TOUCHES = {
  moi: 4,            // 4 lần trong 2 ngày
  da_lien_he: 3,     // 3 lần trong 5 ngày
  dang_tu_van: 4,    // 4 lần trong 2 tuần
  da_bao_gia: 5,     // 5 lần trong 4 tuần
  cho_chot: 4,       // 4 lần trong 1 tuần
};
```

Vượt limit → hệ thống KHÔNG tạo next action mới. Thay vào đó suggest:
- Move sang `mat_khach` (lý do: không phản hồi)
- Hoặc "park" lead 30 ngày rồi re-engage

### 6.2 Channel rotation enforcement

Hệ thống tracker last 3 touches. Nếu 3 lần liên tiếp cùng channel (vd 3 cuộc gọi) → cảnh báo:

```
⚠️ Đã gọi 3 lần liên tiếp. Đổi channel để tránh làm phiền.
   Gợi ý: 💬 Zalo hoặc 📧 Email
```

### 6.3 Cooldown sau từ chối nhẹ

Nếu khách reply kiểu "đang bận, để sau" hoặc "tôi suy nghĩ" → next action tự động dời +3 ngày, không sớm hơn.

### 6.4 Do Not Contact list

Lead có thể đánh dấu `do_not_contact = true` → ẩn khỏi suggestion + KHÔNG cho phép tạo action mới. Chỉ chứa lý do, sales có thể review thủ công nếu cần.

---

## 7. Metrics + Reports cho Manager

### 7.1 Per-sales dashboard

| Metric | Mục tiêu | Hiện tại |
|---|---|---|
| Touches/ngày | 15-25 | 18 ✓ |
| Avg response time (cho lead mới) | < 1h | 2.5h ⚠️ |
| Conversion qualify → bao giá | > 60% | 55% |
| Conversion bao giá → chốt | > 25% | 32% ✓ |
| Avg deal size | tracked | 18.5tr |
| Avg sales cycle | < 21 ngày | 19 ngày ✓ |
| Stalled leads (no touch 14d+) | < 5 | 12 ⚠️ |

### 7.2 Team-level

- Funnel chart: moi → da_lien_he → dang_tu_van → da_bao_gia → cho_chot → chot_deal
- Loss reasons breakdown (lý do mất khách phổ biến nhất)
- Channel effectiveness (kênh nào convert tốt nhất)
- Best performing templates
- Lead source ROI (FB ads vs Zalo vs web vs referral)

---

## 8. Database Schema bổ sung

### Bảng mới / cột mới

```sql
-- Bảng next_action (1 active per lead)
CREATE TABLE lead_next_action (
  id bigserial PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  action_type text NOT NULL,    -- call/email/zalo/sms/meeting/internal_note
  reason text,                  -- "follow quote sau 2 ngày", "qualify check"
  due_at timestamptz NOT NULL,
  priority text NOT NULL,       -- gap/binh_thuong/khong_gap
  template_id bigint REFERENCES lead_template(id),
  suggested_script text,        -- template đã fill placeholder
  status text DEFAULT 'pending', -- pending/done/skipped/snoozed
  done_at timestamptz,
  outcome text,                 -- rep_interested/rep_not_interested/no_response/...
  outcome_note text,
  created_at timestamptz DEFAULT now()
);

-- Cột mới trong lead
ALTER TABLE lead ADD COLUMN do_not_contact boolean DEFAULT false;
ALTER TABLE lead ADD COLUMN do_not_contact_reason text;
ALTER TABLE lead ADD COLUMN engagement_score int DEFAULT 0; -- 0-100
ALTER TABLE lead ADD COLUMN total_touches int DEFAULT 0;
ALTER TABLE lead ADD COLUMN last_touched_at timestamptz;
ALTER TABLE lead ADD COLUMN preferred_channel text; -- detect từ engagement
ALTER TABLE lead ADD COLUMN preferred_contact_time text; -- "evening/morning"

-- Touch log (granular hơn lead_activity)
CREATE TABLE lead_touch (
  id bigserial PRIMARY KEY,
  lead_id bigint NOT NULL,
  next_action_id bigint REFERENCES lead_next_action(id),
  channel text NOT NULL,
  direction text NOT NULL,  -- outbound/inbound
  touched_at timestamptz DEFAULT now(),
  touched_by uuid REFERENCES auth.users(id),
  outcome text,
  duration_seconds int,     -- cho call
  notes text
);

-- Template library
CREATE TABLE lead_template (...); -- xem section 5
```

---

## 9. Triển khai phasing

### Phase A — MVP Next Action (2 tuần)
1. Bảng `lead_next_action` + UI Next Action Box trong LeadDrawer
2. 5-7 rules cơ bản auto-suggest action theo stage
3. Quick action buttons: Đã làm / Hoãn / Skip
4. Dashboard "Việc hôm nay" cho sales

### Phase B — Templates + Scripts (1 tuần)
1. Bảng `lead_template` + seed 20-30 templates phổ biến
2. UI chọn template trong drawer
3. Placeholder auto-fill
4. Send từ CRM (kết hợp Resend khi sẵn sàng)

### Phase C — Anti-pester rules (1 tuần)
1. Touch limit per stage
2. Channel rotation enforcement
3. Cooldown sau từ chối
4. Do Not Contact toggle

### Phase D — Smart Suggestions (1-2 tuần)
1. Engagement score (mở email, click link, rep nhanh)
2. Channel preference detection
3. Best time to contact analysis
4. Stalled lead nudge

### Phase E — Manager Dashboard (1 tuần)
1. Funnel chart
2. Per-sales metrics
3. Loss reasons breakdown
4. Channel/template effectiveness

**Total: 6-8 tuần** triển khai đầy đủ. MVP (Phase A) đủ dùng sau 2 tuần.

---

## 10. Lưu ý quan trọng cho sales/manager

### Văn hóa "khách hàng là trung tâm"

1. **Không spam** — mọi touch phải có giá trị. "Anh quyết chưa?" không phải value.
2. **Lắng nghe** — qualify kỹ trước khi sell. Tránh push tour không phù hợp.
3. **Trung thực** — nếu tour không phù hợp ngân sách/nhu cầu, đề xuất alternative thay vì cố push.
4. **Hậu mãi quan trọng** — khách cũ giới thiệu khách mới ~30% revenue. Đừng quên touch khách đã đi tour.
5. **Tôn trọng "không"** — khách nói rõ không quan tâm → mark `mat_khach` ngay, không cố push.

### Training cần thiết

- 1 buổi workflow mới cho sales (1.5h)
- 1 buổi sales script + role-play (2h)
- Tài liệu objection handling (đọc tham khảo)
- Review template hàng tháng → cập nhật từ template hiệu quả

### KPI sales mới

- KHÔNG đo "số cuộc gọi" (dễ spam)
- ĐO "qualify rate" (% lead đến qualified status)
- ĐO "conversion rate" (% bao giá → chốt)
- ĐO "avg deal size + repeat rate"
- ĐO "customer satisfaction" sau tour (survey)

---

## ⚠️ Cần user trả lời trước khi build

1. **Cadence chuẩn cho công ty bạn**: tour của bạn thường có sales cycle bao nhiêu ngày (từ lead → chốt)? Mình đề xuất 21 ngày, bạn confirm hay cần khác?
2. **Sales structure**: 1 sale tự handle 1 lead xuyên suốt, hay có handover (vd sales 1 qualify, sales 2 close)?
3. **Channels chính**: tour của bạn chủ yếu sell qua kênh nào — Zalo, Facebook, gọi điện, gặp mặt? Cần ưu tiên template channel đó.
4. **Loại tour**: inbound vs outbound vs domestic — script khác nhau. Có cần segment template theo loại không?
5. **Persona khách**: gia đình / nhóm bạn / công ty / honeymoon... 5 loại này có script khác nhau, làm cùng lúc hay từng loại?
6. **Manager review**: hằng tuần review sales activity hay live realtime monitor?
7. **Phép tự động hóa**: auto-tạo next action hay sales chủ động tạo thủ công? (recommend auto + cho phép sales override)
8. **Quote system**: hiện báo giá làm thế nào (file PDF / link / template gì)? Cần tích hợp luôn?

Trả lời 8 câu trên → mình tinh chỉnh spec cho phù hợp công ty bạn.

---

## 🎯 Kết luận

Lead Next Action System này **biến CRM từ "danh sách lead" thành "huấn luyện viên sales"**:
- Sales luôn biết phải làm gì tiếp
- Không quên ai, không spam
- Có script chuẩn, không bị "tê liệt" trước khách
- Manager đo được hiệu quả thực chất
- Khách cảm thấy được chăm sóc chứ không bị deal-pushed

**Đầu tư 6-8 tuần** triển khai đầy đủ, nhưng MVP 2 tuần đã đủ để thấy khác biệt rõ rệt. Đây là module tạo competitive moat — không phải feature thay được bằng copy.
