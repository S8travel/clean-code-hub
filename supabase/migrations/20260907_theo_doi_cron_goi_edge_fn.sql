-- Chuông cảnh báo tác vụ nền: bịt điểm mù với các job gọi edge function.
--
-- Bối cảnh: `canh_bao_cron_that_bai` (dựng 05/09/2026) chỉ đọc
-- `cron.job_run_details.status`, nên chỉ bắt được job chạy hàm SQL. Bốn job còn lại
-- gọi edge function qua `net.http_post`, mà hàm đó chỉ XẾP HÀNG request rồi trả id
-- ngay → cron LUÔN ghi `succeeded`, kể cả khi edge function 500 hay hết giờ.
--
-- Đo 07/09/2026: 5/15 lượt gọi trong `net._http_response` có `timed_out = true`,
-- không có status_code — mà `cron.job_run_details` vẫn xanh và chuông im.
--
-- Nguyên nhân số timeout đó: `sync-dntt-to-sheet-30min` là job DUY NHẤT không đặt
-- `timeout_milliseconds` → pg_net dùng mặc định 5 giây, trong khi ba job kia đều đặt
-- 120 giây. Edge fn phải đọc vài nghìn dòng rồi ghi Google Sheet, 5 giây là không đủ.
--
-- Migration này làm 3 việc:
--   1. Ghi lại mọi lượt cron gọi edge function (bảng cron_http_ket_qua) rồi chốt kết
--      quả thật vào đó — `net._http_response` chỉ giữ ~6 giờ nên phải chốt sớm.
--   2. Cho `fn_canh_bao_cron_that_bai` đọc thêm bảng này.
--   3. Đổi 4 job sang gọi qua `cron_goi_http`, và vá timeout của sync-dntt.

-- ── 1. Bảng lưu kết quả gọi edge function ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_http_ket_qua (
  id          bigserial PRIMARY KEY,
  job_name    text        NOT NULL,
  request_id  bigint      NOT NULL,
  gui_luc     timestamptz NOT NULL DEFAULT now(),
  status_code int,
  timed_out   boolean,
  error_msg   text,
  chot_luc    timestamptz
);

CREATE INDEX IF NOT EXISTS cron_http_ket_qua_chua_chot_idx
  ON public.cron_http_ket_qua (gui_luc) WHERE chot_luc IS NULL;
CREATE INDEX IF NOT EXISTS cron_http_ket_qua_gui_luc_idx
  ON public.cron_http_ket_qua (gui_luc DESC);

-- Bảng kỹ thuật, chỉ admin cần xem. Không mở cho anon.
GRANT SELECT ON public.cron_http_ket_qua TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cron_http_ket_qua TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cron_http_ket_qua_id_seq TO service_role;
REVOKE ALL ON public.cron_http_ket_qua FROM anon;

ALTER TABLE public.cron_http_ket_qua ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_http_admin_doc ON public.cron_http_ket_qua;
CREATE POLICY cron_http_admin_doc ON public.cron_http_ket_qua
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- Bắt buộc theo CLAUDE.md: khoá ghi cho tài khoản chỉ xem. Bảng tạo SAU migration
-- 20260728 nên không tự có các policy này.
DROP POLICY IF EXISTS chi_xem_block_insert ON public.cron_http_ket_qua;
CREATE POLICY chi_xem_block_insert ON public.cron_http_ket_qua AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_update ON public.cron_http_ket_qua;
CREATE POLICY chi_xem_block_update ON public.cron_http_ket_qua AS RESTRICTIVE
  FOR UPDATE TO public USING (NOT (SELECT public.is_tk_chi_xem()));
DROP POLICY IF EXISTS chi_xem_block_delete ON public.cron_http_ket_qua;
CREATE POLICY chi_xem_block_delete ON public.cron_http_ket_qua AS RESTRICTIVE
  FOR DELETE TO public USING (NOT (SELECT public.is_tk_chi_xem()));

-- ── 2. Gọi edge function KÈM ghi nhận ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_goi_http(
  p_job     text,
  p_url     text,
  p_headers jsonb,
  p_body    jsonb DEFAULT '{}'::jsonb,
  p_timeout int   DEFAULT 120000
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := p_url, headers := p_headers, body := p_body,
    timeout_milliseconds := p_timeout
  ) into v_request_id;

  insert into public.cron_http_ket_qua (job_name, request_id)
  values (p_job, v_request_id);

  return v_request_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.cron_goi_http(text, text, jsonb, jsonb, int) FROM PUBLIC, anon, authenticated;

