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

## 🛠️ Quy tắc viết code — Definition of "XONG"

> Một tính năng chỉ **XONG** khi đủ TẤT CẢ mục dưới. Thiếu 1 mục = **CHƯA xong**.
> KHÔNG báo "đã xong" cho user khi còn thiếu mục nào.

### Định nghĩa "XONG"
- Chạy đúng yêu cầu nghiệp vụ (test thử golden path + edge case).
- `npm run lint` sạch — **0 error** (CI báo đỏ nếu có error; warning thì cho qua).
- `npx tsc -b` sạch — **0 error** (CI báo đỏ nếu fail). KHÔNG dùng `tsc -p tsconfig.json` (check 0 file).
- Có unit test cho phần **tính tiền / logic nghiệp vụ** vừa viết.
- KHÔNG thêm `any`, `@ts-ignore`, `eslint-disable` **mới**.

### Quy tắc khi viết code
- **Test ngay, không để "làm sau"**: mọi logic tính tiền / tính toán phải có test NGAY khi
  viết tính năng.
- **Tách logic tính toán** ra hàm / file `lib/` riêng, độc lập UI → test được mà không cần render.
- **Sau mỗi tính năng**: tự chạy `lint` + `tsc -b`, sửa sạch RỒI mới sang việc kế — không để lỗi dồn.
- **`any` / `@ts-ignore` / `eslint-disable`**: chỉ dùng khi thật sự cần và phải giải thích lý do.
  Mặc định coi như đang **giấu một lỗi thật** → tìm nguyên nhân gốc thay vì bịt.
- **File mới > ~400 dòng**: tách nhỏ (tách hàm tính toán ra hook/lib, tách component con).
  Khi sửa file khổng lồ sẵn có (`ChiPhi*Section`...): cân nhắc tách bớt phần đụng tới.

---

## 🔀 Git & Push — LUÔN qua Pull Request

> **Không bao giờ push thẳng lên `main`.** Mọi thay đổi đẩy lên remote phải đi qua
> Pull Request để CI kiểm tra TRƯỚC khi merge.

- **Quy trình**: tạo nhánh mới → commit → `git push -u origin <branch>` → mở PR → đợi CI xanh → **squash merge** vào `main`.
- **CI gate trên PR**: `npm run lint` (0 error), `npx tsc -b` (0 error), unit test. Push thẳng `main` bỏ qua gate này → dễ làm `main` đỏ.
- **Commit message**: theo convention sẵn có — `feat(scope):`, `fix(scope):`, `refactor(scope):`, `docs:`...
- **Squash merge**: GitHub gộp toàn bộ commit của nhánh thành 1 commit khi merge vào `main`
  (lịch sử `main` = 1 dòng / PR, vd `fix(doan): ... (#NN)`). Các commit lẻ trong nhánh giữ lại ở PR để tra cứu.

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

doan_ks_dem           ⚠️ BẢNG CHẾT — 0 dòng toàn DB (đo 18/08/2026). ĐỪNG đọc.
  id, doan_id, booking_ks_id, ngay_date, loai_phong, so_phong, gia_phong
  ← Phòng/đêm THẬT nằm ở doan_booking_ks.ks_final (chưa có thì ks_dat_truoc):
    TEXT NHIỀU DÒNG, mỗi dòng một đêm, free text ("10 twn", "5 cabin ( 4 người
    1 cabin ) + 1 vé lẻ HDV"). Dãn dòng → đêm bằng expandRoomValues
    (lib/booking-ks-rooms.ts); 1 dòng = dùng chung cho mọi đêm.
    Đêm ở = doan_ngay.ngay_date có khach_san_id trỏ đúng KS đó.
    Đây là nguồn bản Word 訂房確認單 và bản 飯店確認單 trên cổng đối tác.

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
  danh_muc: 'khach_san'|'nha_hang'|'canh_diem'|'bao_hiem'|'hdv_ho_tro'|'xe'|'visa'
    ← DV (dịch vụ) lưu danh_muc='canh_diem' + loai='dich_vu'. KHÔNG có 'dich_vu'/'phi_khac' là danh_muc.
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

