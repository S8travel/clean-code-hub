# SPEC — Phiếu khảo sát khách hàng (QR code)
> Soạn ngày: hôm nay. Loại việc: tính năng mới, rủi ro thấp
> Mục tiêu: số hóa mẫu phiếu 意見調查表 (Trad. Chinese) hiện đang phát bản giấy

## 1. Bối cảnh & mục tiêu

Bên bạn đang phát phiếu khảo sát bản giấy tại kết thúc tour. Vấn đề:
- Khách lười điền → tỷ lệ phản hồi thấp
- Dữ liệu rời rạc — không tổng hợp được để đánh giá HDV / NCC
- Không nhận diện được đánh giá tiêu cực kịp thời

**Giải pháp:** QR code in trên phiếu / dán trên xe / HDV show → khách quét → mở form web → điền → về server. Data tự tổng hợp vào dashboard.

## 2. Quyết định cần bạn chốt (3 câu)

### Q1. Ngôn ngữ hỗ trợ?

- **Phương án A (khuyên):** Trad. Chinese (mặc định, cho Đài Loan/Hong Kong) + Simp. Chinese (Trung Quốc) + English (dự phòng) + Việt (nội địa) — **4 ngôn ngữ**
- Phương án B: chỉ Trad. Chinese giống bản giấy hiện tại
- Phương án C: A nhưng gộp Trad + Simp

### Q2. Chiến lược QR

- **Phương án A (khuyên):** **QR duy nhất mỗi đoàn** → link kiểu `s8travel.vn/khao-sat/S8DAD260721-HP` → form tự fill sẵn mã đoàn + tên HDV. OP in QR khi tour bắt đầu, dán vào welcome pack / xe.
- Phương án B: **QR chung** → khách phải nhập mã đoàn tay. Đơn giản hơn nhưng khách hay ghi sai → data rác.

### Q3. Có phần thưởng khuyến khích điền không?

- Phương án A: không, để "tự nguyện"
- **Phương án B (khuyên):** khi khách submit → hiện **mã giảm giá 5% cho tour lần sau** hoặc **voucher quà nhỏ** — tăng response rate 3-5x
- Phương án C: rút thăm cuối tháng

---

## 3. Thiết kế dữ liệu

### Bảng mới: `khach_hang_khao_sat`

```
id                bigserial PK
doan_id           bigint FK → doan
ma_doan_snapshot  text       (snapshot phòng đoàn đổi tên sau)

-- Thông tin khách
ten_khach         text
gioi_tinh         text ('nam'|'nu'|null)
tuoi_range        text ('18-35'|'35-50'|'50+'|null)
nghe_nghiep       text
so_dien_thoai     text
email             text
ngon_ngu          text ('zh-TW'|'zh-CN'|'en'|'vi')

-- Đánh giá (1-5, 1=rất không hài lòng, 5=rất hài lòng)
dg_lich_trinh                smallint
dg_ctdl_thai_do              smallint
dg_truong_doan_xu_ly         smallint
dg_truong_doan_thai_do       smallint
dg_hdv_kien_thuc             smallint
dg_hdv_thai_do               smallint
dg_tai_xe_xe                 smallint
dg_tai_xe_thai_do            smallint
dg_ks_thai_do                smallint
dg_ks_phong                  smallint
dg_nh_sap_xep                smallint
dg_nh_menu                   smallint

y_kien_khac       text
created_at        timestamptz DEFAULT now()

-- Snapshot HDV + trưởng đoàn tại thời điểm điền (đề phòng đổi HDV sau)
hdv_ten_snapshot         text
truong_doan_ten_snapshot text
```

**Tính trung bình:** thêm view `khao_sat_summary` — tính trung bình từng tiêu chí per đoàn / per HDV / per KS.

### RPC bảo mật `create_khao_sat_from_form`

Không cho INSERT trực tiếp (tránh lặp lại lỗi 5 bảng lỗ hổng). Dùng RPC:

```sql
create function create_khao_sat_from_form(payload jsonb)
returns bigint
security definer  -- chạy với quyền admin
as $$
declare
  v_doan_id bigint;
  v_id bigint;
begin
  -- Validate: mã đoàn phải tồn tại + đang chạy hoặc mới kết thúc
  select id into v_doan_id
  from doan
  where ten_doan = payload->>'ma_doan'
    and trang_thai in ('dang_chay')
    and ngay_ve >= current_date - interval '30 days';
  
  if v_doan_id is null then
    raise exception 'Mã đoàn không hợp lệ hoặc đã quá 30 ngày';
  end if;
  
  -- Validate: đánh giá 1-5
  -- ... (check ranges)
  
  -- Rate limit: max 1 submit / SĐT / đoàn / phút
  if exists (
    select 1 from khach_hang_khao_sat
    where doan_id = v_doan_id
      and so_dien_thoai = payload->>'so_dien_thoai'
      and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Vui lòng đợi 1 phút trước khi gửi lại';
  end if;
  
  -- Insert
  insert into khach_hang_khao_sat (...) values (...)
  returning id into v_id;
  
  return v_id;
end;
$$;

grant execute on function create_khao_sat_from_form to anon, authenticated;
```

Bảng chính KHÔNG có policy INSERT cho anon → chỉ RPC gọi được.

## 4. UX flow công khai (mobile-first)

### Trang `/khao-sat/:maDoan`

