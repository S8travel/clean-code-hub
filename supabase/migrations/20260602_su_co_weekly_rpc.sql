-- RPC tổng hợp phát sinh SỰ CỐ (doan_log.loai='su_co') theo tuần.
-- Dùng bởi edge function sync-su-co-to-sheet (báo cáo Google Sheet sáng thứ 7 hàng tuần).
--
-- Cột báo cáo mẫu: Code | Điều hành thao tác (OP) | HDV | Số khách |
--                  Vấn đề phát sinh (tieu_de) | Phương án xử lý (noi_dung).
-- PHẠM VI: gom sự cố của ĐOÀN ĐANG CHẠY có lịch chạy OVERLAP tuần [p_from, p_to]
--   (ngay_di <= p_to AND ngay_ve >= p_from) — KHÔNG lọc theo ngày ghi log.
--   Lý do: sự cố thuộc về đoàn; báo cáo tuần = các đoàn chạy trong tuần đó.
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
  FROM public.doan d
  JOIN public.doan_log l ON l.doan_id = d.id AND l.loai = 'su_co'
  LEFT JOIN public.huong_dan_vien h1 ON h1.id = d.huong_dan_vien_id
  LEFT JOIN public.huong_dan_vien h2 ON h2.id = d.huong_dan_vien_id_2
  LEFT JOIN LATERAL (
    SELECT ur.ho_ten
    FROM public.user_roles ur
    WHERE ur.user_id = d.assigned_to AND ur.ho_ten IS NOT NULL
    LIMIT 1
  ) op ON TRUE
  WHERE d.trang_thai = 'dang_chay'
    AND d.ngay_di <= p_to
    AND d.ngay_ve >= p_from
  ORDER BY d.ngay_di, d.ten_doan, l.created_at, l.id;
$$;

COMMENT ON FUNCTION public.get_su_co_weekly(date, date) IS
  'Su co (doan_log.loai=su_co) cua doan DANG CHAY co lich chay overlap [p_from,p_to] '
  '(ngay_di<=p_to AND ngay_ve>=p_from). op_ten=OP(assigned_to) fallback nguoi tao log; '
  'hdv_1/2=HDV doan. Dung boi edge function sync-su-co-to-sheet.';

GRANT EXECUTE ON FUNCTION public.get_su_co_weekly(date, date)
  TO authenticated, service_role;