### Tài khoản chỉ xem
```
user_roles.chi_xem → RLS restrictive chặn INSERT/UPDATE/DELETE mọi bảng
                     (trừ UPDATE thong_bao) + guard trong RPC SECURITY DEFINER
```

### ⛔ ĐÃ THỬ VÀ BỎ: nhân hệ số chi phí cho tài khoản đối tác
Ý tưởng: cho đại diện agent xem chi phí đoàn đã nhân hệ số, giấu giá vốn thật.
**Đã dừng hẳn 29/07/2026** — đừng dựng lại mà không đọc phần này.

- Nhân ở tầng hiển thị: bất khả thi. 151 file chạm `tien_cong_ty/thanh_tien/
  don_gia/so_tien`, không có tầng chung.
- Nhân ở client (tầng fetch): **lộ ngay** — PostgREST trả số gốc rồi trình duyệt
  mới nhân, mở DevTools tab Network là thấy; response hồ sơ còn kèm cả hệ số.
- Chặn đọc bằng RLS + trang riêng cho agent: **phản tác dụng**. Menu thiếu, màn
  hình "không có quyền truy cập", tên trang "bản agent" — tất cả đều BÁO HIỆU
  cho người dùng biết họ bị giới hạn, đúng thứ cần tránh khi mục tiêu là giấu.
- Kết luận: **một khi đối tác có tài khoản đăng nhập vào hệ thống nội bộ thì
  không giấu được với người biết kỹ thuật.** Muốn kín thì đừng cấp tài khoản —
  xuất file (Excel/PDF) với giá đã nhân sẵn và gửi cho họ.

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
│   ├── DoanDetail.tsx        # trang chính, tabs: Điều Tour, Booking KS, Booking NH, Visa & Xe, Booking DV, Chi phí, Tài liệu, Log
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
> Nguồn: `src/App.tsx`. Public = không cần đăng nhập; còn lại bọc trong `ProtectedLayout`.
```
# Public
/login                  → LoginPage
/lead-form              → LeadFormPublicPage (form nhận lead công khai)

# Protected
/                       → redirect → /my-job
/my-job                 → MyJobPage (landing)
/thong-bao              → ThongBaoPage (tất cả thông báo — đích nút "Xem tất cả" ở chuông)
/dashboard              → DashboardPage
/doan                   → Index (danh sách đoàn)
/doan/:id               → DoanDetail (tabs: Điều Tour, Booking KS, Booking NH,
                          Visa & Xe, Booking DV, Chi phí, Tài liệu, Log)
/de-nghi-thanh-toan     → DNTTPage (kế toán duyệt)
/hoan-ung               → HoanUngPage
/thanh-toan-dinh-ky     → ThanhToanDinhKyPage
/cong-no                → CongNoPage
/hoa-don-unc            → HoaDonUNCPage
/theo-doi               → TheodoiPage
/xep-hdv                → XepHDVPage
/lock-phong             → LockPhongPage
/invoice                → InvoicePage
/bao-gia                → BaoGiaPage
/bao-gia/:id            → BaoGiaDetailPage
/settings/teams         → TeamAssignmentPage
/leads                  → LeadsPage (list + kanban)
/viec-lead              → ViecLeadPage
/leads/bao-cao          → LeadReportPage
/quan-ly/nha-hang  /quan-ly/khach-san  /quan-ly/canh-diem  /quan-ly/xe (NhaXePage)
/quan-ly/visa  /quan-ly/nha-cung-cap  /quan-ly/hdv  /quan-ly/seri  /quan-ly/nguoi-dung
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

### FOC khách sạn (Option A — foc_count nhập tay, KHÔNG auto-pool)
```
Mỗi row KS (phòng + dịch vụ) có cột foc_count — OP TỰ NHẬP số phòng miễn.
  rowFocDeduction = foc_count * gia_phong
  tien_cong_ty    = (so_luong - foc_count) * gia_phong
