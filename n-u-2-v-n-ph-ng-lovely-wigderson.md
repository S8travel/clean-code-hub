# Plan: Refactor pattern "Source of Truth" giữa Điều tour và Chi phí

## Context

`doan_ngay_item` (Điều tour) và `doan_chi_phi` (Chi phí) đang sync 2 chiều
không nhất quán → bug ẩn: user edit SL trong Chi phí → save Điều tour →
revert. Bằng chứng: chi_phi #1678 (đoàn 63, Cáp treo) — `chi_phi.so_luong=19`
còn `doan_ngay_item.so_luong=20`. Re-save Điều tour → revert về 20.

**Mental model mới** (clarified workflow):

| Section | Source of Truth | UI Chi phí input |
|---|---|---|
| Cảnh điểm / Dịch vụ | `doan_ngay_item` (Điều tour) | **Read-only** |
| Nhà hàng | `doan_ngay_item` + `nha_hang_set_menu` | **Read-only** |
| Khách sạn | `doan_chi_phi` (độc lập) | **Editable (giữ nguyên)** |

**Workflow nghiệp vụ**:
1. Rebooking (số khách đoàn đổi) → sửa Điều tour → cascade xuống chi phí
2. Phát sinh (1 khách mệt) → click "Điều chỉnh" trong Chi phí → tạo `cong_no`
   qua `useCreateAdjustment` (chỉ update `thanh_tien_thuc_te`, không đụng `so_luong`)
3. Tăng khách → cascade → status `thanh_toan_mot_phan` → user click "ĐNTT bổ sung"

---

## Trả lời 5 câu hỏi

### (a) Disable SL/đơn giá ở DV/NH có vỡ flow nào không?

**An toàn — không vỡ flow chính**, nhưng có 2 lưu ý:

- **DV/Cảnh điểm**: `use-dieu-tour.ts:462-493` cascade so_luong/don_gia từ
  `doan_ngay_item` xuống chi phí. Disable UI input → chỉ ngăn user edit;
  cascade vẫn chạy đầy đủ. Phát sinh dùng `useCreateAdjustment` (có sẵn).
- **NH**: `use-dieu-tour.ts:507-541` CHỈ cascade `mo_ta/nha_cung_cap_id` (không
  touch so_luong/don_gia). Display `so_khach` được pre-fill từ
  `soKhachDefault` qua prop của ChiPhiNHSection (line 191-208), user save thì
  ghi vào DB. Disable input → mất khả năng "ăn ít người hơn" tại Chi phí; phải
  dùng adjustment thay thế. Acceptable.
- **Extras** trong DV/NH section (`handleExtraSave` ở DV line 261+, NH line 920+):
  là rows tự tạo trong Chi phí (không có `ref_doan_ngay_item_id`). Cần GIỮ
  editable — phân biệt "main row" (có ref → disable) vs "extra row" (không ref → editable).
- **Edge case không thấy**: Excel import / batch ops không sửa
  `doan_chi_phi.so_luong` ở đâu khác. Legacy data fix → SQL trực tiếp (admin).

### (b) `thanh_tien_thuc_te` cũ + rebooking giảm

**CÓ rủi ro lệch — đề xuất CLEAR khi cascade.**

Scenario: chi phí gốc 20×1.15tr=23M, user adjust thuc_te=21.85M (1 khách mệt
→ thanh toán thực 19 vé). Rebooking sau đó giảm còn 15 khách → cascade
`so_luong=15` → `thanh_tien` (generated) = 17.25M. `thanh_tien_thuc_te` vẫn
= 21.85M (cũ, > gross mới).

`recalc_chi_phi_payment_status` dùng `COALESCE(thanh_tien_thuc_te, thanh_tien)`
làm baseline → vẫn so với 21.85M (đã stale). Nếu da_tt = 17.25M (chỉ trả gross
cũ 15 khách), status = `thanh_toan_mot_phan` → kế toán hiểu "còn thiếu 4.6M"
trong khi thực tế gross mới chỉ 17.25M → SAI.

**Đề xuất**: Khi cascade so_luong/don_gia thay đổi (UPDATE branch), CLEAR
`thanh_tien_thuc_te = NULL` để recalc fall back về thanh_tien gross mới. OP cần
adjustment mới thì tự tạo từ baseline mới.

