# CLAUDE.md — S8 Travel CRM
> Verified từ DB thực tế (lflsbwoqzmbknzdpaequ) + source code. Cập nhật khi đổi schema.

## ⚙️ Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- TanStack Query v5 (React Query)
- Supabase (PostgreSQL) — project `lflsbwoqzmbknzdpaequ`
- React Router v6 · sonner (toast) · docx (Word export)

## 🗄️ Supabase Client
```typescript
import { externalSupabase } from "@/lib/supabase-external";
// URL: https://lflsbwoqzmbknzdpaequ.supabase.co
```

---

## 📊 Database Schema

### Đoàn tour (core)
```
doan
  id, ten_doan, agent_id, dia_diem_id, huong_dan_vien_id
  xe_id → nha_xe_loai_xe  (KHÔNG phải bảng xe cũ)
  seri_id → seri_tour     (template lịch trình)
  so_khach, so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl
  ngay_di, ngay_ve
  trang_thai: 'dang_chay'|'huy'
  loai_tour: 'inbound'|'outbound'|'noi_dia'|null
  booking_status: 'chua_booking'|...
  bang_don, shopping, truong_doan
  chuyen_bay_don, chuyen_bay_tien
  tang_pham (jsonb []), ghi_chu_dieu_tour, ghi_chu
  assigned_to (uuid→auth.users), created_by (uuid)
  agent_huy_id, ly_do_huy

doan_ngay
  id, doan_id, ngay_so, ngay_date, thu, thanh_pho
  an_trua_nha_hang_id, an_trua_set_menu_id, an_trua_so_khach
  an_toi_nha_hang_id,  an_toi_set_menu_id,  an_toi_so_khach
  khach_san_id, ks_ma_code, ks_loai_phong

doan_ngay_item
  id, doan_ngay_id, doan_id, canh_diem_id
  thu_tu, co_phi, don_gia, so_luong
  thanh_tien  ← GENERATED (don_gia*so_luong), KHÔNG insert
  nguoi_thanh_toan, ghi_chu
```

### Booking
```
doan_booking_ks       (1 row/KS/đoàn)
  id, doan_id, khach_san_id
  ks_dat_truoc, ks_dat_truoc_status, ks_dat_truoc_sent_at/by/confirm_at
  ks_final, ks_final_status, ks_final_sent_at/by/confirm_at
  ngay_snapshot (jsonb), chi_phi

doan_ks_dem           (chi tiết phòng/đêm)
  id, doan_id, booking_ks_id
  ngay_date, loai_phong, so_phong, gia_phong

doan_booking_nh       (1 row/ngày/bữa)
  id, doan_id, doan_ngay_id, nha_hang_id
  bua_an: 'trua'|'toi'
  set_menu_id, booking_status
  ten_set_snapshot, gia_snapshot, mon_an_snapshot (jsonb)

doan_booking_dv
  id, doan_id, ten_nha_cung_cap, email_nha_cung_cap
  dich_vu_list (jsonb), booking_status
```

### Chi phí & Thanh toán
```
doan_chi_phi
  id, doan_id, ngay_so
  loai: 'chi'|...
  danh_muc: 'khach_san'|'nha_hang'|'canh_diem'|'dich_vu'|'phi_khac'
  ref_doan_ngay_id, ref_doan_ngay_item_id
  mo_ta, don_gia, so_luong
  thanh_tien        ← GENERATED, KHÔNG insert
  thanh_tien_thuc_te (nullable, override khi điều chỉnh sau da_tt)
  tien_cong_ty, tien_hdv
  trang_thai_thanh_toan: 'unpaid'|'partial_paid'|'paid'
    ← COMPUTED bằng RPC recalc_chi_phi_payment_status, không set thủ công
  trang_thai_dntt: 'chua_gui'|'da_gui'|...
  de_nghi_tt_id, so_tien_da_dntt, so_tien_da_tt
  nha_cung_cap_id, is_excluded
  thanh_toan_dinh_ky (bool) — TRUE=gộp thanh toán theo NCC định kỳ

de_nghi_thanh_toan    (ĐNTT — chỉ là REQUEST sau refactor 2026-05)
  id, doan_id (nullable khi loai='dinh_ky'), loai, mo_ta
  nha_cung_cap_id, ten_nha_cung_cap, so_tai_khoan, ngan_hang
  so_tien, la_coc (bool), ty_le_coc
  trang_thai_duyet: 'cho_duyet'|'da_duyet'|'tu_choi'|'da_huy'
  tao_boi, tao_luc, duyet_boi, duyet_luc
  ngay_can_thanh_toan, hoa_don_url, unc_url, trang_thai_hoa_don, trang_thai_unc
  ref_loai, ref_id   ← liên kết nguồn (khach_san, doan_chi_phi, dinh_ky)
  ghi_chu            ← log điều chỉnh, [Thu hồi] cho HDV được append vào đây
  ← KHÔNG còn: trang_thai_thanh_toan, thanh_toan_luc, linked_dntt_id, so_tien_con_lai

payments              (mới — record actual payment events)
  id, dntt_id (FK→dntt, ON DELETE CASCADE)
  method: 'cash'|'can_tru'
  so_tien (>0), ngay_thanh_toan
  cong_no_id (FK→cong_no, NULL khi cash, NOT NULL khi can_tru)
  ghi_chu, tao_boi, tao_luc

cong_no               (mới — debt records từ overpayment / refund)
  id, doan_id (đoàn nguồn), dntt_goc_id (FK→dntt)
  nha_cung_cap_id, ten_nha_cung_cap
  so_tien_goc (>0)
  trang_thai: 'con_du'|'da_can_tru'|'da_hoan_tien'
  ly_do, ngay_tao, ghi_chu

dntt_with_payment_status (VIEW)
  ← de_nghi_thanh_toan + paid_amount, payment_status, thanh_toan_luc
  paid_amount = SUM(payments.so_tien)
  payment_status = 'unpaid'|'partial'|'paid'

cong_no_with_status (VIEW)
  ← cong_no + so_tien_da_dung, so_tien_con_lai
  so_tien_con_lai = so_tien_goc - SUM(can_tru payments)

dntt_allocations      (ĐNTT → nhiều chi_phi, RLS enabled)
  id, dntt_id, chi_phi_id, so_tien, ghi_chu
  UNIQUE (dntt_id, chi_phi_id)
  ON DELETE CASCADE từ de_nghi_thanh_toan
```