foc_count là numeric (hỗ trợ 0.5 khi foc_mien thập phân).
```
**Lý do bỏ auto-pool**: pool cũ phân bổ FOC theo bình quân giá toàn ngày → khi
mix loại phòng (vd 30 twn 2.65M + 1 sgl 5.45M) FOC dính một phần vào SGL giá
cao → vượt giá trị thực (chỉ free 1 twn). Option A: OP gán foc_count vào đúng
row phòng giá thấp nhất.

**UI gợi ý (info-only, KHÔNG auto-fill)**: header ngày hiện badge
`16免1: gợi ý X / đã gán Y` — `X = floor(dayRooms / foc_khach) * foc_mien`
(`calcFocSuggestion`). Xanh khi đã gán khớp gợi ý, cam khi lệch. `foc_khach`/
`foc_mien` snapshot vẫn lưu để tính gợi ý, KHÔNG còn dùng tính tiền.

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
   - NH/DV: OP sửa SL/đơn giá **inline trực tiếp mọi lúc** (kể cả sau thanh toán).
     KHÔNG còn lock + modal "Điều chỉnh" (gỡ 2026-05-22). `handleSave`/`handleRowSave`
     set `is_overridden=true` + `thanh_tien_thuc_te=null` — giá trị mới CHÍNH là thực tế.
   - OP có thể thêm/sửa/xóa **extras** (rows phát sinh) qua nút ➕ — sửa inline, tự lưu.
     Mỗi extra NH có **CK% riêng** (ô nhập per dòng): suất trẻ em = menu chính → nhập
     CK; HDV phát sinh → để 0. `applyChietKhau` per dòng (làm tròn 1 lần/dòng = Mức A).
   - Sau khi sửa, hệ thống auto-compute **aggregate delta toàn nhóm**:
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
- Input **editable inline mọi lúc** (kể cả sau thanh toán) — KHÔNG lock theo
  `trang_thai_thanh_toan`. Sửa xong, footer aggregate hiện delta để execute.
- `is_overridden=true` → 🔒 indicator + ↺ reset button
- User edit → `handleSave`/`handleRowSave` set `is_overridden: true` +
  `thanh_tien_thuc_te: null` trong payload
- Extras: editable inline luôn; nút xóa khóa khi nhóm còn ĐNTT hiệu lực

**ChiPhiKSSection**: KHÔNG đổi — KS độc lập, không có flag is_overridden cần thiết.

---

## 🔄 Luồng ĐNTT (Đề nghị Thanh Toán) — refactor 2026-05

### Concepts (3 entity tách biệt)
- **`de_nghi_thanh_toan`** — chỉ là REQUEST. Lifecycle: `cho_duyet → da_duyet → tu_choi/da_huy`.
- **`payments`** — record mỗi event thanh toán (cash hoặc can_tru). Tạo qua `useCreatePayment`.
- **`cong_no`** — debt record từ overpayment hoặc cancel-after-paid. Lifecycle: `con_du → da_can_tru` hoặc `da_hoan_tien`.

### Trạng thái dntt — chỉ approval
```
trang_thai_duyet: cho_duyet → da_duyet → tu_choi (terminal — thử lại = tạo ĐNTT mới)
                  bất kỳ   → da_huy
