-- Cron nhắc phân người CHẾT ÂM THẦM từ 23/05/2026 — vá lỗi + đổi cách nhắc.
--
-- Triệu chứng: job `remind_pv_phancong_daily` fail 100% mỗi ngày suốt 3,5 tháng.
-- Lỗi: `null value in column "tieu_de" of relation "thong_bao" violates not-null
-- constraint`. Hệ quả: 211 đầu việc đang mở KHÔNG được nhắc lần nào, kể cả những
-- việc hoàn toàn hợp lệ — vì INSERT hỏng 1 dòng là abort cả hàm.
--
-- Nguyên nhân gốc: `cong_viec_doan_id_fkey` là ON DELETE SET NULL. Xoá một đoàn
-- để lại việc MỒ CÔI (doan_id NULL) vẫn ở trạng thái cho_nhan. Khi đó:
--     'Nhắc lại: Đoàn ' || coalesce(d.ten_doan, ('#' || cv.doan_id)) || ' ...'
--   → '#' || NULL = NULL → coalesce(NULL, NULL) = NULL → cả chuỗi NULL.
--
-- Sửa 3 điểm:
--   1. INNER JOIN doan (thay LEFT JOIN) → việc mồ côi bị loại hẳn. Đoàn đã bị xoá
--      thì không còn gì để phân người nữa.
--   2. Nhắc GỘP: mỗi người MỘT thông báo/ngày ("Còn 49 đoàn chưa phân người —
--      gần nhất: ...") thay vì mỗi đoàn một chuông. Thiết kế cũ dồn 70 thông báo/
--      ngày vào đúng một người điều phối → nhờn chuông, cảnh báo thật bị chìm.
--   3. Không đẩy `updated_at` nữa. Cách gộp chỉ cần chống trùng trong ngày (NOT
--      EXISTS 20h bên dưới), không cần dời mốc từng việc — và dời mốc chính là chỗ
--      dễ sai đã phải vá ở 20260812_ngung_nhac_doan_da_ve.sql.
--
-- Việc pv_phancong nào được coi là "còn thiếu người" thì do tầng app quyết
-- (src/lib/phan-viec-muc.ts): tour inbound không đòi Visa/Vé máy bay. Hàm này chỉ
-- đọc các việc đang mở, không tự suy luận lại.

CREATE OR REPLACE FUNCTION public.fn_remind_pv_phancong()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_tieu_de text;
  v_noi_dung text;
begin
  for r in
    select cv.nguoi_nhan,
           count(*) as so_doan,
           (array_agg(
              coalesce(d.ten_doan, '#' || d.id::text)
              || coalesce(' (' || to_char(d.ngay_di, 'DD/MM') || ')', '')
              order by d.ngay_di nulls last
            ))[1:3] as gan_nhat
    from cong_viec cv
    -- INNER JOIN: việc mồ côi (đoàn đã xoá) không nhắc.
    join doan d on d.id = cv.doan_id
    where cv.loai_viec = 'pv_phancong'
      and cv.trang_thai in ('cho_nhan', 'dang_lam')
      -- Đoàn vừa tạo hôm nay chưa nhắc ngay, cho người ta kịp phân.
      and now() - coalesce(cv.updated_at, cv.created_at) >= interval '1 day'
      -- Đoàn đã về: phân người lúc này cũng chẳng để làm gì nữa.
      and (d.ngay_ve is null or d.ngay_ve >= current_date)
    group by cv.nguoi_nhan
  loop
    v_tieu_de := 'Còn ' || r.so_doan || ' đoàn chưa phân người phụ trách';
    v_noi_dung := 'Gần nhất: ' || array_to_string(r.gan_nhat, ', ')
      || case when r.so_doan > 3
              then ' … và ' || (r.so_doan - 3) || ' đoàn khác.'
              else '.' end
      || ' Mở Việc của tôi → đầu việc "Phân công người phụ trách" để phân.';

    insert into thong_bao (user_id, loai, tieu_de, noi_dung, is_read)
    select r.nguoi_nhan, 'giao_viec', v_tieu_de, v_noi_dung, false
    -- Chống trùng: chạy tay giữa ngày cũng không bắn thêm chuông thứ hai.
    where not exists (
      select 1 from thong_bao tb
      where tb.user_id = r.nguoi_nhan
        and tb.loai = 'giao_viec'
        and tb.tieu_de like 'Còn % đoàn chưa phân người phụ trách'
        and tb.created_at > now() - interval '20 hours'
    );
  end loop;
end;
$function$;