### Danh mục
```
khach_san       id, ten, dia_chi, dia_diem, foc_khach, foc_mien
                nguoi_thanh_toan, nha_cung_cap_id, email, so_dien_thoai, website

nha_hang        id, ten, dia_chi, dia_diem, foc_khach, foc_mien
                chiet_khau_phan_tram
                nguoi_thanh_toan, nha_cung_cap_id, email, so_dien_thoai, website, hinh_anh

nha_hang_set_menu     id, nha_hang_id, ten_set, gia, don_vi, ghi_chu
nha_hang_set_menu_mon id, set_menu_id, ten_mon, thu_tu

canh_diem       id, ten, dia_diem, loai, co_phi, gia_mac_dinh, don_vi
                nguoi_thanh_toan, nha_cung_cap_id

nha_xe          id, ten, dia_diem, email, nguoi_thanh_toan, nha_cung_cap_id  [RLS]
nha_xe_loai_xe  id, nha_xe_id, ten_xe, so_cho, gia, don_vi                  [RLS]
                ← doan.xe_id trỏ vào bảng này (KHÔNG phải bảng xe cũ)

nha_cung_cap    id, ten, ma_so_thue, email, so_dien_thoai
                dia_diem, dia_chi, ngan_hang, so_tai_khoan

agents          id, ten
huong_dan_vien  id, ten, gioi_tinh, nam_sinh, kinh_nghiem, chuyen_mon
                agent_ids (int[] array), ghi_chu
dia_diem        id, ten
```

### Seri tour (template lịch trình)
```
seri_tour           id, ten_seri, mo_ta
seri_tour_ngay      id, seri_id, ngay_so, thanh_pho
                    an_trua/toi_nha_hang_id, an_trua/toi_set_menu_id
                    khach_san_id, ks_loai_phong, ks_ma_code
seri_tour_ngay_item id, seri_ngay_id, canh_diem_id, thu_tu
                    co_phi, don_gia, nguoi_thanh_toan, ghi_chu
```

### Visa
```
don_vi_visa   id, ten, email, so_dien_thoai, nha_cung_cap_id  [RLS]
loai_visa     id, don_vi_visa_id, quoc_gia, loai, thoi_han, gia, don_vi  [RLS]
```

### Hệ thống
```
user_roles      id(uuid), user_id(uuid)
                role: 'admin'|'dieu_hanh'|'viewer'
                bo_phan: 'dieu_hanh'|'ke_toan'
                ho_ten, email, so_dien_thoai, active, ghi_chu

doan_permissions  id, doan_id, user_id, ho_ten
                  quyen: 'view'|'edit'
```

---

## 📁 File Structure

