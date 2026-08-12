-- Ngừng nhắc việc CHUẨN BỊ tour cho đoàn đã về.
--
-- Bối cảnh: đoàn đi xong từ lâu mà booking chưa xác nhận / chưa phân người thì
-- không còn gì để đuổi NCC nữa, nhưng 2 cron dưới đây vẫn bắn thông báo — trong
-- đó fn_remind_pv_phancong nhắc LẶP LẠI mỗi ngày, không bao giờ dừng. Kết quả là
-- OP/GĐ nhờn thông báo, cảnh báo thật bị chìm.
--
-- CHỈ chặn việc chuẩn bị (booking, phân người). KHÔNG đụng:
--   - cong_viec loai_viec = 'thanh_toan' (trả tiền NCC sau tour là bình thường)
--   - thông báo ĐNTT cần duyệt (tiền vẫn phải xử lý sau khi đoàn về)
--
-- ngay_ve NULL → KHÔNG đoán, giữ nguyên hành vi nhắc như cũ.
-- Ngày về = hôm nay vẫn nhắc; chỉ tắt từ hôm sau.

-- ── 1. Nhắc phân người: bỏ qua đoàn đã về ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_remind_pv_phancong()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into thong_bao (user_id, cong_viec_id, doan_id, doan_ten, loai, tieu_de, noi_dung, is_read)
  select cv.nguoi_nhan, cv.id, cv.doan_id,
         d.ten_doan,
         'giao_viec',
         'Nhắc lại: Đoàn ' || coalesce(d.ten_doan, ('#' || cv.doan_id)) || ' vẫn cần phân người',
         coalesce(cv.mo_ta, 'Vui lòng phân người phụ trách.'),
         false
  from cong_viec cv
  left join doan d on d.id = cv.doan_id
  where cv.loai_viec = 'pv_phancong'
    and cv.trang_thai in ('cho_nhan', 'dang_lam')
    and now() - coalesce(cv.updated_at, cv.created_at) >= interval '1 day'
    -- Đoàn đã về: phân người lúc này cũng chẳng để làm gì nữa.
    and (d.ngay_ve is null or d.ngay_ve >= current_date);

  -- Chỉ đẩy updated_at cho đúng những việc VỪA nhắc ở trên. Nếu update cả đoàn đã
  -- về thì mốc nhắc của chúng bị dời tới, ngày mai bật lại là nhắc ngay lập tức.
  update cong_viec cv
  set updated_at = now()
  from doan d
  where d.id = cv.doan_id
    and cv.loai_viec = 'pv_phancong'
    and cv.trang_thai in ('cho_nhan', 'dang_lam')
    and now() - coalesce(cv.updated_at, cv.created_at) >= interval '1 day'
    and (d.ngay_ve is null or d.ngay_ve >= current_date);
end;
$function$;

-- ── 2. Escalate booking KS/NH lên GĐ: bỏ qua đoàn đã về ──────────────────
CREATE OR REPLACE FUNCTION public.fn_doan_booking_escalation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_xuan uuid := '882d2911-5084-479c-a452-45b226045c6e'; -- GĐ điều hành
  v_hai  uuid := 'fdb4a54c-07f1-479b-b6de-17488b8ff1af';
  v_dung uuid := 'afe29310-5825-4c90-ae0a-d7be38b44829';
  r record;
  ks_total int; ks_final_cnt int; ks_pending int;
  nh_total int; nh_ok int; nh_pending int;
  age_days int; days_to_go int;
  ks_done boolean; nh_done boolean;
  v_title text; v_body text; v_uid uuid;
  v_recips uuid[];
