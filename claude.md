# QUY TẮC THANH TOÁN (PAYMENT RULES)

## Nguyên tắc cốt lõi

- Chi phí (cost_items) = khoản phải trả
- Thanh toán (payments) = tiền đã thực chi
- Hai khái niệm này KHÔNG giống nhau

---

## Cấu trúc dữ liệu

### 1. cost_items (chi phí thực tế)
- Là chi phí phát sinh thực tế từ điều tour
- Dùng cho kế toán
- KHÔNG được xoá

### 2. payments (thanh toán)
- Là dòng tiền thực tế đã chi ra
- Có thể thanh toán 1 phần hoặc toàn bộ

### 3. payment_allocations (phân bổ thanh toán)
- Dùng để liên kết payment với cost_items
- Xác định payment trả cho chi phí nào

---

## Quy tắc quan hệ

- 1 cost_item có thể được thanh toán nhiều lần
- 1 payment có thể thanh toán cho nhiều cost_items

Ví dụ:
- Khách sạn: 100tr
  - Thanh toán 1: 30tr
  - Thanh toán 2: 70tr

- Hoặc:
  - Khách sạn: 100tr
  - Xe: 20tr
  - 1 payment: 120tr

---

## Quy tắc phân bổ

- Mỗi payment BẮT BUỘC phải có allocation
- Tổng allocation ≤ số tiền payment
- Mỗi allocation phải rõ ràng (bao nhiêu tiền cho cost nào)

---

## Trạng thái chi phí

Mỗi cost_item có trạng thái:

- unpaid: chưa thanh toán
- partial_paid: thanh toán một phần
- paid: đã thanh toán đủ

Cách tính:
- dựa trên tổng payment_allocations so với cost_item.amount

---

## Quy tắc kế toán (rất quan trọng)

- KHÔNG được xoá cost_items
- KHÔNG được xoá payments
- KHÔNG được sửa payment sau khi đã xác nhận

Nếu sai:
→ tạo bản ghi điều chỉnh (adjustment)
→ KHÔNG sửa dữ liệu cũ

---

## Quy trình thanh toán

1. Tạo cost_items (chi phí thực tế)
2. Tạo đề nghị thanh toán (payment_request)
3. Duyệt
4. Thực hiện thanh toán (payment)
5. Ghi nhận allocation

---

## Kiểm tra hợp lệ

- Tổng allocation ≤ payment
- Tổng đã trả của cost_item ≤ cost_item.amount

---

## Nguyên tắc hệ thống

Luôn tách rõ:

- Chi phí (cost_items)
- Thanh toán (payments)
- Phân bổ (allocations)

---

## Những sai lầm cần tránh

- Không được coi payment là cost
- Không được bỏ qua bảng allocation
- Không được ghi đè dữ liệu cũ
- Không được sửa payment sau khi đã thanh toán