-- Đối tác yêu cầu sửa chương trình ngay trên cổng 外網.
-- Project lflsbwoqzmbknzdpaequ. Deploy migration thủ công.
--
-- Trước đây yêu cầu đổi đi bằng WeChat / mail rồi điều hành tự gõ lại thành một
-- dòng "lý do" khi chào bản mới. Không tra được AI yêu cầu và yêu cầu CHÍNH XÁC
-- cái gì — mà đó đúng là thứ cần khi vài tháng sau hai bên nhìn lại vì sao giá
-- đổi ba lần.
--
-- KHÔNG cần bảng mới bên CRM: `bao_gia_log` (migration 20260817) đã dựng sẵn cho
-- việc này, cột `loai` để free text và màn Lịch sử phiên bản đã có nhãn
-- 'yeu_cau_sua' chờ sẵn. Ở đây chỉ thiếu đúng một thứ: chỗ để chuông trỏ về.

-- Chuông đang biết đường tới đoàn (doan_id), lead (lead_id), ĐNTT (dntt_id)...
-- nhưng chưa biết đường tới một báo giá. Thiếu cột này thì bấm vào thông báo
-- không mở được gì — và một thông báo không bấm được thì cũng như không có.
ALTER TABLE public.thong_bao
  ADD COLUMN IF NOT EXISTS bao_gia_id bigint REFERENCES public.bao_gia(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.thong_bao.bao_gia_id IS
  'Báo giá liên quan — chuông trỏ về /bao-gia/:id (loai = bao_gia_yeu_cau_sua).';

-- Lọc "còn thông báo nào chưa đọc của báo giá này" — ít dòng nên index một phần.
CREATE INDEX IF NOT EXISTS idx_thong_bao_bao_gia
  ON public.thong_bao (bao_gia_id)
  WHERE bao_gia_id IS NOT NULL;
