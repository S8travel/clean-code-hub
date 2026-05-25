-- Báo giá: thêm phụ thu lump-sum (vé cầu đường, xe trung chuyển, các phí cố
-- định khác). KHÔNG nhân theo pax — tính 1 lần cho cả tour.

ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS phu_thu numeric NOT NULL DEFAULT 0;
