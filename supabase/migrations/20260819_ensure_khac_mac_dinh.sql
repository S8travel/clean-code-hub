-- Seed các khoản "Khác" mặc định (Tip lái xe + 7 khoản chuẩn) cho 1 đoàn — IDEMPOTENT.
--
-- Bug đã xảy ra (đoàn 578 seed 2 lần cách 32 giây → x2 cả 8 dòng; đoàn 683 x2 "Tip lái xe"):
-- client tự SELECT danh sách rồi INSERT từng dòng còn thiếu. Query đọc chi phí KHÔNG check
-- error → supabase-js trả data = null khi lỗi/timeout → danh sách rỗng-GIẢ → client tưởng
-- đoàn chưa có khoản nào và insert lại toàn bộ.
--
-- Đưa phần "thiếu thì thêm" xuống DB trong MỘT câu lệnh: NOT EXISTS đọc trực tiếp bảng thật
-- nên không phụ thuộc cache/kết quả đọc của client. Advisory lock theo đoàn để hai tab (hoặc
-- hai lần chạy song song) nối đuôi nhau, phiên sau nhìn thấy dòng phiên trước vừa chèn.
--
-- Danh sách tên KHÔNG hardcode trong hàm: nguồn sự thật là DEFAULT_KHAC_MO_TAS /
-- SYSTEM_KHAC_ORDER ở src/components/chi-phi/hdv-shared.ts, truyền xuống qua p_mo_tas —
-- tránh 2 nơi cùng giữ danh sách rồi lệch nhau.
--
-- SECURITY INVOKER: chạy bằng quyền người gọi → RLS của doan_chi_phi (gồm policy chặn
-- tài khoản chỉ xem) vẫn áp dụng nguyên vẹn, không cần guard is_tk_chi_xem() thủ công.
create or replace function public.ensure_khac_mac_dinh(
  p_doan_id bigint,
  p_mo_tas  text[]
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if p_doan_id is null or p_mo_tas is null or array_length(p_mo_tas, 1) is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('ensure_khac_mac_dinh'), p_doan_id::int);

  insert into public.doan_chi_phi
    (doan_id, danh_muc, loai, mo_ta, so_luong, don_gia, tien_cong_ty, tien_hdv)
  select p_doan_id, 'hdv_ho_tro', 'khac', x.ten, 1, 0, 0, 0
  from (select distinct btrim(t) as ten from unnest(p_mo_tas) as t) x
  where x.ten <> ''
    and not exists (
      select 1
      from public.doan_chi_phi cp
      where cp.doan_id = p_doan_id
        and cp.danh_muc = 'hdv_ho_tro'
        and btrim(cp.mo_ta) = x.ten
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.ensure_khac_mac_dinh(bigint, text[]) to authenticated, service_role;
