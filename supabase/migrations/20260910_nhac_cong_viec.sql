-- Nhắc việc đã giao / đã nhận mà chưa hoàn thành (tab "Giao việc" trong Việc của tôi).
--
-- Phạm vi: CHỈ việc do NGƯỜI giao tay. Việc hệ thống tự sinh
-- (nguoi_giao = 00000000-0000-0000-0000-000000000000) đã có luồng nhắc riêng
-- (fn_remind_pv_phancong, fn_doan_booking_escalation) — không đụng tới, kẻo một
-- người nhận hai chuông cho cùng một đầu việc.
--
-- LƯU Ý: luật chọn tần suất ở đây có BẢN SAO bằng TypeScript trong
-- src/lib/nhac-cong-viec.ts (màn hình dùng để hiện nhãn + chặn nút "Nhắc ngay").
-- Sửa bên này thì sửa cả bên đó.

-- === 1. Ba cột mới trên cong_viec ===========================================
-- ALTER TABLE nên bảng giữ nguyên grants + RLS cũ, không cần cấp lại.
alter table public.cong_viec
  add column if not exists tan_suat_nhac text,
  add column if not exists nhac_lan_cuoi timestamptz,
  -- Mặc định 'tu_dong': luồng code nào quên khai báo thì việc KHÔNG bị nhắc.
  -- Chỉ màn "Tạo việc" khai 'tay'. Phần lớn việc đang treo là việc "Hóa đơn lệch
  -- số tiền" do use-hoa-don-unc tự sinh nhưng ghi nguoi_giao là tài khoản kế toán
  -- đang đăng nhập, nên lọc theo nguoi_giao KHÔNG tách được hai luồng.
  add column if not exists nguon_tao text not null default 'tu_dong';

