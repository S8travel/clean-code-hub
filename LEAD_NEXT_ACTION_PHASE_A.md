# 🎯 Lead Next-Action — Spec Phase A (rút gọn, sẵn sàng build)

> Refine từ `LEAD_NEXT_ACTION.md` sau khi chốt:
> **1 sale xuyên suốt 1 lead** · **auto-suggest + cho override (hybrid)** ·
> **Zalo first-class** (API sẽ có) · **call manual** (telephony để ngỏ).
> Nguyên tắc: engine + schema thiết kế đúng 1 lần · cadence/script là **data
> cập nhật dần** (không hardcode) · log gộp vào `lead_activity` (không tạo
> `lead_touch`) · KHÔNG build smart/engagement (Phase D) trên data test.

---

## 1. Phạm vi Phase A

**Làm:**
1. Schema: `lead_next_action`, `lead_cadence` (config), mở rộng `lead_activity` + vài cột `lead`.
2. Engine thuần: `computeNextAction(lead, lastOutcome, cadence) → draft`.
3. Vòng đời: tạo lead / đổi status / hoàn tất action → upsert **1 next action active**.
4. UI: Next-Action Box trên cùng LeadDrawer + trang **"Việc hôm nay"** cho sale.
5. Channel-agnostic: call / zalo / email / meeting / note. Zalo = deep-link
   `zalo.me/<sdt>` + log tay (cột sẵn cho API sau). Call = log tay
   (`duration_seconds` sẵn). Email = nút mở soạn, **gửi thật để Phase B**.

**KHÔNG làm ở A (đã thống nhất):** gửi template qua Resend (B) · webhook
open/click · anti-pester enforcement (C, chỉ thêm *cột* `do_not_contact`) ·
engagement score / best-time / channel-preference (D). Funnel/loss (E) làm
song song như mảng rẻ riêng — không nằm trong A.

---

## 2. Schema

> Theo CLAUDE.md: **CREATE TABLE mới bắt buộc GRANT + RLS**; ALTER TABLE
> (thêm cột) KHÔNG cần grant. Policy đặt tên `auth_required` cho đồng bộ
> các bảng lead hiện có.

### 2.1 `lead_next_action` — 1 dòng active / lead

```sql
CREATE TABLE public.lead_next_action (
  id            bigserial PRIMARY KEY,
  lead_id       bigint NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
  channel       text NOT NULL,            -- call | zalo | email | meeting | note
  reason        text,                     -- "follow quote 2 ngày chưa rep"
  due_at        timestamptz NOT NULL,
  priority      text NOT NULL DEFAULT 'binh_thuong', -- gap | binh_thuong | khong_gap
  suggested_script text,                  -- Phase A: text tĩnh; Phase B: fill từ template
  source        text NOT NULL DEFAULT 'auto', -- auto | manual (manual = engine KHÔNG ghi đè)
  status        text NOT NULL DEFAULT 'pending', -- pending | done | skipped | snoozed
  done_at       timestamptz,
  outcome       text,                     -- xem enum §3.2
  outcome_note  text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);
-- 1 action active/lead: chỉ 1 dòng pending|snoozed cho mỗi lead
CREATE UNIQUE INDEX ux_lead_next_action_active
  ON public.lead_next_action(lead_id)
  WHERE status IN ('pending','snoozed');
CREATE INDEX ix_lna_due ON public.lead_next_action(due_at) WHERE status IN ('pending','snoozed');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_next_action TO authenticated, service_role;
GRANT SELECT ON public.lead_next_action TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.lead_next_action_id_seq TO authenticated, service_role;
ALTER TABLE public.lead_next_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_required" ON public.lead_next_action
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 2.2 `lead_cadence` — config nhịp (data, sửa dần — KHÔNG hardcode)

```sql
CREATE TABLE public.lead_cadence (
  id          bigserial PRIMARY KEY,
  stage       text NOT NULL,   -- moi | da_lien_he | dang_tu_van | da_bao_gia | cho_chot
  step_no     int  NOT NULL,   -- thứ tự touch trong stage
  channel     text NOT NULL,
  offset_hours int NOT NULL,   -- cách "mốc bắt đầu stage" bao nhiêu giờ
  priority    text NOT NULL DEFAULT 'binh_thuong',
  reason_tpl  text,            -- "Follow quote lần {step}, đã {offset} sau gửi"
  max_touches int NOT NULL,    -- trần touch của stage (Phase C mới enforce)
  active      boolean DEFAULT true,
  UNIQUE (stage, step_no)
);
-- + GRANT/RLS y hệt mẫu trên (đổi tên bảng + sequence)
```

> Cadence khởi tạo seed từ tham khảo (HubSpot/Close + chỉnh cho B2C tour
> VN, Zalo-first) → **sửa bằng sửa dòng dữ liệu, không deploy**. Đây là chỗ
> "tham khảo mạng + cập nhật dần".

### 2.3 Mở rộng bảng có sẵn (ALTER — không cần grant)

```sql
ALTER TABLE public.lead_activity
  ADD COLUMN channel          text,        -- call|zalo|email|meeting|note
  ADD COLUMN direction        text,        -- outbound|inbound
  ADD COLUMN outcome          text,        -- §3.2
  ADD COLUMN duration_seconds int,         -- cho call (telephony sau này điền)
  ADD COLUMN next_action_id   bigint REFERENCES public.lead_next_action(id) ON DELETE SET NULL,
  ADD COLUMN channel_ref      text;        -- id ngoài (Zalo msg id / call id) — để ngỏ API

