-- RPC thống kê đoàn theo AGENT cho báo cáo sự cố tuần (bảng tổng hợp đầu báo cáo).
-- Đếm số đoàn + tổng số khách của ĐOÀN ĐANG CHẠY có lịch chạy OVERLAP tuần
--   [p_from, p_to] (ngay_di <= p_to AND ngay_ve >= p_from) — cùng phạm vi với bảng sự cố.
-- Trả raw theo từng agent (agent_id NULL → 'Other'); gom nhóm Xihong/Cola/Guo/Khác
--   được xử lý ở builder (su-co-sheet-report.ts) để dễ test + linh hoạt.
--
-- ALTER-free (chỉ tạo function) → theo migration rules chỉ cần GRANT EXECUTE.

CREATE OR REPLACE FUNCTION public.get_doan_agent_weekly(p_from date, p_to date)
RETURNS TABLE (
  agent_ten  text,
  so_doan    integer,
  so_khach   integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(a.ten, 'Other')::text,
    COUNT(*)::integer,
    COALESCE(SUM(COALESCE(d.so_khach, 0)), 0)::integer
  FROM public.doan d
  LEFT JOIN public.agents a ON a.id = d.agent_id
  WHERE d.trang_thai = 'dang_chay'
    AND d.ngay_di <= p_to
    AND d.ngay_ve >= p_from
  GROUP BY a.ten;
$$;

COMMENT ON FUNCTION public.get_doan_agent_weekly(date, date) IS
  'Thong ke doan theo agent: so_doan + tong so_khach cua doan dang_chay overlap [p_from,p_to]. '
  'Gom nhom Xihong/Cola/Guo/Khac o builder. Dung boi edge function sync-su-co-to-sheet.';

GRANT EXECUTE ON FUNCTION public.get_doan_agent_weekly(date, date)
  TO authenticated, service_role;
