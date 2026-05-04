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

de_nghi_thanh_toan    (ĐNTT — kiêm cả vai trò payment request + payment)
  id, doan_id (nullable khi loai='dinh_ky'), loai, mo_ta
  nha_cung_cap_id, ten_nha_cung_cap, so_tai_khoan, ngan_hang
  so_tien, la_coc (bool), la_thu_hoi (bool)
  hdv_id (nullable — khi thanh toán cho HDV)
  ty_le_coc, so_tien_con_lai
  trang_thai_duyet: 'cho_duyet'|'da_duyet'|'tu_choi'|'da_huy'
  trang_thai_thanh_toan: 'chua_tt'|'da_tt'|'cong_no'|'da_can_tru'|'can_tru'|'hoan_tien'
  tao_boi, tao_luc, duyet_boi, duyet_luc, thanh_toan_luc
  ngay_can_thanh_toan, hoa_don_url, unc_url
  ref_loai, ref_id   ← liên kết nguồn (khach_san, doan_chi_phi, can_tru_cong_no, dinh_ky)
  ghi_chu            ← log cấn trừ, điều chỉnh được append vào đây

dntt_allocations      (ĐNTT → nhiều chi_phi, RLS enabled)
  id, dntt_id, chi_phi_id, so_tien, ghi_chu
  UNIQUE (dntt_id, chi_phi_id)  ← 1 ĐNTT không phân bổ 2 lần cho cùng 1 chi phí
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
│   ├── use-dntt.ts           # DNTTRow, useDNTTList (global), useApproveDNTT,
│   │                         # useRejectDNTT, useMarkPaidDNTT, useCancelDNTT,
│   │                         # useCreateCanTru, useCreateAdjustment, recalcChiPhiStatus
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

### FOC
```
so_mien    = floor(so_khach / foc_khach) * foc_mien
thanh_tien = (so_khach - so_mien) * don_gia
```

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

## 🔄 Luồng ĐNTT (Đề nghị Thanh Toán)

### Trạng thái ĐNTT
```
trang_thai_duyet:      cho_duyet → da_duyet → (thanh toán)
                                 → tu_choi  → (gửi lại → cho_duyet)
                       bất kỳ   → da_huy

trang_thai_thanh_toan: chua_tt  → da_tt
                       can_tru            ← cấn trừ công nợ (sau khi da_duyet)
                       cong_no            ← hủy sau da_tt, ghi nợ NCC
                       da_can_tru         ← công nợ đã cấn trừ hết
                       hoan_tien          ← hủy sau da_tt, hoàn tiền (không ghi nợ)
```

### Flow chuẩn
```
1. Tạo ĐNTT     → trang_thai_duyet='cho_duyet', trang_thai_thanh_toan='chua_tt'
2. Duyệt        → trang_thai_duyet='da_duyet'
3. Thanh toán   → trang_thai_thanh_toan='da_tt', thanh_toan_luc=now()
4. Sau mỗi bước → gọi recalcChiPhiStatus(chiPhiIds) để cập nhật doan_chi_phi
```

### Trạng thái doan_chi_phi (computed)
```
trang_thai_thanh_toan: 'unpaid' | 'partial_paid' | 'paid'
  ← Tính tự động qua RPC recalc_chi_phi_payment_status(p_chi_phi_ids)
  ← Dựa trên tổng so_tien trong dntt_allocations của các ĐNTT da_duyet/da_tt
  ← KHÔNG set thủ công
```

### Điều chỉnh sau khi da_tt (useCreateAdjustment)
```
delta > 0 (thiếu tiền) → tạo ĐNTT bổ sung [Bổ sung], cho_duyet + chua_tt
delta < 0 (thừa tiền)  → tạo công nợ [Điều chỉnh giảm], da_huy + cong_no
Đồng thời: cập nhật thanh_tien_thuc_te trên doan_chi_phi (pro-rata)
           append log vào ghi_chu của ĐNTT gốc
```

### Cấn trừ công nợ (useCreateCanTru)
```
- Lấy danh sách công nợ NCC (trang_thai_thanh_toan='cong_no', trang_thai_duyet='da_huy')
- Tạo ĐNTT mới: trang_thai_duyet='da_duyet', trang_thai_thanh_toan='can_tru'
- Cập nhật công nợ gốc: so_tien_con_lai giảm, hoặc → da_can_tru nếu hết
- Append log cấn trừ vào ghi_chu của công nợ gốc
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
["de_nghi_thanh_toan", doanId]        // ĐNTT per doan (DNTTTab)
["dntt-list", filters]                // ĐNTT global (DNTTPage, CongNoPage)
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
- Không xóa ĐNTT đã `da_duyet` hoặc `da_tt` — dùng hủy (useCancelDNTT)
- Không set `trang_thai_thanh_toan` của `doan_chi_phi` thủ công — dùng RPC `recalc_chi_phi_payment_status`
- Không tạo file CSS riêng — Tailwind inline
- `doan.xe_id` trỏ vào `nha_xe_loai_xe`, KHÔNG phải bảng `xe`
- Không sửa `so_tien` của ĐNTT đã `da_duyet` hoặc `da_tt` — tạo adjustment thay thế
- Thay đổi danh mục (NH, KS, dịch vụ, xe, visa) không được ảnh hưởng đến đoàn hiện có:
  - Giá → luôn snapshot vào tour khi lưu (`don_gia` trong `doan_ngay_item`, `dich_vu_list` JSONB)
  - `nguoi_thanh_toan` → chỉ dùng để ngăn **tạo mới** record; không filter/ẩn record đã tồn tại trong DB
  - Tên/email master → fetch live là chấp nhận được (thông tin liên lạc cần cập nhật)

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