begin
  for r in
    select id, ten_doan, created_at, ngay_di, ks_escalate_level, nh_escalate_level
    from doan
    where trang_thai is distinct from 'huy'
      -- Đoàn đã về: booking KS/NH không còn gì để đuổi, đừng báo GĐ nữa.
      and (ngay_ve is null or ngay_ve >= current_date)
  loop
    age_days := (current_date - (r.created_at)::date);

    select count(*),
           count(*) filter (where ks_final_status = 'ks_xac_nhan_final'),
           count(*) filter (where ks_final_status not in ('ks_xac_nhan_final','ks_xac_nhan_huy'))
      into ks_total, ks_final_cnt, ks_pending
    from doan_booking_ks where doan_id = r.id;

    select count(*),
           count(*) filter (where booking_status in ('nh_xac_nhan','khong_dat'))
      into nh_total, nh_ok
    from doan_booking_nh where doan_id = r.id;
    nh_pending := coalesce(nh_total,0) - coalesce(nh_ok,0);

    ks_done := (coalesce(ks_total,0) = 0) or (coalesce(ks_pending,0) = 0);
    nh_done := (coalesce(nh_total,0) = 0) or (coalesce(nh_pending,0) = 0);

    v_body := 'Tạo ' || to_char(r.created_at,'DD/MM/YYYY')
      || '. KS final ' || coalesce(ks_final_cnt,0) || '/' || coalesce(ks_total,0)
      || ', NH xác nhận ' || coalesce(nh_ok,0) || '/' || coalesce(nh_total,0)
      || '. Còn KS ' || coalesce(ks_pending,0) || ', NH ' || coalesce(nh_pending,0) || ' booking chưa xong.';

    -- ===== KS: 3 ngày → GĐ; 7 ngày → +2 người (cộng dồn) =====
    if not ks_done and coalesce(ks_total,0) > 0 then
      if age_days >= 7 and r.ks_escalate_level < 2 then
        v_recips := array[v_xuan, v_hai, v_dung];
        v_title := 'Đoàn ' || r.ten_doan || ': KS chưa final sau ' || age_days || ' ngày — cần hỗ trợ';
        foreach v_uid in array v_recips loop
          insert into thong_bao(user_id, doan_id, doan_ten, loai, tieu_de, noi_dung, is_read)
          values (v_uid, r.id, r.ten_doan, 'thong_tin_doan', v_title, v_body, false);
        end loop;
        update doan set ks_escalate_level = 2 where id = r.id;
      elsif age_days >= 3 and r.ks_escalate_level < 1 then
        v_title := 'Đoàn ' || r.ten_doan || ': KS chưa final sau ' || age_days || ' ngày';
        insert into thong_bao(user_id, doan_id, doan_ten, loai, tieu_de, noi_dung, is_read)
        values (v_xuan, r.id, r.ten_doan, 'thong_tin_doan', v_title, v_body, false);
        update doan set ks_escalate_level = 1 where id = r.id;
      end if;
    elsif ks_done and r.ks_escalate_level <> 0 then
      update doan set ks_escalate_level = 0 where id = r.id;
    end if;

    -- ===== NH: 7 ngày → GĐ; 15 ngày → +2 người =====
    if not nh_done and coalesce(nh_total,0) > 0 then
      if age_days >= 15 and r.nh_escalate_level < 2 then
        v_recips := array[v_xuan, v_hai, v_dung];
        v_title := 'Đoàn ' || r.ten_doan || ': NH chưa xong sau ' || age_days || ' ngày — cần hỗ trợ';
        foreach v_uid in array v_recips loop
          insert into thong_bao(user_id, doan_id, doan_ten, loai, tieu_de, noi_dung, is_read)
          values (v_uid, r.id, r.ten_doan, 'thong_tin_doan', v_title, v_body, false);
        end loop;
        update doan set nh_escalate_level = 2 where id = r.id;
      elsif age_days >= 7 and r.nh_escalate_level < 1 then
        v_title := 'Đoàn ' || r.ten_doan || ': NH chưa xong sau ' || age_days || ' ngày';
        insert into thong_bao(user_id, doan_id, doan_ten, loai, tieu_de, noi_dung, is_read)
        values (v_xuan, r.id, r.ten_doan, 'thong_tin_doan', v_title, v_body, false);
        update doan set nh_escalate_level = 1 where id = r.id;
      end if;
    elsif nh_done and r.nh_escalate_level <> 0 then
      update doan set nh_escalate_level = 0 where id = r.id;
    end if;

    -- ===== Trước khởi hành ≤7 ngày: ép ưu tiên (≤2 ngày → khẩn cấp) =====
    if r.ngay_di is not null then
      days_to_go := ((r.ngay_di)::date - current_date);
      if days_to_go between 0 and 7 then
        if exists (select 1 from doan_booking_ks
                   where doan_id = r.id and ks_final_status <> 'ks_xac_nhan_final') then
          update cong_viec
          set do_uu_tien = (case when days_to_go <= 2 then 'khan_cap' else 'cao' end),
              updated_at = now()
          where doan_id = r.id and loai_viec = 'pv_ks'
            and trang_thai in ('cho_nhan','dang_lam')
            and do_uu_tien is distinct from (case when days_to_go <= 2 then 'khan_cap' else 'cao' end);
        end if;
        if exists (select 1 from doan_booking_nh
                   where doan_id = r.id and booking_status not in ('nh_xac_nhan','khong_dat')) then
          update cong_viec
          set do_uu_tien = (case when days_to_go <= 2 then 'khan_cap' else 'cao' end),
              updated_at = now()
          where doan_id = r.id and loai_viec = 'pv_nh_dv'
            and trang_thai in ('cho_nhan','dang_lam')
            and do_uu_tien is distinct from (case when days_to_go <= 2 then 'khan_cap' else 'cao' end);
        end if;
      end if;
    end if;

  end loop;
end;
$function$;