```
> ĐNTT `tu_choi` KHÔNG hồi sinh được (không có "gửi lại"). Nó là record audit, KHÔNG
> còn tính vào `so_tien_da_dntt` (RPC loại cả `da_huy` lẫn `tu_choi`). Muốn thử lại →
> tạo ĐNTT mới qua flow "Tạo ĐNTT" bình thường.

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
- Sửa SL/đơn giá **inline** (main row + extras) → `handleSave`/`handleRowSave`
  update chi_phi state (so_luong, don_gia, tien_*, is_overridden=true,
  thanh_tien_thuc_te=null). KHÔNG tạo cong_no/DNTT ngay.
- Footer per group commit button (tính `delta = sumActual_company - sumPaid_company`):
  - `delta > 0` → INSERT dntt loai='dich_vu'/'nha_hang', mo_ta='[Bổ sung] ...', cho_duyet
  - `delta < 0` → INSERT cong_no với so_tien_goc=abs(delta), trang_thai='con_du'
- Xem section "🔄 HYBRID Pattern: Điều tour ↔ Chi phí" → workflow #3 cho UX detail.

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
  → ON DELETE CASCADE (dntt_id): xóa ĐNTT → xóa allocations
  → ON DELETE CASCADE (chi_phi_id): xóa chi_phi → xóa allocations  ⚠️ NGUY HIỂM
```

### ⛔ KHÔNG xóa chi phí đã nằm trong ĐNTT — phải "Điều chỉnh" về 0
**Bối cảnh**: `dntt_allocations.chi_phi_id` FK = `ON DELETE CASCADE`. Xóa 1 chi phí
sẽ xóa luôn allocation của nó — **kể cả allocation từ ĐNTT cọc đã thanh toán**.
RPC `recalc_chi_phi_payment_status` tính `so_tien_da_tt` theo từng allocation độc
lập (KHÔNG phân bổ lại) → mất allocation = **mất dấu phần đã cọc/đã trả** → ĐNTT
khoản còn lại tính `delta = sumActual − sumPaid` bị sai → trả dư/thiếu tiền.

**Guard** (`useDeleteChiPhi`, use-chi-phi.ts): trước khi delete, query
`dntt_allocations` của chi_phi.id → nếu có allocation từ ĐNTT `trang_thai_duyet
!= 'da_huy'` → throw error tiếng Việt (kèm ĐNTT id). ĐNTT `da_huy` KHÔNG chặn
(flow auto-xóa chi phí orphan sau khi hủy ĐNTT vẫn chạy).

**Nghiệp vụ**: muốn bỏ 1 chi phí đã cọc → **sửa SL/đơn giá về 0** (NH/DV: inline;
KS: modal "Điều chỉnh") — giữ row + allocation → aggregate footer tính delta → tạo
công nợ (nếu tổng nhóm < đã trả) hoặc ĐNTT bổ sung. KHÔNG xóa row.

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
- Không xóa `doan_chi_phi` đang có allocation từ ĐNTT chưa hủy — `useDeleteChiPhi` đã chặn (throw error). Xóa → CASCADE mất allocation → mất dấu phần đã cọc/đã trả. Muốn bỏ → "Điều chỉnh" SL/đơn giá về 0
- Không set `trang_thai_thanh_toan` của `doan_chi_phi` thủ công — dùng RPC `recalc_chi_phi_payment_status`
- Không INSERT/UPDATE field `trang_thai_thanh_toan`, `linked_dntt_id`, `so_tien_con_lai`, `thanh_toan_luc` trên `de_nghi_thanh_toan` — đã DROP. Dùng `payments` table
- Đọc `payment_status`, `paid_amount`, `thanh_toan_luc` qua view `dntt_with_payment_status`
- Không tạo file CSS riêng — Tailwind inline
- `doan.xe_id` trỏ vào `nha_xe_loai_xe`, KHÔNG phải bảng `xe`
- Không sửa `so_tien` của ĐNTT đã `da_duyet` hoặc đã paid — tạo adjustment thay thế
- Không tính `delta` điều chỉnh từ `dnttGoc.so_tien` (frozen) HOẶC `chi_phi.thanh_tien` (user edit). Phải dùng `chi_phi.so_tien_da_dntt` (commitment thật, computed bởi RPC). `thanh_tien_thuc_te` set ABSOLUTE qua `proRataInts(soTienThucTe, allocs.so_tien)` — KHÔNG cộng dồn delta
- FOC khách sạn dùng `foc_count` nhập tay per-row (Option A) — KHÔNG auto-pool theo ngày. `tien_cong_ty = (so_luong - foc_count) * gia_phong`. Gợi ý 16免1 chỉ info-only
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
| Chiết khấu NH (per dòng: main + extras) | `doan_chi_phi.chiet_khau_phan_tram_snapshot` | main: `resolveNHChietKhau(row, nhMaster)`; extra: đọc trực tiếp cột |
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