```
src/
├── components/
│   ├── chi-phi/
│   │   ├── ChiPhiTab.tsx          # Tab tổng hợp
│   │   ├── ChiPhiKSSection.tsx    # Section KS (local state + sessionStorage)
│   │   ├── ChiPhiNHSection.tsx    # Section NH
│   │   ├── KSRowInput.tsx
│   │   ├── KSDNTTModal.tsx
│   │   ├── KSCongNoPanel.tsx
│   │   ├── DNTTTab.tsx
│   │   ├── ThanhToanCell.tsx
│   │   └── ChiPhiHeader.tsx
│   ├── dieu-tour/
│   │   ├── DayScheduleTable.tsx
│   │   ├── DayRow.tsx
│   │   ├── BookingKSTab.tsx
│   │   ├── DoanInfoSection.tsx
│   │   ├── GuestCountSection.tsx
│   │   └── GiftTagsSection.tsx
│   ├── booking-dv/
│   └── menu/
├── hooks/
│   ├── use-dieu-tour.ts      # logic save tour (doan_ngay, doan_ngay_item)
│   ├── use-chi-phi.ts        # ChiPhiRow, DNTTRow, useChiPhiList, useDNTTList (per doan)
│   ├── use-dntt.ts           # DNTTRow, useDNTTList (view), useApproveDNTT,
│   │                         # useRejectDNTT, useMarkPaidDNTT, useCancelDNTT,
│   │                         # useCreateAdjustment, recalcChiPhiStatus
│   ├── use-payments.ts       # PaymentRow, usePaymentsForDNTT, usePaymentsByChiPhi,
│   │                         # useCreatePayment (cash/can_tru), useDeletePayment
│   ├── use-cong-no.ts        # CongNoRow, useCongNoList, useCongNoByNCC,
│   │                         # useUpdateCongNoStatus, appendCanTruLog
│   ├── use-chi-phi-nh.ts
│   ├── use-chi-phi-hdv.ts
│   ├── use-thanh-toan-dinh-ky.ts   # thanh_toan_dinh_ky=true, useCreateBatchDNTT
│   ├── use-booking-ks/nh/dv.ts
│   ├── use-khach-san/nha-hang/canh-diem/nha-cung-cap.ts
│   ├── use-hoa-don-unc.ts
│   ├── use-hdv.ts
│   ├── use-nha-xe.ts
│   ├── use-seri.ts
│   ├── use-visa.ts
│   └── use-doan.ts
├── pages/
│   ├── DoanDetail.tsx        # trang chính, tabs: Điều Tour, Booking KS, Menu, DV, Chi phí, ĐNTT
│   ├── Index.tsx             # danh sách đoàn
│   ├── DashboardPage.tsx
│   ├── DNTTPage.tsx          # kế toán duyệt ĐNTT toàn hệ thống
│   ├── CongNoPage.tsx        # quản lý công nợ NCC
│   ├── HoaDonUNCPage.tsx     # quản lý hóa đơn + UNC
│   ├── ThanhToanDinhKyPage.tsx  # thanh toán gộp theo NCC định kỳ
│   ├── HDVPage.tsx
│   ├── NguoiDungPage.tsx
│   ├── KhachSanPage.tsx
│   ├── NhaHangPage.tsx
│   ├── CanhDiemPage.tsx
│   ├── NhaCungCapPage.tsx
│   ├── NhaXePage.tsx
│   ├── SeriPage.tsx
│   ├── VisaPage.tsx
│   └── LoginPage.tsx
└── lib/
    ├── supabase-external.ts
    └── export-*.ts
```

---

## 🔄 Routes
```
/                       → Index (danh sách đoàn)
/doan/:id               → DoanDetail (tabs: Điều Tour, Booking KS, Menu, Booking DV, Chi phí, Đề nghị TT)
/de-nghi-thanh-toan     → DNTTPage (kế toán duyệt)
/cong-no                → CongNoPage
/hoa-don-unc            → HoaDonUNCPage
/thanh-toan-dinh-ky     → ThanhToanDinhKyPage
/quan-ly/nha-hang
/quan-ly/khach-san
/quan-ly/canh-diem
/quan-ly/nha-cung-cap
/quan-ly/nha-xe
/quan-ly/hdv
/quan-ly/seri
/quan-ly/visa
/nguoi-dung
/login
```

---

## 💻 Coding Patterns

### Query
```typescript
const { data } = useQuery({
  queryKey: ["ten_bang", doanId],
  enabled: !!doanId,
  queryFn: async () => {
    const { data, error } = await externalSupabase
      .from("ten_bang").select("*").eq("doan_id", doanId!);
    if (error) throw error;
    return data;
  },
});
```

### Mutation
```typescript
const qc = useQueryClient();
const mut = useMutation({
  mutationFn: async (payload) => { ... },
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["ten_bang"] }); },
});
```

### Auto-save (blur)
```typescript
// KHÔNG dùng form submit — dùng onBlur
<Input value={local} onChange={e => setLocal(e.target.value)}
       onBlur={() => mutation.mutate({ id, value: local })} />
```

### Local state + ref pattern
```typescript
const [rows, setRows] = useState([]);
const rowsRef = useRef(rows);
useEffect(() => { rowsRef.current = rows; }, [rows]); // cho blur callbacks
```

---

## 💰 Kế toán Rules

### Người thanh toán
```
cong_ty → tien_cong_ty = thanh_tien, tien_hdv = 0
hdv     → tien_hdv = thanh_tien, tien_cong_ty = 0
```

### FOC nhà hàng (theo khách)
```
so_mien    = floor(so_khach / foc_khach) * foc_mien
thanh_tien = (so_khach - so_mien) * don_gia
```