### (c) Cascade tăng khách → cần tạo ĐNTT bổ sung như nào?

**UI đã hỗ trợ đầy đủ — không cần thêm gì.**

Sau cascade tăng (15→20): `so_tien_da_dntt` = 17.25M (DNTT cũ frozen),
`thanh_tien` mới = 23M. `recalc` set `trang_thai_dntt = thanh_toan_mot_phan`
+ `trang_thai_thanh_toan = partial_paid`. UI tất cả Chi phí section đã có
flow "ĐNTT bổ sung" (`isBSMode` / `dnttBsAmount` ở 5 file: NH, DV, BaoHiem,
Xe, Visa). User mở modal → nhập delta → tạo DNTT mới. Tự động tính số bổ sung.

### (d) NH `tien_cong_ty=0, tien_hdv=0` cho cả 2 payer (use-dieu-tour:520-528)

**Đây là BUG cùng họ với canh_diem bug.** Cả 2 branch set =0:
```typescript
if (mealNtt === "hdv") { chiPayload.tien_hdv = 0; chiPayload.tien_cong_ty = 0; }
else                   { chiPayload.tien_cong_ty = 0; chiPayload.tien_hdv = 0; }
```

NH chiPayload không có so_luong/don_gia → `thanh_tien` (generated) đúng theo
DB cũ. Nhưng `tien_cong_ty/hdv` bị reset 0 mỗi lần save Điều tour. Sau đó
ChiPhiNHSection.handleSave (line 395+) re-tính + ghi đè đúng — **chỉ khi user
manually save trong NH section**. Nếu user chỉ save Điều tour mà không vào
NH section → `tien_cong_ty/hdv = 0` persisted trong DB.

Báo cáo / aggregate query nào dùng `tien_cong_ty + tien_hdv` thay vì
`thanh_tien` → sai. (Vd: dashboard tổng chi phí công ty/HDV.)

**Đề xuất**: Áp pattern alwaysFields/initialFields cho NH (như canh_diem) —
UPDATE chỉ touch master metadata (`mo_ta, nha_cung_cap_id`), KHÔNG touch
`tien_cong_ty/hdv`. INSERT mới set initial = 0 (đúng vì chưa biết so_khach
NH cụ thể, user vào NH section save sau).

### (e) KS — có bị đè không?

**KHÔNG bị — KS độc lập 100%.**

`use-dieu-tour.ts:461` skip day-use wrapper (`if (cd?.khach_san_id) continue;`).
`use-dieu-tour.ts:498` comment: "KS chi phí is managed manually in Chi phí
tab, not auto-generated here". Toàn bộ flow KS chi_phi (overnight + day-use)
qua `ChiPhiKSSection.handleBlurSave` → `useUpsertChiPhi` trực tiếp. Không
code path nào khác đụng `doan_chi_phi WHERE danh_muc='khach_san'`. KS
section input giữ editable hoàn toàn.

---

## Đề xuất thay đổi cụ thể

### Change 1 — Fix bug cascade overwrite (canh_diem + NH)

**File**: `src/hooks/use-dieu-tour.ts`

**1a. Canh_diem upsert (line 462-493)**: Tách payload thành alwaysFields vs initialFields.
- alwaysFields: `doan_id, ngay_so, loai, danh_muc, ref_doan_ngay_item_id, ref_doan_ngay_id, mo_ta, nha_cung_cap_id`
- initialFields: `don_gia, so_luong, tien_cong_ty, tien_hdv`
- INSERT: `{...alwaysFields, ...initialFields}` (full)
- UPDATE: chỉ alwaysFields + **CLEAR `thanh_tien_thuc_te = NULL` nếu detect đoàn rebooking** (so sánh item.so_luong DB cũ vs mới — cần fetch trước upsert)

**1b. NH upsert (line 507-543)**: Tách tương tự.
- alwaysFields: `doan_id, ngay_so, loai, danh_muc, ref_doan_ngay_id, mo_ta, nha_cung_cap_id`
- initialFields (chỉ INSERT): `tien_cong_ty=0, tien_hdv=0`
- UPDATE: chỉ alwaysFields (không reset tien_*)

### Change 2 — Disable UI input ở DV/NH (main rows only)