## 📋 Migration rules — Supabase Data API grants

Từ **30/10/2026**, Supabase enforce: bảng mới trong schema `public` KHÔNG còn auto-expose
qua Data API (supabase-js / PostgREST / GraphQL). Phải GRANT thủ công, nếu không sẽ
bị error `42501` khi truy vấn.

**`ALTER TABLE` (cột mới, index, RPC, trigger): KHÔNG cần grant** — bảng giữ nguyên grants cũ.
**`CREATE TABLE` mới: BẮT BUỘC kèm GRANT + RLS**.

Template chuẩn cho migration tạo bảng mới:
```sql
CREATE TABLE public.ten_bang (
  id bigserial PRIMARY KEY,
  ...
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ten_bang TO authenticated, service_role;
GRANT SELECT ON public.ten_bang TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.ten_bang_id_seq TO authenticated, service_role;

ALTER TABLE public.ten_bang ENABLE ROW LEVEL SECURITY;

-- Policy mặc định (điều chỉnh theo nghiệp vụ):
CREATE POLICY "auth_all" ON public.ten_bang
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BẮT BUỘC: khóa ghi cho tài khoản chỉ xem (user_roles.chi_xem).
-- Migration 20260728_tai_khoan_chi_xem quét MỘT LẦN toàn bộ bảng đang có →
-- bảng tạo SAU đó KHÔNG tự có policy này = lỗ hổng, tài khoản chỉ xem ghi được.
CREATE POLICY chi_xem_block_insert ON public.ten_bang AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_update ON public.ten_bang AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_delete ON public.ten_bang AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
```

Áp dụng tương tự cho VIEW (GRANT SELECT) và FUNCTION/RPC (GRANT EXECUTE).

**⚠️ Hai bẫy đã vấp 21/08/2026 khi thêm `yeu_cau_bao_gia` + view của nó:**
1. **VIEW mặc định là SECURITY DEFINER** → chạy bằng quyền owner và ĐI VÒNG QUA RLS
   của mọi bảng bên dưới. Luôn khai `WITH (security_invoker = on)`:
   ```sql
   CREATE VIEW public.ten_view WITH (security_invoker = on) AS SELECT ...;
   ```
   (`dntt_with_payment_status`, `cong_no_with_status` đã đúng; view mới quên là thủng.)
2. **`GRANT SELECT ... TO anon` chỉ dành cho bảng thật sự công khai.** Bảng dữ liệu nội
   bộ phải `REVOKE ALL ... FROM anon` — khoá publishable nằm sẵn trong bundle web, RLS
   là hàng rào duy nhất còn lại và một view definer là đủ để đi vòng.
3. View dùng `bang.*`: thêm cột vào bảng thì `CREATE OR REPLACE VIEW` báo lỗi
   "cannot change name of view column" → phải `DROP VIEW` rồi `CREATE` lại.
4. `GREATEST`/`LEAST` **bỏ qua NULL**: `GREATEST(NULL, 1)` ra `1`. Muốn "không nhập thì
   để trống" phải bọc `CASE WHEN ... IS NULL THEN NULL ELSE ... END`.