### FOC khách sạn (theo phòng × ĐÊM, KHÔNG nhân so_dem)
```
Mỗi LocalKSRow đại diện cho 1 ĐÊM (so_dem hiện luôn = 1).
Group rows by ngay_date → tính FOC PER NIGHT:
  dayRooms     = sum(so_phong)             (KHÔNG * so_dem)
  dayGross     = sum(so_phong * gia_phong) (KHÔNG * so_dem)
  focPhong     = floor(dayRooms / foc_khach) * foc_mien
  avgPrice     = dayGross / dayRooms
  dayFocAmount = focPhong * avgPrice       (= tiền 1 đêm phòng FOC)
  rowFocDeduction = (rowGross / dayGross) * dayFocAmount
```
**LƯU Ý**: `calcFocDeduction` (display) và `handleBlurSave` (DB) PHẢI dùng cùng formula.
Lệch nhau ở `* so_dem` → user thấy số khác số trong `doan_chi_phi.tien_cong_ty`.

### KHÔNG insert generated columns
```typescript
// Luôn destructure bỏ thanh_tien trước khi insert/update
const { thanh_tien, ...payload } = data;
await externalSupabase.from("doan_chi_phi").insert(payload);
```

### Hiển thị tiền
```typescript
n.toLocaleString("vi-VN") + " VND"
```

---

## 🔄 HYBRID Pattern: Điều tour ↔ Chi phí (cảnh điểm + nhà hàng)

`doan_chi_phi.so_luong` và `don_gia` là FIELDS BIDIRECTIONAL với flag `is_overridden`:
- Default (`is_overridden=false`): cascade từ Điều tour mỗi lần save
- OP override (`is_overridden=true`): cascade Điều tour BỎ QUA row đó, giữ giá trị OP
- Reset (↺ button): set `is_overridden=false` → cascade lần sau sync lại

### Workflow nghiệp vụ

1. **Rebooking** (~100% đoàn): OP sửa số khách trong **danh sách đoàn (DoanDrawer)** →
   save. `useUpdateDoan` cascade tự động:
   - `doan_ngay_item.so_luong` cho items chưa customized (= old total) → new total
   - `doan_chi_phi.so_luong` (canh_diem + NH + bao_hiem) cho non-override + non-paid rows
   - Bao_hiem dùng công thức `newTotal × soNgay` (compute từ ngay_di/ngay_ve)
   - Reset `thanh_tien_thuc_te = NULL` (adjustment cũ stale theo gross mới)
   - Recalc status sau cùng
   - Override row + paid/partial_paid row được GIỮ — cần adjustment riêng nếu cần.
   - **SKIP extras** (mo_ta `[dvps_<id>] `, `[trua] `, `[toi] `): dịch vụ phát sinh độc lập với tổng khách.
   - **VẪN cascade `cho_duyet`/`da_duyet`** rows nhưng track qua `committedDnttAffected` counter
     → caller toast warning user (DNTT cũ chưa khớp số tiền mới, cần sửa DNTT.so_tien hoặc hủy & tạo lại).
   - UI: row có `cho_duyet`/`da_duyet` DNTT mà `chi_phi total ≠ DNTT committed` → hiện badge
     "⚠ DNTT lệch X" trên cell TT ĐNTT (DV + NH section).
   - Toast warning user nếu thucTeClearCount > 0 hoặc committedDnttAffected > 0.

2. **Phát sinh trước thanh toán** (chưa book NCC): OP edit so_luong/đơn giá trực
   tiếp ở Chi phí section → flag `is_overridden=true` tự set qua `handleRowSave`.

3. **Phát sinh sau thanh toán NCC** (Aggregate-after-edits pattern, DV+NH):
   - Input bị disable (lock theo `trang_thai_thanh_toan IN ('paid','partial_paid')`)
   - OP nhấn "Điều chỉnh" (sliders) → modal nhập **SL + đơn giá thực tế** (NH có FOC + chiết khấu)
     → `useUpdateChiPhiActual` chỉ update chi_phi state (so_luong, don_gia, tien_*,
     thanh_tien_thuc_te, is_overridden=true). KHÔNG tạo cong_no/DNTT ngay.
   - OP có thể thêm **extras** (rows phát sinh) qua nút ➕ — handleExtraSave save ngay
   - Sau khi xong, hệ thống auto-compute **aggregate delta toàn nhóm**:
     - `group = main row + extras` (extras filter theo prefix mo_ta)
     - `delta = sumActual_công_ty - sumPaid_công_ty` (CHỈ rows có `tien_cong_ty > 0`,
       loại HDV-paid rows vì HDV trả cash trên đường, không qua flow ĐNTT)
     - `sumActual = SUM(thanh_tien_thuc_te ?? tien_cong_ty)`
     - `sumPaid = SUM(so_tien_da_tt)` (paid amount qua RPC)
   - Footer mỗi nhóm hiện 1 button:
     - `delta > 0` (thiếu) → "Thanh toán bổ sung X ₫" (orange) → tạo DNTT bổ sung
     - `delta < 0` (thừa) → "Ghi nhận công nợ X ₫" (purple) → tạo cong_no
     - `delta = 0` → ẩn cả 2 (đã cân bằng)
   - "ĐNTT bổ sung" cũ (trên row) đã REMOVED — replaced bởi aggregate footer button.
   - Group key:
     - DV: extras prefix `[dvps_<main.id>] `, ref_doan_ngay_id = main.ref_doan_ngay_id
     - NH: extras prefix `[trua] ` / `[toi] `, ref_doan_ngay_id = main.ref_doan_ngay_id