do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cong_viec_nguon_tao_check'
  ) then
    alter table public.cong_viec
      add constraint cong_viec_nguon_tao_check check (nguon_tao in ('tay','tu_dong'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cong_viec_tan_suat_nhac_check'
  ) then
    alter table public.cong_viec
      add constraint cong_viec_tan_suat_nhac_check
      check (tan_suat_nhac is null or tan_suat_nhac in ('khong','hang_ngay','ba_ngay','hang_tuan'));
  end if;
end
$do$;

comment on column public.cong_viec.tan_suat_nhac is
  'Nguoi giao chon khi tao viec. NULL = he thong suy theo do uu tien (khan_cap/cao: hang ngay, binh thuong: 3 ngay, thap: hang tuan).';
comment on column public.cong_viec.nguon_tao is
  'tay = nguoi tu bam Tao viec (duoc nhac); tu_dong = do he thong sinh (hoa don lech, phan viec doan, huy doan...) - khong nhac.';
comment on column public.cong_viec.nhac_lan_cuoi is
  'Lan gan nhat viec nay duoc nhac (cron hoac nut Nhac ngay). Moc dem ky nhac ke tiep.';

-- Backfill: đánh dấu 'tay' cho những việc cũ KHÔNG khớp mẫu của các luồng tự
-- sinh đang có. Chạy một lần, việc tạo sau này tự khai lúc INSERT.
update public.cong_viec
   set nguon_tao = 'tay'
 where nguon_tao = 'tu_dong'
   and nguoi_giao <> '00000000-0000-0000-0000-000000000000'::uuid
   and loai_viec not like 'pv_%'
   and loai_viec <> 'huy_doan'
   and tieu_de not like 'Hóa đơn lệch số tiền%';

-- Cron quét theo trạng thái treo — index một phần cho rẻ.
create index if not exists idx_cong_viec_treo_nhac
  on public.cong_viec (nguoi_nhan, nhac_lan_cuoi)
  where trang_thai in ('cho_nhan','dang_lam') and nguon_tao = 'tay';

-- === 2. Hàm nhắc ============================================================
create or replace function public.fn_nhac_cong_viec()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_tieu_de text;
  v_noi_dung text;
  v_con_lai int;
begin
  ---------------------------------------------------------------------------
  -- A. NGƯỜI NHẬN: việc được giao mà chưa xong, nhắc theo tần suất của việc.
  ---------------------------------------------------------------------------
  for r in
    with viec as (
      select cv.id, cv.nguoi_nhan, cv.tieu_de, cv.created_at, cv.nhac_lan_cuoi, cv.han_xu_ly,
             coalesce(nullif(cv.tan_suat_nhac, ''),
               case cv.do_uu_tien
                 when 'khan_cap' then 'hang_ngay'
                 when 'cao'      then 'hang_ngay'
                 when 'thap'     then 'hang_tuan'
                 else 'ba_ngay'
               end) as tan_suat,
             (cv.han_xu_ly is not null and cv.han_xu_ly < current_date) as qua_han
      from cong_viec cv
      where cv.trang_thai in ('cho_nhan', 'dang_lam')
        and cv.nguon_tao = 'tay'
        and cv.nguoi_giao <> '00000000-0000-0000-0000-000000000000'::uuid
    ),
    den_ky as (
      select v.*
      from viec v
      where v.tan_suat <> 'khong'
        -- Quá hạn kéo mọi tần suất về hàng ngày (trừ "không nhắc" đã loại ở trên).
        and coalesce(v.nhac_lan_cuoi, v.created_at) <= now() - (
              case
                when v.qua_han                then interval '1 day'
                when v.tan_suat = 'hang_ngay' then interval '1 day'
                when v.tan_suat = 'ba_ngay'   then interval '3 days'
                else                               interval '7 days'
              end)
    )
    select nguoi_nhan,
           count(*)::int as so_viec,
           count(*) filter (where qua_han)::int as so_qua_han,
           array_agg(id) as ids,
           min(id) as id_dau,
           (array_agg(tieu_de order by qua_han desc, han_xu_ly nulls last, created_at))[1:3] as gan_nhat
    from den_ky
    group by nguoi_nhan
  loop
    -- Trần chống phiền: mỗi người tối đa một chuông nhắc việc mỗi ngày. Chạy
    -- tay giữa ngày cũng không bắn thêm chuông thứ hai.
    if exists (
      select 1 from thong_bao tb
      where tb.user_id = r.nguoi_nhan
        and tb.loai = 'nhac_viec'
        and tb.created_at > now() - interval '20 hours'
    ) then
      continue;
    end if;

    if r.so_viec = 1 then
      v_tieu_de := 'Việc chưa xong: ' || r.gan_nhat[1];
    else
      v_tieu_de := 'Bạn còn ' || r.so_viec || ' việc chưa xong'
        || case when r.so_qua_han > 0 then ', ' || r.so_qua_han || ' việc quá hạn' else '' end;
    end if;

    v_con_lai := r.so_viec - least(r.so_viec, 3);
    v_noi_dung :=
      case when r.so_viec = 1 then ''
           else 'Gần nhất: ' || array_to_string(r.gan_nhat, ', ')
                || case when v_con_lai > 0 then ' ... và ' || v_con_lai || ' việc khác.' else '.' end
                || ' '
      end
      || 'Mở Việc của tôi, tab Giao việc để xử lý.';

    insert into thong_bao (user_id, cong_viec_id, loai, tieu_de, noi_dung, is_read)
    values (
      r.nguoi_nhan,
      -- Một việc thì bấm chuông mở thẳng việc đó; nhiều việc thì về danh sách.
      case when r.so_viec = 1 then r.id_dau else null end,
      'nhac_viec', v_tieu_de, v_noi_dung, false
    );

    -- Dời kỳ nhắc kế tiếp của đúng những việc vừa nằm trong chuông.
    update cong_viec set nhac_lan_cuoi = now() where id = any(r.ids);
  end loop;

  ---------------------------------------------------------------------------
  -- B. NGƯỜI GIAO: một chuông tổng mỗi tuần, liệt kê việc mình giao còn treo.
  ---------------------------------------------------------------------------
  for r in
    select cv.nguoi_giao,
           count(*)::int as so_viec,
           count(*) filter (where cv.trang_thai = 'cho_nhan')::int as chua_nhan,
           (array_agg(cv.tieu_de order by cv.created_at))[1:3] as gan_nhat
    from cong_viec cv
    where cv.trang_thai in ('cho_nhan', 'dang_lam')
      and cv.nguon_tao = 'tay'
      and cv.nguoi_giao <> '00000000-0000-0000-0000-000000000000'::uuid
      -- Việc tự giao cho mình đã nằm trong chuông phần A.
      and cv.nguoi_giao <> cv.nguoi_nhan
      -- Người giao đã tắt nhắc thì tắt cả hai chiều.
      and coalesce(nullif(cv.tan_suat_nhac, ''), 'auto') <> 'khong'
      -- Mới giao hôm qua thì chưa vội đi đòi.
      and cv.created_at <= now() - interval '2 days'
    group by cv.nguoi_giao
  loop
    if exists (
      select 1 from thong_bao tb
      where tb.user_id = r.nguoi_giao
        and tb.loai = 'nhac_viec_da_giao'
        and tb.created_at > now() - interval '6 days'
    ) then
      continue;
    end if;

    v_tieu_de := 'Bạn đã giao ' || r.so_viec || ' việc chưa xong'
      || case when r.chua_nhan > 0 then ', ' || r.chua_nhan || ' việc chưa ai bấm nhận' else '' end;

    v_con_lai := r.so_viec - least(r.so_viec, 3);
    v_noi_dung := 'Gần nhất: ' || array_to_string(r.gan_nhat, ', ')
      || case when v_con_lai > 0 then ' ... và ' || v_con_lai || ' việc khác.' else '.' end
      || ' Mở Việc của tôi, tab Giao việc, mục Tôi đã giao để xem và giục.';

    insert into thong_bao (user_id, loai, tieu_de, noi_dung, is_read)
    values (r.nguoi_giao, 'nhac_viec_da_giao', v_tieu_de, v_noi_dung, false);
  end loop;
end;
$function$;

-- Chỉ cron được chạy: hàm này ghi thong_bao cho NGƯỜI KHÁC, không phải thứ để
-- tài khoản đăng nhập gọi tay.
revoke all on function public.fn_nhac_cong_viec() from public;
revoke all on function public.fn_nhac_cong_viec() from anon;
revoke all on function public.fn_nhac_cong_viec() from authenticated;

-- === 3. Cron: 9h15 sáng giờ Việt Nam (DB chạy UTC) ==========================
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'nhac_cong_viec_daily') then
    perform cron.unschedule('nhac_cong_viec_daily');
  end if;
  perform cron.schedule('nhac_cong_viec_daily', '15 2 * * *', 'select public.fn_nhac_cong_viec();');
end
$do$;