**RPC mới `SECURITY DEFINER` có ghi**: chạy bằng quyền owner → BYPASS toàn bộ RLS
trên, kể cả policy `chi_xem_*`. Phải tự chèn guard đầu thân hàm:
```sql
IF public.is_tk_chi_xem() THEN
  RAISE EXCEPTION 'Tài khoản chỉ xem — không thực hiện được thao tác này'
    USING ERRCODE = '42501';
END IF;
```

---

## 🔑 Phân quyền — ba nguồn, cộng dồn

Luật tính ở `src/lib/quyen.ts` (thuần, có unit test); hook `usePermission` chỉ nạp dữ liệu.

| Vai trò | Đọc từ |
|---|---|
| `admin` | được tất cả, không đọc bảng nào |
| `specialist` | **CHỈ** `user_permissions` — vai trò này vốn không dùng ma trận |
| còn lại | `role_permissions` (nền) **CỘNG THÊM** `user_quyen_them` (riêng từng người) |

- `user_quyen_them` **chỉ mở thêm, không cấm được gì**. Muốn cấm ai → sửa ma trận
  ở tab Phân quyền hoặc đổi vai trò. Đừng viết logic suy diễn từ dòng `false`.
- ⛔ **KHÔNG cho code đọc `user_permissions` với vai trò thường.** Bảng đó từng có
  342 dòng chết của 19 người vai trò thường, tất cả bật đủ 4 quyền trên 18 mục —
  bật lên là thăng cấp 20 tài khoản gần bằng admin trong một lần deploy.
  **Đã dọn 21/08/2026** (migration `20260821e`, còn đúng 25 dòng của 3 specialist;
  bản sao ở `user_permissions_backup_20260821`, xoá sau ~1 tháng). Luật vẫn giữ:
  bảng đó chỉ dành cho `specialist`, cấp thêm cho người thường thì dùng
  `user_quyen_them`.
- Quyền chỉ là tầng GIAO DIỆN: `bao_gia` (và nhiều bảng khác) chỉ có policy
  "đã đăng nhập" ở DB. Ẩn menu ≠ giấu được dữ liệu — xem lại mục "⛔ ĐÃ THỬ VÀ BỎ".

## 🔒 Tính năng tạm tắt

### Per-tour permission (doan_permissions) — tắt từ 2026-04-24
- **Tag trong code:** `FEATURE_DOAN_PERM_DISABLED`
- **Lý do tắt:** Chuyển sang dùng team-based permission (`user_roles.role` + `role_permissions`)
- **Files liên quan:**
  - `src/pages/DoanDetail.tsx` — `canEdit` logic (hiện = `true`)
  - `src/pages/Index.tsx` — 2 khối auto-add permission khi create/edit doan, import `useAddDoanPermission`
  - (DoanTable.tsx đã gỡ sạch ref permission — không còn nút PermissionDialog/state permDoan.
    `PermissionDialog.tsx` + `PermissionPopover.tsx` hiện orphan, chưa xoá.)
- **Để bật lại:** tìm tag `FEATURE_DOAN_PERM_DISABLED` trong 2 files trên, bỏ comment các dòng bị comment và xóa `const canEdit = true`
- **Không bị ảnh hưởng:** hiển thị OP (cột OP, filter OP, field "Phân cho"), MyJobPage, `use-permissions.ts`

---

## 🆕 Module Lead Management (đã ship — production)

### Mục đích
Quản lý khách hàng tiềm năng cho thị trường outbound + nội địa.
Lead = khách chưa chốt thành đoàn. Khi chốt → tạo `doan` và link.

> ⚠️ Tên bảng DB là **số ít**: `lead`, `lead_activity`, `lead_task`, `lead_next_action`,
> `lead_cadence`, `lead_campaign`, `lead_diem_den`, `lead_template`. (Query key React Query
> thì dùng số nhiều `["leads"]` — đừng nhầm với tên bảng.)

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