4. **Reset**: ↺ button cạnh row → set `is_overridden=false` → cascade lần sau sync.

5. **Khách sạn**: KHÔNG cascade từ Điều tour. KS độc lập, edit SL/giá/FOC tự do trong KS section.

### Implementation pattern

**Cảnh điểm cascade** (`use-dieu-tour.ts`):
```typescript
const { data: existing } = await select("id, so_luong, don_gia, is_overridden")
  .eq("ref_doan_ngay_item_id", item.id).maybeSingle();

if (existing) {
  if (existing.is_overridden) {
    // OP-owned → CHỈ master metadata (mo_ta, nha_cung_cap_id, ref)
    await update(masterFields).eq("id", existing.id);
  } else {
    // Default cascade. Nếu so_luong/don_gia đổi → clear thanh_tien_thuc_te
    // (adjustment cũ tính từ gross cũ, sẽ stale).
    const soLuongChanged = ...;
    const updatePayload = { ...masterFields, ...pricingFields };
    if (soLuongChanged) {
      updatePayload.thanh_tien_thuc_te = null;
      counters.thucTeClearCount++;  // toast cho user biết
    }
    await update(updatePayload).eq("id", existing.id);
  }
} else {
  await insert({ ...masterFields, ...pricingFields });  // is_overridden = DB default false
}
```

**Nhà hàng cascade** (alwaysFields/initialFields split):
- alwaysFields: `mo_ta, nha_cung_cap_id, ref_doan_ngay_id`... (UPDATE OK)
- initialFields: `tien_cong_ty=0, tien_hdv=0` (CHỈ INSERT)
- UPDATE chỉ alwaysFields → KHÔNG reset tien_* (NH section quản lý qua handleSave)

**Pre-check DNTT trước delete chi_phi** (use-dieu-tour cleanup):
- Fetch `dntt_allocations` cho chi_phi.id. Nếu có → throw error tiếng Việt cụ thể
  (DNTT id + tên cảnh điểm). User phải hủy DNTT trước.

**Caller toast** (DoanDetail.tsx onSuccess):
```typescript
const x = result?.thucTeClearCount ?? 0;
if (x > 0) {
  toast.warning(`Đã reset điều chỉnh thanh_tien_thuc_te trên ${x} chi phí
  do thay đổi số khách/đơn giá.`, { duration: 6000 });
}
```

### UI rules

**ChiPhiDVSection / ChiPhiNHSection** (main rows / main meals):
- Input editable mặc định
- `is_overridden=true` → 🔒 indicator + ↺ reset button
- `trang_thai_thanh_toan IN ('paid','partial_paid')` → input disabled, tooltip
  "Đã có thanh toán — dùng nút Điều chỉnh để track công nợ"
- User edit → `handleSave` set `is_overridden: true` trong payload
- Extras (rows tự tạo, ref=null hoặc nằm `extrasMap`): editable luôn, KHÔNG dùng flag

**ChiPhiKSSection**: KHÔNG đổi — KS độc lập, không có flag is_overridden cần thiết.

---

## 🔄 Luồng ĐNTT (Đề nghị Thanh Toán) — refactor 2026-05

### Concepts (3 entity tách biệt)
- **`de_nghi_thanh_toan`** — chỉ là REQUEST. Lifecycle: `cho_duyet → da_duyet → tu_choi/da_huy`.
- **`payments`** — record mỗi event thanh toán (cash hoặc can_tru). Tạo qua `useCreatePayment`.
- **`cong_no`** — debt record từ overpayment hoặc cancel-after-paid. Lifecycle: `con_du → da_can_tru` hoặc `da_hoan_tien`.

### Trạng thái dntt — chỉ approval
```
trang_thai_duyet: cho_duyet → da_duyet → tu_choi (gửi lại → cho_duyet)
                  bất kỳ   → da_huy
```

### Payment status (derived qua view dntt_with_payment_status)
```
paid_amount    = SUM(payments.so_tien WHERE dntt_id = X)
payment_status = 'unpaid'  (paid_amount = 0)
               | 'partial' (0 < paid_amount < so_tien)
               | 'paid'    (paid_amount >= so_tien)
```

### Flow chuẩn
```
1. Tạo ĐNTT     → INSERT dntt {trang_thai_duyet:'cho_duyet'}
2. Duyệt        → UPDATE dntt SET trang_thai_duyet='da_duyet'
3. Mark paid    → INSERT payment {method:'cash', so_tien:remaining}
                  (qua useMarkPaidDNTT/useMarkPaidWithDate)
4. Sau mỗi bước → gọi recalcChiPhiStatus(chiPhiIds) để update doan_chi_phi
```

