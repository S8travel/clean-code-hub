-- Mỗi người tự chọn nhóm thông báo muốn nhận.
--
-- Bối cảnh: chuông đã thành nhiễu. Có tài khoản nhận gần 300 thông báo trong 30
-- ngày mà chưa đọc cái nào, phần lớn là "Đoàn mới" — thứ họ không phụ trách.
-- Chuông không ai đọc thì chuông thật cũng chìm theo.
--
-- Cách chặn: lọc NGAY TRƯỚC KHI GHI (BEFORE INSERT). Dòng không được ghi thì
-- trigger đẩy điện thoại (AFTER INSERT) cũng không chạy, nên tắt là im cả hai
-- kênh. Lọc ở tầng đọc thì dòng vẫn ghi và điện thoại vẫn kêu.

-- === 1. Cột cấu hình =========================================================
-- Lưu danh sách nhóm BỊ TẮT, không phải nhóm được bật: thêm loại thông báo mới
-- sau này thì mọi người tự động nhận, không ai im lặng vì cấu hình cũ thiếu.
alter table public.user_roles
  add column if not exists thong_bao_tat text[] not null default '{}';

comment on column public.user_roles.thong_bao_tat is
  'Cac nhom thong bao nguoi nay KHONG nhan (cong_viec, doan, lead, bao_gia, ke_toan). Mang rong = nhan tat ca.';

-- === 2. Loại thông báo thuộc nhóm nào =======================================
-- NGUỒN DUY NHẤT của luật phân nhóm. Màn hình chỉ hiện tên nhóm, không tự map.
-- Loại KHÔNG thuộc nhóm nào (NULL) thì luôn được gửi — cố ý, để cảnh báo hệ
-- thống như canh_bao_cron_that_bai không ai tắt nhầm được.
create or replace function public.fn_nhom_thong_bao(p_loai text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_loai in ('giao_viec','cap_nhat_viec','comment_viec',
                    'nhac_viec','nhac_viec_tay','nhac_viec_da_giao') then 'cong_viec'
    when p_loai like 'deadline%'                                     then 'doan'
    when p_loai in ('thong_tin_doan','su_co','gia')                  then 'doan'
    -- lead_yeu_cau_doi_tac KHÔNG thuộc nhóm lead: đó là đối tác gửi yêu cầu báo
    -- giá, người nhận phải xử lý. Xếp nhầm vào lead là tắt lead xong mất luôn nó.
    when p_loai = 'lead_yeu_cau_doi_tac'                             then 'bao_gia'
    when p_loai in ('bao_gia_yeu_cau_sua','trao_doi_doi_tac')        then 'bao_gia'
    when p_loai like 'lead_%'                                        then 'lead'
    when p_loai = 'dntt_can_duyet'                                   then 'ke_toan'
    else null
  end;
$function$;

-- === 3. Chặn trước khi ghi ===================================================
create or replace function public.fn_thong_bao_loc_theo_nguoi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nhom text;
begin
  v_nhom := public.fn_nhom_thong_bao(new.loai);
  -- Loại chưa xếp nhóm thì luôn gửi.
  if v_nhom is null then
    return new;
  end if;

  if exists (
    select 1 from user_roles ur
    where ur.user_id = new.user_id
      and v_nhom = any(ur.thong_bao_tat)
  ) then
    -- Bỏ hẳn dòng này: không ghi chuông, không bắn thông báo điện thoại.
    return null;
  end if;

  return new;
end;
$function$;

-- BEFORE INSERT nên phải chạy TRƯỚC tr_thong_bao_push (AFTER INSERT).
-- Đã kiểm: không nguồn nào INSERT thong_bao kèm RETURNING, nên trả NULL ở đây
-- không làm hỏng lời gọi nào.
drop trigger if exists tr_thong_bao_loc on public.thong_bao;
create trigger tr_thong_bao_loc
  before insert on public.thong_bao
  for each row execute function public.fn_thong_bao_loc_theo_nguoi();
