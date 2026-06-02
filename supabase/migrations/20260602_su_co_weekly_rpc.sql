-- RPC tổng hợp phát sinh SỰ CỐ (doan_log.loai='su_co') theo khoảng ngày của tuần.
-- Dùng bởi edge function sync-su-co-to-sheet (báo cáo Google Sheet thứ 2 hàng tuần).
--
-- Cột báo cáo mẫu: Code | Điều hành thao tác (OP) | HDV | Số khách |
--                  Vấn đề phát sinh (tieu_de) | Phương án xử lý (noi_dung).
-- Lọc theo created_at quy về giờ VN (Asia/Ho_Chi_Minh) để khớp "tuần" người dùng thấy.
-- op_ten = ho_ten của OP phụ trách (assigned_to); fallback người tạo log.
-- hdv_1 / hdv_2 = HDV chính + phụ (đoàn có thể 2 HDV) — builder ghép " | ".
--
-- ALTER-free (chỉ tạo function) → theo migration rules chỉ cần GRANT EXECUTE.

CREATE OR REPLACE FUNCTION public.get_su_co_weekly(p_from date, p_to date)
RETURNS TABLE (
  log_id      bigint,
  doan_id     bigint,
  ten_doan    text,
  op_ten      text,
  hdv_1       text,
  hdv_2       text,
  so_khach    integer,
  tieu_de     text,
  noi_dung    text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.id::bigint,
    d.id::bigint,
    d.ten_doan::text,
    COALESCE(op.ho_ten, l.created_by_ten)::text,
    h1.ten::text,
    h2.ten::text,
    COALESCE(d.so_khach, 0)::integer,
    l.tieu_de::text,
    l.noi_dung::text,
    l.created_at
  FROM public.doan_log l
  JOIN public.doan d ON d.id = l.doan_id
  LEFT JOIN public.huong_dan_vien h1 ON h1.id = d.huong_dan_vien_id
  LEFT JOIN public.huong_dan_vien h2 ON h2.id = d.huong_dan_vien_id_2
  LEFT JOIN LATERAL (
    SELECT ur.ho_ten
    FROM public.user_roles ur
    WHERE ur.user_id = d.assigned_to AND ur.ho_ten IS NOT NULL
    LIMIT 1
  ) op ON TRUE
  WHERE l.loai = 'su_co'
    AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  ORDER BY d.ten_doan, l.created_at, l.id;
$$;

COMMENT ON FUNCTION public.get_su_co_weekly(date, date) IS
  'Phát sinh sự cố (doan_log.loai=su_co) có created_at (giờ VN) trong [p_from, p_to]. '
  'op_ten = OP phụ trách (assigned_to) fallback người tạo log; hdv_1/hdv_2 = HDV đoàn. '
  'Dùng bởi edge function sync-su-co-to-sheet.';

GRANT EXECUTE ON FUNCTION public.get_su_co_weekly(date, date)
  TO authenticated, service_role;