### Trạng thái doan_chi_phi (computed)
```
trang_thai_thanh_toan: 'unpaid' | 'partial_paid' | 'paid'
  ← Tính qua RPC recalc_chi_phi_payment_status — dùng SUM(payments) thay vì status DNTT
```

### Điều chỉnh sau khi đã thanh toán

**DV + NH section** (current pattern — "Aggregate-after-edits"):
- Modal "Điều chỉnh" → `useUpdateChiPhiActual` chỉ update chi_phi state
  (so_luong, don_gia, tien_*, thanh_tien_thuc_te, is_overridden=true).
  KHÔNG tạo cong_no/DNTT ngay.
- Footer per group commit button (tính `delta = sumActual_company - sumPaid_company`):
  - `delta > 0` → INSERT dntt loai='dich_vu'/'nha_hang', mo_ta='[Bổ sung] ...', cho_duyet
  - `delta < 0` → INSERT cong_no với so_tien_goc=abs(delta), trang_thai='con_du'
- Xem section "🔄 Source of Truth Pattern" → workflow #3 cho UX detail.

**KS section + legacy use** (`useCreateAdjustment`):
```
delta = soTienThucTe - currentTotal
       currentTotal = SUM(chi_phi.so_tien_da_dntt) trên các chi_phi liên kết qua
                      dntt_allocations của dnttGoc.
       so_tien_da_dntt là COMMITMENT THẬT (sum allocs từ DNTT không huỷ),
       computed bởi RPC recalc_chi_phi_payment_status.

delta > 0 (thiếu) → tạo ĐNTT bổ sung [Bổ sung], cho_duyet
delta < 0 (thừa) → tạo cong_no với so_tien_goc=abs(delta), trang_thai='con_du'/'da_hoan_tien'

Cập nhật thanh_tien_thuc_te trên doan_chi_phi:
  newThucTe[i] = proRataInts(soTienThucTe, allocs.map(a => a.so_tien))[i]
  → SET ABSOLUTE (= pro-rata của soTienThucTe theo alloc proportion)
  → KHÔNG cộng dồn delta vào base!
```
**LƯU Ý 2 nguồn dữ liệu KHÔNG được nhầm**:
- `dnttGoc.so_tien` = frozen, chỉ reflect ĐNTT gốc, KHÔNG biết các adjustment sau
- `chi_phi.thanh_tien` / `thanh_tien_thuc_te` = STATE của chi_phi, có thể bị user edit
  (đổi so_luong/don_gia) trước khi adjust → KHÔNG dùng làm currentTotal
- `chi_phi.so_tien_da_dntt` = COMMITMENT (sum allocs DNTT non-cancelled) — DUY NHẤT đúng

**Bug nếu sai**:
- Multi-adjustment compounding (dùng dnttGoc.so_tien): 1000→1200→1300 ra 1500
- Edit-then-adjust silent fail (dùng chi_phi.thanh_tien): user giảm so_luong rồi adjust → delta=0 → KHÔNG tạo cong_no

### Cấn trừ công nợ (useCreatePayment với method='can_tru')
```
- Lấy cong_no NCC từ view cong_no_with_status (trang_thai='con_du', so_tien_con_lai > 0)
- INSERT payment {dntt_id, method:'can_tru', so_tien, cong_no_id}
- Khi cong_no.so_tien_con_lai = 0 → tự động set trang_thai='da_can_tru'
- Append log cấn trừ vào cong_no.ghi_chu (qua appendCanTruLog)
```

### Cancel ĐNTT đã có payment (useCancelDNTT mode='cong_no'|'hoan_tien')
```
- UPDATE dntt SET trang_thai_duyet='da_huy'
- Nếu mode='cong_no' và paid_amount > 0:
  → INSERT cong_no {so_tien_goc=paid_amount, trang_thai='con_du'}
- Nếu mode='hoan_tien':
  → INSERT cong_no {trang_thai='da_hoan_tien'} (NCC đã refund cash, không cần cấn trừ)
- payments giữ nguyên cho audit
```

### Thanh toán định kỳ (thanh_toan_dinh_ky=true)
```
- Chi phí đánh dấu thanh_toan_dinh_ky=true được gộp thanh toán theo NCC
- useCreateBatchDNTT: tạo 1 ĐNTT với doan_id=null, loai='dinh_ky'
  kèm nhiều allocations cho các chi phí của nhiều đoàn
```

### Xóa ĐNTT
```
Chỉ cho phép xóa khi trang_thai_duyet = 'tu_choi'
Hủy (da_huy) khác với xóa — dùng useCancelDNTT, không mất dữ liệu
```

### Liên kết ĐNTT → Chi phí
```
dntt_allocations: UNIQUE (dntt_id, chi_phi_id)
  → 1 ĐNTT không phân bổ 2 lần cho cùng 1 chi_phi
  → Nhiều ĐNTT khác nhau CÓ THỂ phân bổ cho cùng 1 chi_phi (thanh toán nhiều lần)
  → ON DELETE CASCADE: xóa ĐNTT → xóa allocations
```

---

