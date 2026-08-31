-- SỔ TAY BÁO GIÁ — bộ nhớ do chính người nhập dựng lên.
--
-- VÌ SAO CÓ BẢNG NÀY
-- Trước đây AI đọc lịch trình tiếng Trung rồi phải khớp vào DANH MỤC VẬN HÀNH
-- (~938 dòng cảnh điểm / nhà hàng / khách sạn / xe) — một danh sách THUẦN TÊN
-- TIẾNG VIỆT, dựng ra để điều đoàn chứ không phải để báo giá. Máy phải tự dịch
-- rồi mò, đoán sai thì không ai biết, và KHÔNG chỗ nào ghi nhớ lại: sửa tay xong
-- lần sau vẫn sai y hệt.
--
-- Bảng này lật ngược: máy chỉ đọc ra các khoản MẤT TIỀN, người nhập điền giá,
-- và cặp (tiếng Trung ↔ tiếng Việt ↔ giá) được cất lại. Lần sau gặp lại cách
-- viết đó thì tự điền. Sổ tay chỉ dày lên từ thao tác thật, nên nó luôn đúng
-- bằng thứ công ty thực sự chào — không phải bằng cả kho vận hành.
--
-- GIÁ Ở ĐÂY LÀ GIÁ VỐN (đúng giá mua), chốt với chủ doanh nghiệp 28/08/2026.
-- Phần đệm lợi nhuận tính ở tầng trên, không trộn vào đây.

CREATE TABLE public.bao_gia_so_tay (
  id            bigserial PRIMARY KEY,

  -- Khoá tra cứu: tiếng Trung ĐÃ NẮN (xem lib/bao-gia-so-tay.ts → chuanHoaZh).
  -- Nắn ở tầng ứng dụng chứ không phải ở DB vì luật nắn còn thay đổi và phải
  -- test được; DB chỉ giữ kết quả.
  khoa_zh       text NOT NULL,
  -- Nguyên văn lần đầu gặp — giữ để người đọc còn nhận ra, và để soát lại khi
  -- luật nắn đổi. KHÔNG dùng để tra cứu.
  zh_goc        text,

  ten_vi        text,
  loai          text NOT NULL CHECK (loai IN ('hotel','meal','ticket','dich_vu')),

  -- Giá vốn người nhập gõ. NULL = chưa ai điền → dòng vẫn hiện cam ở bảng chi
  -- phí để người nhập biết còn thiếu. KHÔNG mặc định 0: 0 trông như đã điền.
  don_gia       numeric CHECK (don_gia IS NULL OR don_gia >= 0),

  -- Chính sách suất miễn (chủ yếu cho bữa ăn): cứ foc_khach khách thì miễn
  -- foc_mien suất. Ghi kèm để lần sau khỏi phải tra lại nhà hàng.
  foc_khach     integer CHECK (foc_khach IS NULL OR foc_khach > 0),
  foc_mien      numeric CHECK (foc_mien  IS NULL OR foc_mien  >= 0),

  -- Phân biệt hai chỗ trùng tên (自助餐 ở Hà Nội ≠ 自助餐 ở Hạ Long).
  dia_diem      text,

  ghi_chu       text,

  -- Đếm để người soát biết dòng nào đang gánh việc, dòng nào chưa ai dùng.
  so_lan_dung   integer NOT NULL DEFAULT 0,
  lan_cuoi_dung timestamptz,

  -- 'nguoi_nhap' = do người gõ ở màn báo giá (đáng tin nhất)
  -- 'seed'       = nạp từ dữ liệu cũ khi dựng sổ tay
  nguon         text NOT NULL DEFAULT 'nguoi_nhap'
                CHECK (nguon IN ('nguoi_nhap','seed')),

  -- Ngưng dùng thay cho xoá: dòng đã dùng ở báo giá cũ thì đừng làm nó biến mất.
  ngung         boolean NOT NULL DEFAULT false,

  tao_boi       uuid,
  tao_luc       timestamptz NOT NULL DEFAULT now(),
  cap_nhat_luc  timestamptz NOT NULL DEFAULT now(),

  -- Một cách viết chỉ trỏ MỘT thứ trong cùng một loại. Cùng chữ nhưng khác loại
  -- thì vẫn tách (船上自助餐 là bữa ăn; cùng chữ đó làm tên vé thì là chuyện khác).
  CONSTRAINT bao_gia_so_tay_khoa_loai_uniq UNIQUE (khoa_zh, loai)
);