-- ── 3. Chốt kết quả trước khi net._http_response bị dọn (~6 giờ) ────────────
CREATE OR REPLACE FUNCTION public.chot_ket_qua_http()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
begin
  update public.cron_http_ket_qua k
  set status_code = r.status_code,
      timed_out   = r.timed_out,
      error_msg   = left(coalesce(r.error_msg, ''), 500),
      chot_luc    = now()
  from net._http_response r
  where r.id = k.request_id
    and k.chot_luc is null;

  -- Dọn lịch sử: giữ 30 ngày là quá đủ để soi lại một sự cố.
  delete from public.cron_http_ket_qua where gui_luc < now() - interval '30 days';
end;
$function$;

REVOKE ALL ON FUNCTION public.chot_ket_qua_http() FROM PUBLIC, anon, authenticated;

-- ── 4. Chuông cảnh báo: thêm nhánh đọc kết quả gọi edge function ────────────
CREATE OR REPLACE FUNCTION public.fn_canh_bao_cron_that_bai()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  r record;
  v_tieu_de text;
  v_noi_dung text;
begin
  -- (a) Job chạy hàm SQL: pg_cron ghi thẳng trạng thái.
  for r in
    select j.jobname,
           count(*)                                       as so_lan,
           max(d.end_time)                                as lan_cuoi,
           left(coalesce(max(d.return_message), ''), 400) as loi
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where d.status = 'failed'
      and d.start_time > now() - interval '25 hours'
    group by j.jobname
  loop
    v_tieu_de  := 'Tác vụ nền hỏng: ' || r.jobname;
    v_noi_dung := 'Hỏng ' || r.so_lan || ' lần trong 24h qua, gần nhất '
                  || to_char(r.lan_cuoi at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
                  || '. Lỗi: ' || coalesce(nullif(r.loi, ''), '(không rõ)');

    insert into thong_bao (user_id, loai, tieu_de, noi_dung, is_read)
    select ur.user_id, 'khac', v_tieu_de, v_noi_dung, false
    from user_roles ur
    where ur.active and ur.role = 'admin'
      and not exists (
        select 1 from thong_bao tb
        where tb.user_id = ur.user_id
          and tb.tieu_de = v_tieu_de
          and tb.created_at > now() - interval '20 hours'
      );
  end loop;

  -- (b) Job gọi edge function: pg_cron luôn báo succeeded vì nó chỉ xếp hàng
  --     request. Kết quả THẬT nằm ở cron_http_ket_qua.
  --     Ba loại hỏng: HTTP >= 300 · hết giờ · gửi hơn 2 tiếng mà không chốt được
  --     kết quả (response đã bị dọn trước khi chot_ket_qua_http kịp đọc).
  for r in
    select k.job_name                                            as jobname,
           count(*)                                              as so_lan,
           max(k.gui_luc)                                        as lan_cuoi,
           count(*) filter (where k.timed_out)                   as so_timeout,
           count(*) filter (where k.status_code >= 300)           as so_loi_http,
           count(*) filter (where k.chot_luc is null)             as so_khong_ro,
           left(coalesce(max(k.error_msg), ''), 300)              as loi
    from public.cron_http_ket_qua k
    where k.gui_luc > now() - interval '25 hours'
      and (
        k.timed_out
        or k.status_code >= 300
        or (k.chot_luc is null and k.gui_luc < now() - interval '2 hours')
      )
    group by k.job_name
  loop
    v_tieu_de  := 'Tác vụ nền lỗi khi gọi dịch vụ: ' || r.jobname;
    v_noi_dung := r.so_lan || ' lượt gọi có vấn đề trong 24h qua ('
                  || r.so_timeout || ' hết giờ, ' || r.so_loi_http || ' lỗi HTTP, '
                  || r.so_khong_ro || ' không rõ kết quả), gần nhất '
                  || to_char(r.lan_cuoi at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
                  || case when nullif(r.loi, '') is null then '.' else '. Lỗi: ' || r.loi end;

    insert into thong_bao (user_id, loai, tieu_de, noi_dung, is_read)
    select ur.user_id, 'khac', v_tieu_de, v_noi_dung, false
    from user_roles ur
    where ur.active and ur.role = 'admin'
      and not exists (
        select 1 from thong_bao tb
        where tb.user_id = ur.user_id
          and tb.tieu_de = v_tieu_de
          and tb.created_at > now() - interval '20 hours'
      );
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_canh_bao_cron_that_bai() FROM PUBLIC, anon, authenticated;

-- ── 5. Cron chốt kết quả, 10 phút/lần ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chot_ket_qua_http') THEN
    PERFORM cron.unschedule('chot_ket_qua_http');
  END IF;
END $$;

SELECT cron.schedule(
  'chot_ket_qua_http',
  '*/10 * * * *',
  $cron$ SELECT public.chot_ket_qua_http(); $cron$
);