## 🎨 UI Conventions
- Bảng: `text-xs`, cell padding `py-1.5 px-2`
- Header row màu: `bg-[#E6F1FB]`
- Input số ẩn spin: `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`
- Card collapsible: dùng `ChevronDown/ChevronRight`, click header để toggle
- Toast: `toast.success()` / `toast.error()` từ `"sonner"`

---

## 📌 Query Keys
```typescript
["doan"]                              // danh sách đoàn
["doan_ngay", doanId]
["doan_ngay_item", doanId]
["doan_chi_phi", doanId]
["de_nghi_thanh_toan", doanId]        // ĐNTT per doan (DNTTTab) — query view dntt_with_payment_status
["dntt-list", filters]                // ĐNTT global — query view
["payments", dnttId]                  // payments của 1 ĐNTT
["payments-by-doan", doanId]
["payments-by-chi-phi", doanId]       // payments per chi_phi (cho can_tru display)
["cong-no", filters]                  // cong_no list
["cong-no-by-ncc", nccId]
["dinh_ky_chi_phi", filters]
["doan_booking_ks", doanId]
["doan_booking_nh", doanId]
["doan_booking_dv", doanId]
["chi_phi_ks_data", doanId]           // KS data cho ChiPhiKSSection
["chi_phi_nh_section", doanId]        // NH data cho ChiPhiNHSection
["khach_san"] ["nha_hang"] ["canh_diem"] ["nha_cung_cap"] ["seri_tour"]
["doan-options-dntt"]
```

---

## 🚫 KHÔNG làm
- Không dùng `<form>` — dùng onClick/onBlur
- Không insert `thanh_tien` (generated column)
- Không invalidate `doan_chi_phi` sau blur-save KS/NH (reset UI)
- Không xóa ĐNTT đã `da_duyet` hoặc đã có payment — dùng hủy (useCancelDNTT)
- Không set `trang_thai_thanh_toan` của `doan_chi_phi` thủ công — dùng RPC `recalc_chi_phi_payment_status`
- Không INSERT/UPDATE field `trang_thai_thanh_toan`, `linked_dntt_id`, `so_tien_con_lai`, `thanh_toan_luc` trên `de_nghi_thanh_toan` — đã DROP. Dùng `payments` table
- Đọc `payment_status`, `paid_amount`, `thanh_toan_luc` qua view `dntt_with_payment_status`
- Không tạo file CSS riêng — Tailwind inline
- `doan.xe_id` trỏ vào `nha_xe_loai_xe`, KHÔNG phải bảng `xe`
- Không sửa `so_tien` của ĐNTT đã `da_duyet` hoặc đã paid — tạo adjustment thay thế
- Không tính `delta` điều chỉnh từ `dnttGoc.so_tien` (frozen) HOẶC `chi_phi.thanh_tien` (user edit). Phải dùng `chi_phi.so_tien_da_dntt` (commitment thật, computed bởi RPC). `thanh_tien_thuc_te` set ABSOLUTE qua `proRataInts(soTienThucTe, allocs.so_tien)` — KHÔNG cộng dồn delta
- Không nhân `so_dem` vào dayGross trong FOC khách sạn — mỗi LocalKSRow = 1 đêm. `calcFocDeduction` (display) và `handleBlurSave` (save) phải cùng công thức
- 1 nhà hàng / dịch vụ chỉ xuất hiện tối đa 1 lần / tour (1 chi_phi row) — không có 2 bữa cùng NH
- Thay đổi danh mục (NH, KS, dịch vụ, xe, visa) không được ảnh hưởng đến đoàn hiện có:
  - Giá → luôn snapshot vào tour khi lưu (`don_gia` trong `doan_ngay_item`, `dich_vu_list` JSONB)
  - `nguoi_thanh_toan` → chỉ dùng để ngăn **tạo mới** record; không filter/ẩn record đã tồn tại trong DB
  - Tên/email master → fetch live là chấp nhận được (thông tin liên lạc cần cập nhật)

---

## 🔒 Snapshot bắt buộc cho mọi giá tính chi phí

**Rule cứng**: MỌI giá / hệ số ảnh hưởng tính tiền chi phí phải snapshot 1 lần vào DB
của tour ngay khi tạo. Master danh mục đổi sau KHÔNG được ảnh hưởng đoàn cũ.

| Loại | Snapshot vào | Resolve helper |
|---|---|---|
| Giá cảnh điểm | `doan_ngay_item.don_gia` (INSERT only, KHÔNG overwrite khi cascade) | (đọc trực tiếp từ `doan_ngay_item`) |
| Giá set menu NH | `doan_booking_nh.gia_snapshot` + `ten_set_snapshot` + `mon_an_snapshot` | `useChiPhiNHSection` đọc booking, KHÔNG đọc `nha_hang_set_menu` |
| Giá dịch vụ | `doan_booking_dv.dich_vu_list` JSONB (đã có giá) | (JSONB là source of truth) |
| Giá phòng KS | `doan_ks_dem.gia_phong` (user nhập tay) | — |
| FOC khách sạn | `doan_chi_phi.foc_khach_snapshot` + `foc_mien_snapshot` | `resolveKSFoc(rows, ksMaster)` |
| FOC nhà hàng | `doan_chi_phi.foc_khach_snapshot` + `foc_mien_snapshot` | `resolveNHFoc(row, nhMaster)` |
| Chiết khấu nhà hàng | `doan_chi_phi.chiet_khau_phan_tram_snapshot` | `resolveNHChietKhau(row, nhMaster)` |
| Tip HDV | `doan.tip_rate`, `tip_so_ngay_override`, `tip_so_khach_override`, `tip_lump_sum` | — |