### Tích hợp với module hiện có (cột thực tế bảng `lead`)
- `lead.assigned_to` → `user_roles.user_id` (sales phụ trách; user `bo_phan = 'dieu_hanh'`)
- `lead.doan_id` → `doan.id` (set khi chốt deal)
- `lead.referral_lead_id` → self-reference `lead.id` (referral chain)
- `lead.campaign_id` → `lead_campaign.id`

### Routes (xem App.tsx — KHÔNG có `/leads/:id`, chi tiết mở qua LeadDrawer)
/leads                 → LeadsPage (list + kanban)
/viec-lead             → ViecLeadPage (việc cần làm / next action)
/leads/bao-cao         → LeadReportPage
/lead-form             → LeadFormPublicPage (public, qua RPC create_lead_from_form)

### Query Keys (thực tế trong use-leads.ts)
["leads", filter?]
["lead", id]
["lead_activities", leadId]
["lead_next_action", leadId]
["my_next_actions"]["lead_tai_lieu", leadId]           // file đối tác gửi kèm khi yêu cầu báo giá
["yeu_cau_bao_gia"]                 // tab Yêu cầu báo giá (đọc view)
["yeu_cau_tep", yeuCauId | "tat_ca"]

### 詢價 — yêu cầu báo giá từ cổng đối tác (外網)
> Đối tác gửi yêu cầu trên cổng (repo riêng `../s8-agent-portal`, project Supabase
> khác) → lead bên CRM. Ship 21/08/2026.

```
cổng /yeu-cau → edge fn gui-yeu-cau (bên cổng, verify_jwt)
              → edge fn yeu-cau-doi-tac (bên CRM, x-portal-secret = PORTAL_TRAO_DOI_SECRET)
              → RPC create_lead_from_agent_portal (RETURNS jsonb {lead_id, yeu_cau_id, so_tep})
              → yeu_cau_bao_gia (bản gốc) + lead (phễu sales) + lead_tai_lieu + thong_bao
```

**Chỗ XỬ LÝ yêu cầu là tab "Yêu cầu báo giá" trong trang Báo giá** (`/bao-gia?tab=yeu-cau`),
KHÔNG phải trang Leads — lead chỉ để sales theo phễu.
- Bảng `yeu_cau_bao_gia`: đối tác + `tai_khoan_email`/`tai_khoan_ten` (TÀI KHOẢN cổng đã bấm
  gửi, lấy từ JWT bên cổng — khác `nguoi_lien_he` họ tự gõ) + nội dung + `lead_id`.
- Đọc qua VIEW `yeu_cau_bao_gia_view`. Trạng thái hiển thị **là cột `trang_thai_hien_thi`**,
  KHÔNG phải `trang_thai`: `bo_qua` > tồn tại `bao_gia.yeu_cau_id` > `moi`. Xoá báo giá →
  yêu cầu tự về "chưa xử lý" thay vì treo ở "đã báo giá".
- Nút "Báo giá" mở `BaoGiaCreateModal` với prefill (đối tác, tên chương trình, ngày, số ngày,
  lead, file). `yeu_cau_id` gán **ngay lúc INSERT bao_gia** — không để bước sau, kẻo hỏng giữa
  chừng là báo giá mồ côi.
- File đối tác được **CHÉP** từ `lead-files` sang kho lịch trình của báo giá (`taiTepDoiTac` →
  `useUploadLichTrinhFile`), không trỏ chéo bucket: gỡ file khỏi báo giá không được xoá bản gốc.
- `useCloneBaoGia` CỐ Ý không chép `yeu_cau_id`.
- `lead.nguon = 'agent_portal'`, `lead.agent_id` → `agents.id`, `ten_to_chuc` = tên đối tác.
- **Người nhận**: `user_roles.nhan_yeu_cau_doi_tac` (bật ở trang Người dùng). Chia lượt
  trong nhóm bật cờ; chuông bắn cho CẢ nhóm. Không ai bật → rơi về `bo_phan='sales'`.
