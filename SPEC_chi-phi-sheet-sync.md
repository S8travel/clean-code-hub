# SPEC — Tự động xuất báo cáo chi phí đoàn lên Google Sheet
> Soạn ngày 22/05/2026. Dành cho phiên code triển khai.
> Loại việc: tính năng mới, RỦI RO THẤP — chỉ đọc dữ liệu + xuất ra ngoài,
> KHÔNG đụng logic kế toán, KHÔNG đụng giao diện.

## 1. Mục tiêu

Edge Function tự động chạy **sáng thứ 6 hàng tuần**, thống kê chi phí các đoàn sắp
khởi hành, ghi kết quả vào **một tab mới** trong **một file Google Sheet cố định**.

Tái dùng hạ tầng sẵn có — KHÔNG viết lại từ đầu:
- Helper `supabase/functions/_shared/sheets.ts` (OAuth, addSheet, batchUpdate, append).
- Pattern đã chạy ở `sync-dntt-to-sheet` / `sync-dntt-du-chi-to-sheet`.
- Credential Google: kiểm tra đã có sẵn (2 function trên đang dùng) — nhiều khả năng
  không phải tạo mới.

Đề xuất tên function: `sync-chi-phi-to-sheet`.

## 2. Lịch chạy

- Sáng thứ 6 hàng tuần, qua `pg_cron`.
- ⚠️ Máy chủ Supabase chạy giờ UTC. "7h sáng thứ 6 giờ VN" = 0h UTC thứ 6
  → cron `0 0 * * 5` (chỉnh giờ theo ý muốn, nhớ quy đổi −7 tiếng).

## 3. Khoảng ngày lọc dữ liệu

Mỗi lần chạy (vào thứ 6) liệt kê đoàn có **`ngay_di`** trong khoảng:

- **Từ:** thứ 5 = ngày chạy − 1 ngày
- **Đến:** thứ 4 tuần sau = ngày chạy + 5 ngày
- → Cửa sổ 7 ngày: `[run_date − 1, run_date + 5]`.

Điều kiện lọc thêm: chỉ đoàn `trang_thai = 'dang_chay'`.

## 4. Nội dung báo cáo

### 4a. Tiêu đề
- Dòng 1: `CHI PHI CAC DOAN KHOI HANH <từ ngày> - <đến ngày>`
- Dòng 2 (phụ đề): `Loc theo ngay khoi hanh (ngay_di); chi gom doan dang chay (trang_thai = 'dang_chay')`

### 4b. Bảng chi tiết — mỗi đoàn 1 dòng
Cột: `STT | Agent | Tên đoàn | Loại tour | Ngày đi | Ngày về | Số khách | Chi phí (VND) | Ghi chú`

- **Agent**: `doan.agent_id → agents.ten`. Đoàn không có agent_id → để "Other".
- **Số khách**: `doan.so_khach`.
- **Chi phí (VND)**: tổng chi phí của đoàn. ⚠️ Định nghĩa PHẢI khớp với bản thủ công
  (file mẫu `Chi_phi_doan_21-28.5.2026.xlsx`) — **lấy lại đúng câu truy vấn mà
  task tạo file mẫu đã dùng**. Dự kiến: `SUM(COALESCE(thanh_tien_thuc_te, thanh_tien))`
  trên `doan_chi_phi` của đoàn, loại dòng `is_excluded = true`. Phiên code phải xác
  nhận lại để 2 con số trùng nhau.
- **Ghi chú**: cột cảnh báo tự động — xem mục 5.
- Sắp xếp: theo `ngay_di` tăng dần.

Dòng cuối: `TONG CONG <N> doan` — tổng Số khách, tổng Chi phí.

### 4c. Bảng tổng hợp theo Agent (đặt bên phải hoặc bên dưới bảng chi tiết)
Tiêu đề: `TONG HOP THEO AGENT`
Cột: `Agent | Số đoàn | Tổng số khách | Tổng chi phí (VND)`
- Gom nhóm theo Agent.
- Dòng cuối: `TONG CONG` — tổng cả 3 cột số.

### 4d. Định dạng
- Số tiền: phân cách hàng nghìn (vd `2.511.448.422`).
- Header bảng tô nền, dòng tổng tô nền nhạt (theo file mẫu).

## 5. Cảnh báo tự động (cột "Ghi chú")

Đánh dấu đoàn **nghi chưa nhập đủ chi phí** — quy tắc, KHÔNG cần AI.

Tín hiệu (theo nhận xét trong file mẫu: "VDC052705BR6 25 khách chỉ 9 dòng",
"VHD052105BR6 21 khách 10 dòng"): số **dòng** `doan_chi_phi` của đoàn ít bất thường
so với quy mô.

Đề xuất quy tắc khởi điểm (phiên code + người dùng tinh chỉnh ngưỡng sau):
- Đếm số dòng `doan_chi_phi` của đoàn (loại `is_excluded`).
- Nếu số dòng `< số đêm tour × 3` (hoặc một ngưỡng do người dùng chọn) → ghi
  `⚠ Nghi thiếu chi phí` vào cột Ghi chú.
- Đoàn bình thường → để trống.

→ Ngưỡng nên để thành hằng số dễ chỉnh ở đầu file, không cứng trong logic.

## 6. Nơi xuất kết quả

- **Một file Google Sheet cố định** (1 lần tạo, lưu spreadsheet_id vào config/secret).
- Mỗi lần chạy: tạo **tab mới**, tên = ngày chạy, định dạng `YYYY-MM-DD` (vd `2026-05-22`).
- Nếu tab trùng tên đã tồn tại (chạy lại trong ngày) → ghi đè hoặc thêm hậu tố.
- Sau ~1 năm có ~52 tab — chấp nhận được.

## 7. Rủi ro & lưu ý

- Read-only: chỉ SELECT dữ liệu, không ghi vào DB → không thể làm sai tiền.
- Chạy 1 lần/tuần → tải DB không đáng kể (khác vụ Disk IO trước do refetch liên tục).
- Bắt buộc: con số "Chi phí" phải khớp bản thủ công — đây là điểm dễ sai nhất.
- Xử lý lỗi: nếu gọi Google Sheets API thất bại → log lỗi, KHÔNG để cron báo xanh giả.
- Cân nhắc: gửi 1 thông báo (email/Slack) khi chạy xong hoặc khi lỗi.

## 8. Định nghĩa "XONG"

- Chạy thử thủ công 1 lần → tab mới xuất hiện, 2 bảng + cảnh báo đúng.
- Số liệu khớp file mẫu `Chi_phi_doan_21-28.5.2026.xlsx` (cùng khoảng ngày).
- `pg_cron` đã đặt lịch, đã test trigger.
- Lint + typecheck sạch (edge function nằm trong phạm vi CI).