**Rule khi code**:
- Mọi INSERT/UPDATE `doan_chi_phi` cho `danh_muc IN ('khach_san', 'nha_hang')` PHẢI
  truyền `foc_*_snapshot` (+ `chiet_khau_phan_tram_snapshot` cho NH).
- Cascade từ điều tour (`use-dieu-tour.ts`) khi INSERT chi_phi cũng PHẢI snap. UPDATE
  KHÔNG được đụng các trường snapshot (giữ giá trị lock per tour).
- `doan_ngay_item.don_gia`: chỉ snap master `canh_diem.gia_mac_dinh` khi INSERT row mới.
  Khi UPDATE (save lại điều tour với canh_diem đã có) → KHÔNG overwrite `don_gia`.
- Display / compute chi phí KHÔNG được đọc trực tiếp `khach_san.foc_*`, `nha_hang.foc_*`,
  `nha_hang.chiet_khau_phan_tram`, `nha_hang_set_menu.gia` cho chi phí đã tạo. Phải dùng
  helper resolve hoặc đọc từ booking snapshot.
- Khi thêm field giá/hệ số mới vào master danh mục: cân nhắc thêm cột snapshot tương ứng
  vào `doan_chi_phi` (hoặc booking table) + helper resolve.

---

## 🔒 Tính năng tạm tắt

### Per-tour permission (doan_permissions) — tắt từ 2026-04-24
- **Tag trong code:** `FEATURE_DOAN_PERM_DISABLED`
- **Lý do tắt:** Chuyển sang dùng team-based permission (`user_roles.role` + `role_permissions`)
- **Files liên quan:**
  - `src/pages/DoanDetail.tsx` — `canEdit` logic (hiện = `true`)
  - `src/components/DoanTable.tsx` — nút PermissionDialog (key icon) + state permDoan
  - `src/pages/Index.tsx` — 2 khối auto-add permission khi create/edit doan, import `useAddDoanPermission`
- **Để bật lại:** tìm tag `FEATURE_DOAN_PERM_DISABLED` trong 3 files trên, bỏ comment các dòng bị comment và xóa `const canEdit = true`
- **Không bị ảnh hưởng:** hiển thị OP (cột OP, filter OP, field "Phân cho"), MyJobPage, `use-permissions.ts`

---

## 🆕 Module Lead Management (đang phát triển)

### Mục đích
Quản lý khách hàng tiềm năng cho thị trường outbound + nội địa.
Lead = khách chưa chốt thành đoàn. Khi chốt → tạo `doan` và link.

### Phạm vi
- Tiếp nhận lead từ nhiều nguồn (FB, Zalo, hotline, web, referral)
- Theo dõi quá trình tư vấn (activity log)
- Quản lý follow-up & deadline
- Báo cáo hiệu quả sales theo nguồn/người

### Trạng thái Lead (kanban)
moi → da_lien_he → dang_tu_van → da_bao_gia 
    → cho_chot → chot_deal | mat_khach

### Pattern UI bắt buộc
- Có 2 view: Bảng (List) + Kanban (drag-drop đổi trạng thái)
- LeadDrawer (Sheet bên phải) chi tiết lead với tabs: 
  Thông tin / Hoạt động / Báo giá / Việc cần làm
- Quick actions header: 📞 (tel:) | 💬 Zalo (zalo.me/sdt) | 📧 Email
- Timeline activities — mọi tương tác PHẢI log
- Highlight đỏ nếu quá hạn follow-up

### Quy tắc nghiệp vụ
- Mỗi lead có 1 sales phụ trách (auto-assign round-robin khi tạo mới)
- Đổi trạng thái → tự tạo activity loại "doi_trang_thai"
- Mất khách bắt buộc nhập lý do
- Chốt deal → tạo đoàn → set lead.doan_id

### Tích hợp với module hiện có
- `leads.sales_phu_trach` → `user_roles.user_id` (chỉ user `bo_phan = 'dieu_hanh'`)
- `leads.doan_id` → `doan.id` (set khi chốt deal)
- `leads.nguoi_gioi_thieu_id` → self-reference (referral chain)

### Routes
/leads                 → trang quản lý lead (list + kanban)
/leads/:id             → chi tiết lead (hoặc dùng drawer)

### Query Keys
["leads", filters?]
["lead", id]
["lead_activities", leadId]
["lead_tasks", leadId]
["my_lead_tasks", userId]
["lead_nguon"]