- **File đính kèm**: tối đa 3, ≤10MB. Đối tác upload lên bucket `yeu-cau` bên cổng,
  CRM tải qua link ký rồi chép vào bucket **private `lead-files`**; đường dẫn lưu ở
  `lead_tai_lieu.duong_dan` (KHÔNG lưu URL — link ký hết hạn). Mở bằng `moFileLead`.
- RPC `create_lead_from_agent_portal` chỉ còn `service_role` (trước đây mở cho `anon`
  = ai có publishable key CRM cũng tạo được lead). Rate-limit 10 yêu cầu/đối tác/giờ.
- **Bên cổng, yêu cầu và báo giá nằm CHUNG một danh sách** (gộp 24/08/2026): mỗi dòng
  là một luồng `chờ báo giá → đã có báo giá → hết hạn`. Nối bằng `bao_gia.yeu_cau_id`
  (bên cổng) ↔ `yeu_cau.crm_yeu_cau_id`; `push-portal` dịch id qua
  `_shared/noi-bao-gia-yeu-cau.ts`. Báo giá đã tạo mà chưa bấm "Gửi khách"
  (`portal_enabled=false`) thì đối tác VẪN thấy "chờ báo giá" — tab Yêu cầu bên CRM
  hiện nhãn "Chưa gửi cổng" cho đúng trường hợp này.
- **Đối tác thấy ĐỦ các bản đã chào** (24/08/2026): bảng `bao_gia_phien_ban` bên cổng
  (mỗi bản một dòng, chỉ ghi thêm, kèm `thay_doi`), `bao_gia.ma_hien_thi/so_phien_ban`
  = bản đang hiệu lực nên hai bên gọi cùng tên `BG00025-v3`. Câu "khác bản trước" tính
  ở `_shared/bao-gia-chao-diff.ts` khi đẩy — **CHỈ so lớp chào**, `noi_dung_von` không
  bao giờ rời CRM (câu select trong `push-portal/dong-bo-phien-ban.ts` cố ý kê tên cột,
  đừng đổi thành `*`). Chuông bên cổng đọc `gui_luc` của bản chào, KHÔNG đọc
  `bao_gia.pushed_at` (cột đó bị ghi lại mọi lượt đồng bộ → ngày nào chuông cũng đỏ).
- **Đối tác yêu cầu sửa chương trình từ cổng** (24/08/2026): nút trên bảng giá → edge
  fn `gui-yeu-cau-sua` (cổng) → `yeu-cau-sua-bao-gia` (CRM, `x-portal-secret`) →
  `bao_gia_log` loai='yeu_cau_sua' + `thong_bao` loai='bao_gia_yeu_cau_sua'
  (cột mới `thong_bao.bao_gia_id`, chuông trỏ `/bao-gia/:id`). KHÔNG có bảng mới bên
  CRM và KHÔNG có nút "đánh dấu đã xử lý": yêu cầu tự coi là đã trả lời khi có một
  `gui_ban` mới hơn (`yeuCauSuaChuaTraLoi` trong lib/bao-gia-phien-ban.ts, có test).
- Cổng **KHÔNG** hiện trạng thái xử lý nội bộ (đang tư vấn / chờ chốt / bỏ qua) —
  chốt nghiệp vụ, đừng tự thêm. Ba trạng thái luồng ở trên chỉ nói thứ đối tác tự
  nhìn thấy: có bảng giá hay chưa, còn hạn hay hết. Hệ quả: bấm "bỏ qua" bên CRM thì
  bên cổng yêu cầu đó vẫn nằm ở "chờ báo giá" — đóng bằng cách trả lời đối tác.
- Chuông `lead_yeu_cau_doi_tac` trỏ `/bao-gia?tab=yeu-cau` (nhánh này phải đứng TRƯỚC nhánh
  chung `loai.startsWith("lead_")` trong `targetUrl`, và có bản sao trong edge fn `send-push`).