**File**: `src/components/chi-phi/ChiPhiDVSection.tsx`

Line 678-699: thay 2 `<DVInput>` (so_luong, don_gia) bằng read-only display
**KHI `row.ref_doan_ngay_item_id != null`** (main row link với điều tour).
Khi `ref = null` (extras) — giữ editable. Tooltip: "Sửa số khách trong Điều
tour. Phát sinh dùng nút Điều chỉnh."

Line 261+ `handleExtraSave` + line 911-922 (extras): không đổi.

**File**: `src/components/chi-phi/ChiPhiNHSection.tsx`

Line 960-991: `<NHInput>` cho so_khach + don_gia → read-only display khi row
là main meal (`row.id` exists từ `mainCp`). Tooltip tương tự.

CK% input (line 994-1005) và FOC editor (line 945-952) — **GIỮ EDITABLE**
(chiết khấu + FOC không phải Điều tour scope, là Chi phí scope).

### Change 3 — Update CLAUDE.md với pattern

**File**: `CLAUDE.md`

Thêm section "🔄 Source of Truth: Điều tour ↔ Chi phí":
- Bảng phân chia entity (DV/NH = item, KS = chi_phi)
- Rule cascade: Điều tour save → cascade INSERT-once cho chi_phi mới; UPDATE
  chỉ master metadata (KHÔNG so_luong/don_gia/tien_*)
- Phát sinh dùng `useCreateAdjustment` (chỉ thuc_te, không touch so_luong)
- Rebooking thay đổi so_luong → CLEAR thanh_tien_thuc_te (nếu có) để tránh stale baseline

---

## Decisions (user confirmed)

1. **`thanh_tien_thuc_te` khi cascade**: AUTO CLEAR về NULL khi detect
   so_luong/don_gia thay đổi. Recalc fall back về thanh_tien gross mới.
2. **Extras**: GIỮ editable. Disable chỉ áp main rows (`ref_doan_ngay_item_id IS NOT NULL`).
3. **Row #1678 stale data**: KHÔNG fix (test data). Mặc kệ; sẽ tự revert
   lần save Điều tour kế tiếp.

---

## Files modified (summary)

| File | Loại change |
|---|---|
| `src/hooks/use-dieu-tour.ts` | Tách INSERT/UPDATE payload (canh_diem + NH); clear thanh_tien_thuc_te khi rebooking |
| `src/components/chi-phi/ChiPhiDVSection.tsx` | Read-only SL/đơn giá cho main rows (giữ editable cho extras) |
| `src/components/chi-phi/ChiPhiNHSection.tsx` | Read-only so_khach/đơn giá main meal (giữ CK% + FOC editable) |
| `CLAUDE.md` | Thêm rule "Source of Truth" |
| `src/hooks/use-chi-phi.ts` | Không đổi — `useUpsertChiPhi` generic vẫn dùng cho KS + extras |
| `src/hooks/use-dntt.ts` | Không đổi — `useCreateAdjustment` đã đúng (fix lần trước dùng so_tien_da_dntt) |
| `src/components/chi-phi/ChiPhiKSSection.tsx` | KHÔNG ĐỔI — KS độc lập |

---

## Verification

1. **Cascade rebooking giảm**: đoàn 20→15 trong Điều tour → save → check chi_phi
   canh_diem.so_luong=15, thanh_tien_thuc_te=NULL, tien_cong_ty đúng theo gross mới.
2. **Cascade rebooking tăng**: 15→20 → check status `thanh_toan_mot_phan`
   trong UI. Click "ĐNTT bổ sung" → tạo DNTT delta đúng.
3. **Phát sinh**: vào Chi phí → main row SL hiện read-only (không edit được)
   → click "Điều chỉnh" → nhập số tiền thực → cong_no tạo đúng.
4. **Extras**: tạo extra trong DV section → SL/đơn giá vẫn editable, save OK.
5. **NH meal**: vào Chi phí NH section → so_khach hiện read-only; CK% và FOC
   vẫn editable; save lại Điều tour → tien_cong_ty/hdv KHÔNG bị reset 0.
6. **KS**: tab Chi phí KS không bị ảnh hưởng — edit SL phòng/giá/FOC bình thường.
7. **Build**: `npm run build` pass 0 TS error.