```
┌──────────────────────────┐
│ [S8 Logo]  🇹🇼🇨🇳🇬🇧🇻🇳  │  ← language switch
├──────────────────────────┤
│ 感謝您參加 S8 Travel     │
│ 團號: S8DAD260721-HP     │
│ 領隊: 阿翁 / 導遊: 阿花  │  ← pre-filled từ đoàn
│ ─────────────────        │
│                          │
│ 旅客姓名 [_____]         │
│ 性別  ☐男 ☐女          │
│ 年齡  ☐18-35 ...        │
│ 聯絡電話 [_____]         │
│ Email [_____]           │
│                          │
│ ─── 評分 ────           │
│ 行程安排                 │
│  ⭐⭐⭐⭐⭐              │
│ 服務態度                 │
│  ⭐⭐⭐⭐⭐              │
│ ...                      │
│                          │
│ 其他意見                 │
│ [__________________]     │
│                          │
│      [提交]              │
└──────────────────────────┘
```

**Đặc điểm:**
- Mobile-first, no login, no captcha rườm rà
- Star rating tap-to-select (không phải radio button dài dòng)
- Auto-detect ngôn ngữ trình duyệt lần đầu → mặc định
- Lưu progress vào localStorage → chuyển tab không mất data
- Sau khi submit → thank-you screen + hiện mã giảm giá (nếu chọn Q3-B)

## 5. Tích hợp CRM hiện tại

### Tab mới trong đoàn detail

Thêm tab "**Khảo sát khách**" trong `DoanDetail`:
- List tất cả response cho đoàn này
- Chỉ số trung bình từng tiêu chí
- Comment "其他意見" hiện đầy đủ
- Nút "In QR" → generate PNG QR code cho đoàn này (dùng lib `qrcode.react`)

### Dashboard aggregate

Trong `DashboardPage`, thêm widget:
- **Điểm trung bình theo HDV** (top 5 + bottom 5)
- **Điểm trung bình theo agent**
- **Điểm trung bình theo NH / KS**
- **Trend theo tháng** — chất lượng dịch vụ có cải thiện không

### Cảnh báo tự động

Khi có response với **bất kỳ điểm nào ≤ 2** → tự tạo notification cho:
- Trưởng VPĐD
- OP phụ trách đoàn
- Nếu điểm HDV thấp → thông báo giám đốc điều hành HDV

Dùng bảng `thong_bao` sẵn có + tận dụng push notification đã dựng.

## 6. Bảo mật

Áp dụng bài học từ 5 lỗ hổng đã phát hiện:

- ✅ **KHÔNG** để policy `"Allow public insert"` trên bảng `khach_hang_khao_sat`
- ✅ Insert chỉ qua RPC `create_khao_sat_from_form` (có validate)
- ✅ RPC có **rate limit** — max 1 submit / SĐT / đoàn / phút (chống spam)
- ✅ Validate mã đoàn tồn tại + không quá 30 ngày (chống điền tùy tiện)
- ✅ Validate điểm 1-5
- ✅ Rate limit theo IP ở edge function nếu cần (Cloudflare / Vercel edge)
- ✅ Log audit khi có submit — ai submit vào lúc nào

## 7. AI integration (giai đoạn 2)

Sau khi có data, mở khóa AI:

- **AI phân tích sentiment** của "其他意見" — tự phân loại tích cực/tiêu cực + trích xuất chủ đề (HDV / KS / NH / xe)
- **AI weekly digest** — sáng thứ 2 AI viết báo cáo tuần: "3 HDV được khen nhất, 2 KS bị chê, phàn nàn nhiều nhất về X"
- **AI auto-flag** — response có comment tiêu cực → AI đọc + phân loại mức nghiêm trọng → alert theo cấp

## 8. Roadmap triển khai

| Tuần | Việc | Deliverable |
|---|---|---|
| Tuần 1 | Bảng `khach_hang_khao_sat` + RPC + migration | DB sẵn sàng |
| Tuần 1 | Route `/khao-sat/:maDoan` + form UI + i18n cho 4 ngôn ngữ | Khách điền được |
| Tuần 2 | Nút "In QR" trong đoàn detail + tab "Khảo sát" | OP dùng được |
| Tuần 2 | Widget dashboard + cảnh báo response ≤ 2 điểm | Quản lý dùng được |
| Tuần 3 | AI sentiment (nếu Q3-B: mã giảm giá — cần thêm coupon logic) | Tự động hóa |

**Tổng thời gian:** 3 tuần cho phiên bản đầy đủ, 1 tuần cho MVP (form + insert + tab xem response).

## 9. Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Spam form / bot | Rate limit RPC + Cloudflare Turnstile nếu cần |
| Khách điền sai mã đoàn | Q2-A (QR có sẵn mã) → khách không phải gõ |
| Data rác (troll rating) | Yêu cầu SĐT hợp lệ + có thể validate qua OTP nếu cần |
| Ngôn ngữ không chuẩn | Nhờ HDV Đài kiểm lại wording Trad. Chinese |
| Bảo mật đầu vào | Insert chỉ qua RPC (không direct), RLS chặt |

## 10. Định nghĩa "XONG"

- [ ] Migration DB đã apply, RPC hoạt động
- [ ] Route public `/khao-sat/:maDoan` truy cập được từ mobile
- [ ] 4 ngôn ngữ chuyển đổi mượt
- [ ] Submit → data về DB, hiển thị được ở tab "Khảo sát"
- [ ] QR code generate được từ đoàn detail
- [ ] Test bằng khách thật 1 đoàn → thu về ít nhất 5 response
- [ ] Test bảo mật: dùng anon key thử INSERT trực tiếp bảng → phải bị từ chối
- [ ] Cảnh báo response ≤ 2 điểm gửi được đến người quản lý