ALTER TABLE public.lead
  ADD COLUMN do_not_contact        boolean DEFAULT false,
  ADD COLUMN do_not_contact_reason text,
  ADD COLUMN total_touches         int DEFAULT 0,
  ADD COLUMN last_touched_at       timestamptz;
```

> `lead_activity` = timeline DUY NHẤT (đã có UI). Không tạo `lead_touch`.
> `engagement_score / preferred_channel / preferred_time` → Phase D, **chưa thêm**.

---

## 3. Engine (thuần, testable, không AI)

### 3.1 Hàm lõi

```ts
type NextActionDraft = {
  channel: Channel; dueAt: string; priority: Priority;
  reason: string; suggestedScript?: string;
};
// Thuần: cùng input → cùng output. Không gọi network.
function computeNextAction(
  lead: Lead,
  lastOutcome: Outcome | null,
  cadence: LeadCadenceRow[],
): NextActionDraft | null   // null = không tạo (do_not_contact / vượt max_touches / terminal stage)
```

Quy tắc:
- `lead.do_not_contact` → `null`.
- `trang_thai ∈ {chot_deal, mat_khach}` → `null` (terminal; hậu mãi/re-engage = Phase sau).
- Ngược lại: lấy `lead_cadence` theo `stage = lead.trang_thai`, chọn `step_no`
  kế tiếp dựa trên số touch outbound đã log ở stage hiện tại + `lastOutcome`.
- `dueAt = mốc-bắt-đầu-stage + offset_hours`. Mốc = `ngay_lien_he_cuoi`
  (hoặc thời điểm vào stage; suy từ `lead_activity` mới nhất loại `doi_trang_thai`).
- Vượt `max_touches` của stage → `null` + UI gợi ý "Park 30 ngày" / "→ mất khách"
  (chỉ gợi ý ở A; enforce ở C).

### 3.2 Enum outcome (chốt cứng — nhỏ, đủ phủ)

`rep_interested` · `rep_need_info` · `rep_objection` · `no_response` ·
`refused` · `promised_later` · `wrong_info`

Bảng chuyển (seed §4 của doc gốc, rút gọn): vd `da_bao_gia` +
`no_response` → next = call/+24h/gap; `+ refused` → modal Mất khách;
`+ rep_interested` → đổi `cho_chot` + next call xác nhận.

### 3.3 Khi nào chạy engine (upsert 1 action active)

- Tạo lead → tạo next action stage `moi`.
- Đổi `trang_thai` (qua `update_lead_status` RPC đã có) → recompute.
- Hoàn tất action + nhập outcome → log `lead_activity`, `total_touches++`,
  `last_touched_at=now()`, recompute next.
- **Hybrid**: sale sửa box (đổi kênh/hạn/priority) hoặc "Tạo thủ công" →
  set `source='manual'` → engine **không ghi đè** tới khi action đó done/skip.

---

## 4. UI

### 4.1 Next-Action Box — trên cùng `LeadDrawer` (trên tabs)
- Hiển thị: icon kênh + tiêu đề · `priority` badge (semantic: 🔴`destructive`
  /🟠`warning`/⚪`muted` — dùng token Phase 0/2) · `reason` · `due_at`
  (đỏ nếu quá hạn) · `suggested_script` (A: text tĩnh từ cadence).
- Nút: **Đã làm** → modal outcome (§3.2) · **Hoãn** (+1d/+3d) · **Đổi kênh** ·
  **Bỏ qua** · **Tạo thủ công**. Zalo: nút **Mở Zalo** `zalo.me/<sdt>` rồi
  buộc chọn outcome (log tay). Call: nút **Gọi** `tel:` + outcome + duration tay.
- Không `<form>` — onClick/onBlur theo convention dự án.

### 4.2 Trang "Việc hôm nay" (`/viec-lead` — đề xuất route mới)
- Vì **1 sale xuyên suốt** → list = `lead_next_action` active JOIN lead
  WHERE `lead.assigned_to = currentUser`, nhóm **Quá hạn / Hôm nay / Sắp tới**.
- Tái dùng pattern list của MyJob/Dashboard "Cần theo dõi" (vừa làm) — không dựng mới từ đầu.
- Item click → mở `LeadDrawer`. Header: đếm + "Tuần này: N touches" (rẻ, từ `lead_activity`).
- Sidebar: badge số việc quá hạn (mở rộng `leadBadge` đã có trong `AppSidebar`).

### 4.3 Timeline (đã có) — nâng nhẹ
`lead_activity` thêm icon theo `channel`, hiển thị `outcome`, phân biệt
`source` auto/manual. Không đổi cấu trúc tab.

---

## 5. Query keys (theo convention)
```
["lead_next_action", leadId]      // box trong drawer
["my_next_actions", userId]       // trang Việc hôm nay
["lead_cadence"]                  // config (staleTime dài)
```
Invalidate sau mọi mutation outcome/status; KHÔNG invalidate `["leads"]` thừa.

---

## 6. Không làm ở A (ghi rõ để khỏi trôi scope)
Gửi template qua Resend · webhook open/click · inbound reply parsing (outcome
vẫn tự khai) · anti-pester enforce · engagement/smart · funnel (E làm riêng).

---

## 7. Vi-quyết định còn mở (đề xuất sẵn, bạn gật là chạy)
1. **Route "Việc hôm nay"**: route mới `/viec-lead` (đề xuất) hay nhét tab
   trong trang Lead hiện tại? → *Đề xuất route mới + badge sidebar.*
2. **Mốc bắt đầu stage**: dùng `ngay_lien_he_cuoi` nếu có, fallback activity
   `doi_trang_thai` mới nhất. → *Đề xuất vậy, không thêm cột.*
3. **Seed cadence**: mình seed bản nháp theo `LEAD_NEXT_ACTION.md` §2 (đã có
   sẵn số) cho bạn sửa sau. → *Đề xuất seed luôn, coi như giá trị khởi đầu.*

Gật 3 ý trên (hoặc sửa) → mình build theo thứ tự: migration → engine + test
→ box trong drawer → trang Việc hôm nay → seed cadence. Mỗi bước 1 commit,
verify tsc+build, push như các lần trước.
```
