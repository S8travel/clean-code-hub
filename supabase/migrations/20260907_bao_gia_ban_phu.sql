-- Bản phụ của báo giá: một báo giá con gắn vào báo giá gốc.
--
-- Dùng khi cùng một khách cần chào 2-3 phương án song song (4 sao / 5 sao / rút
-- ngày). Trước đây chỉ có nút "Nhân bản" — ra một báo giá rời, nhìn danh sách
-- không biết cái nào đẻ ra cái nào.
--
-- CHỈ thêm cột + index + trigger trên bảng đã có → KHÔNG cần GRANT hay policy
-- mới (xem CLAUDE.md, mục "Migration rules"). Đã đối chiếu prod: quyền trên
-- bao_gia cấp ở MỨC BẢNG, 4 policy hiện có không nhắc tên cột nào.

ALTER TABLE public.bao_gia
  ADD COLUMN IF NOT EXISTS bao_gia_goc_id bigint
    REFERENCES public.bao_gia(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bao_gia.bao_gia_goc_id IS
  'Báo giá gốc của bản phụ này. NULL = báo giá độc lập. Chùm PHẲNG một tầng: '
  'bản phụ không được có bản phụ của riêng nó (trigger bao_gia_chum_phang).';

-- Xoá báo giá gốc thì bản phụ KHÔNG mất, chỉ đứt liên kết và thành báo giá
-- độc lập (ON DELETE SET NULL). Lưu ý: bao_gia_phien_ban.bao_gia_id là
-- ON DELETE RESTRICT, nên báo giá đã từng bấm "Gửi khách hàng" vốn đã không
-- xoá được — nhánh SET NULL này chỉ thật sự chạy với báo giá chưa gửi bao giờ.

-- Tự trỏ chính nó: CHECK bắt được vì chỉ cần nhìn đúng dòng đó.
ALTER TABLE public.bao_gia
  DROP CONSTRAINT IF EXISTS bao_gia_goc_khong_tu_tro;
ALTER TABLE public.bao_gia
  ADD CONSTRAINT bao_gia_goc_khong_tu_tro
  CHECK (bao_gia_goc_id IS DISTINCT FROM id);

-- Partial index: đại đa số báo giá là độc lập (cột NULL), không cần nằm trong index.
CREATE INDEX IF NOT EXISTS idx_bao_gia_goc_id
  ON public.bao_gia (bao_gia_goc_id)
  WHERE bao_gia_goc_id IS NOT NULL;

-- ── Chùm PHẲNG một tầng ──────────────────────────────────────────────────────
-- CHECK KHÔNG làm được việc này: nó chỉ nhìn được đúng dòng của nó, không hỏi
-- được "cái mình trỏ tới có cha chưa". Phải dùng trigger, và phải bịt HAI chiều.
CREATE OR REPLACE FUNCTION public.fn_bao_gia_chum_phang()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Chiều 1: gắn vào một dòng mà bản thân nó đã là bản phụ → chùm 2 tầng.
  IF EXISTS (
    SELECT 1 FROM public.bao_gia g
    WHERE g.id = NEW.bao_gia_goc_id AND g.bao_gia_goc_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Báo giá % đã là bản phụ, không thể làm gốc cho báo giá khác. Gắn thẳng vào báo giá gốc chung.',
      NEW.bao_gia_goc_id
      USING ERRCODE = '23514';
  END IF;

  -- Chiều 2: biến một dòng ĐANG LÀ GỐC của người khác thành bản phụ. Điều kiện
  -- của chiều 1 không bao giờ chạm tới trường hợp này nên phải xét riêng.
  IF EXISTS (
    SELECT 1 FROM public.bao_gia c
    WHERE c.bao_gia_goc_id = NEW.id
  ) THEN
    RAISE EXCEPTION
      'Báo giá % đang là gốc của bản phụ khác, không thể biến nó thành bản phụ.',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bao_gia_chum_phang ON public.bao_gia;
-- WHEN (...IS NOT NULL): mọi lượt ghi báo giá thường KHÔNG vào thân hàm. Bó hẹp
-- vùng ảnh hưởng — hàm này hỏng cũng không chặn được luồng tạo/sửa báo giá bình thường.
CREATE TRIGGER bao_gia_chum_phang
  BEFORE INSERT OR UPDATE OF bao_gia_goc_id ON public.bao_gia
  FOR EACH ROW
  WHEN (NEW.bao_gia_goc_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_bao_gia_chum_phang();