COMMENT ON TABLE  public.bao_gia_so_tay IS
  'Sổ tay báo giá: cặp tiếng Trung ↔ tiếng Việt ↔ giá vốn, tích luỹ từ thao tác người nhập.';
COMMENT ON COLUMN public.bao_gia_so_tay.khoa_zh IS
  'Tiếng Trung ĐÃ NẮN bằng chuanHoaZh (lib/bao-gia-so-tay.ts). Đổi luật nắn thì phải nạp lại cột này.';
COMMENT ON COLUMN public.bao_gia_so_tay.don_gia IS
  'Giá VỐN. NULL = chưa ai điền (khác 0 = miễn phí thật).';

-- Tra cứu luôn theo (khoa_zh, loai) — đã có UNIQUE lo. Thêm index cho màn quản
-- lý lọc theo loại và cho việc tìm dòng chưa có giá.
CREATE INDEX bao_gia_so_tay_loai_idx    ON public.bao_gia_so_tay (loai) WHERE NOT ngung;
CREATE INDEX bao_gia_so_tay_thieu_gia_idx ON public.bao_gia_so_tay (loai)
  WHERE don_gia IS NULL AND NOT ngung;

-- Tìm gần đúng khi không trúng khoá: gợi ý "ý bạn là…" ở ô nhập.
-- pg_trgm trên chữ Hán yếu (đo được: cặp SAI có thể chấm cao hơn cặp ĐÚNG) nên
-- index này CHỈ để xếp hạng gợi ý cho người chọn, TUYỆT ĐỐI không dùng để tự
-- điền giá hay để lọc bớt trước khi hỏi AI.
CREATE INDEX bao_gia_so_tay_zh_trgm_idx ON public.bao_gia_so_tay
  USING gin (khoa_zh public.gin_trgm_ops);

CREATE INDEX bao_gia_so_tay_vi_trgm_idx ON public.bao_gia_so_tay
  USING gin (ten_vi public.gin_trgm_ops);

-- Bảng mới trong schema public KHÔNG còn tự lộ qua Data API từ 30/10/2026.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bao_gia_so_tay TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bao_gia_so_tay_id_seq TO authenticated, service_role;
-- KHÔNG cấp cho anon: đây là giá VỐN. Khoá publishable nằm sẵn trong bundle web
-- nên RLS là hàng rào duy nhất còn lại — đừng mở thêm cửa nào.
REVOKE ALL ON public.bao_gia_so_tay FROM anon;

ALTER TABLE public.bao_gia_so_tay ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON public.bao_gia_so_tay
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BẮT BUỘC: khoá ghi cho tài khoản chỉ xem. Migration quét-một-lần
-- 20260728_tai_khoan_chi_xem chỉ phủ các bảng CÓ LÚC ĐÓ; bảng tạo sau mà quên
-- ba dòng này là một lỗ hổng im lặng.
CREATE POLICY chi_xem_block_insert ON public.bao_gia_so_tay AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_update ON public.bao_gia_so_tay AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
CREATE POLICY chi_xem_block_delete ON public.bao_gia_so_tay AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));

-- cap_nhat_luc tự chạy: người soát cần biết giá này gõ từ bao giờ để còn ngờ
-- những dòng quá cũ.
CREATE OR REPLACE FUNCTION public.bao_gia_so_tay_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.cap_nhat_luc := now();
  RETURN NEW;
END $$;

CREATE TRIGGER bao_gia_so_tay_touch_updated
  BEFORE UPDATE ON public.bao_gia_so_tay
  FOR EACH ROW EXECUTE FUNCTION public.bao_gia_so_tay_touch();
