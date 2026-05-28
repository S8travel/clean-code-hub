-- Báo giá: snapshot tỷ giá VCB (giá MUA USD) lúc tạo báo giá. Cùng với
-- exchange_rate (báo giá rate, user quote khách) → tính được chênh lệch
-- tỷ giá cho biên lợi nhuận.
--
-- chenh_lech_vnd = gia_ban × (vcb_rate − exchange_rate) / exchange_rate
--   - exchange_rate < vcb_rate → gain (agency profit thêm khi convert USD)
--   - exchange_rate > vcb_rate → loss
-- vcb_rate = NULL → bỏ qua chênh lệch (biên giữ công thức cũ).

ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS vcb_rate numeric;
