-- Chuông báo khi TÁC VỤ NỀN (pg_cron) hỏng.
--
-- Bối cảnh: job `remind_pv_phancong_daily` hỏng 100% mỗi ngày suốt 3,5 tháng
-- (23/05 → 05/09/2026) mà không ai biết — vá riêng ở 20260905_fix_cron_nhac_phan_cong.
-- Vấn đề THẬT không phải một hàm sai, mà là không có ai canh 7 job đang chạy.
-- Job hỏng = thông báo không bắn, sheet không sync, cổng đối tác không được đẩy —
-- toàn thứ im lặng, người dùng chỉ thấy "hệ thống dạo này ít nhắc".
--
-- Cách làm: mỗi sáng quét cron.job_run_details 25h qua, job nào có lần chạy
-- 'failed' thì bắn 1 thông báo cho ADMIN (không phải giám đốc — đây là lỗi kỹ
-- thuật, GĐ không xử lý được và sẽ chỉ làm nhờn chuông).
--
-- Gộp theo jobname → mỗi job hỏng chỉ 1 thông báo/ngày, kể cả job chạy 30 phút/lần.
-- NOT EXISTS 20h → chạy tay nhiều lần trong ngày cũng không bắn trùng.

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
  for r in
    select j.jobname,
           count(*)                                      as so_lan,
           max(d.end_time)                               as lan_cuoi,
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
end;
$function$;

-- Hàm này CHỈ dành cho cron. Không ai được gọi qua REST.
REVOKE ALL ON FUNCTION public.fn_canh_bao_cron_that_bai() FROM PUBLIC, anon, authenticated;

-- Idempotent: gỡ job cũ nếu áp lại migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'canh_bao_cron_that_bai') THEN
    PERFORM cron.unschedule('canh_bao_cron_that_bai');
  END IF;
END $$;

-- '0 0 * * *' = 0h UTC = 7h00 sáng giờ VN, sau khi mọi job đêm đã chạy xong.
SELECT cron.schedule(
  'canh_bao_cron_that_bai',
  '0 0 * * *',
  $cron$ SELECT public.fn_canh_bao_cron_that_bai(); $cron$
);
