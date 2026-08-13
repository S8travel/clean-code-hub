-- Chuẩn bị khoá bucket chứng từ (BƯỚC 1/2 — phần AN TOÀN, chạy trước khi deploy code).
--
-- Mục tiêu: chứng từ nhà cung cấp và tài liệu đoàn chỉ người đã đăng nhập mới
-- đọc được, thay vì mở theo đường dẫn.
--
-- BƯỚC 1 (file này) — chỉ THÊM, không lấy đi quyền gì, chạy lúc nào cũng an toàn:
--   a) Tạo bucket `email-images` (public) cho ảnh nhúng mail. Ảnh nhúng trong mail
--      ĐÃ GỬI cho nhà cung cấp không ký lại được — link ký hết hạn là mail hỏng ảnh
--      — nên loại ảnh này phải ở một bucket public riêng, tách khỏi chứng từ.
--   b) Thêm policy SELECT trên storage.objects cho 2 bucket chứng từ.
--      QUAN TRỌNG: thiếu policy SELECT thì createSignedUrl fail → KHÔNG AI mở
--      được chứng từ. Phải có policy này TRƯỚC khi sang bước 2.
--
-- BƯỚC 2 (làm SAU khi code ký link đã lên production) — mới thực sự đóng lỗ:
--   update storage.buckets set public = false where id in ('dntt-documents','doan-files');
--   Đảo ngược được: set lại public = true là xong.

-- ── a) Bucket ảnh nhúng mail ────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-images', 'email-images', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "email_images_auth_insert" on storage.objects;
create policy "email_images_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-images');

drop policy if exists "email_images_auth_update" on storage.objects;
create policy "email_images_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'email-images');

-- ── b) Cho phép người đã đăng nhập ĐỌC (→ ký được link tạm) 2 bucket chứng từ ──
-- Chỉ authenticated. anon KHÔNG có policy nào ở đây, nên sau bước 2 người ngoài
-- mất sạch đường vào — đó chính là mục đích.
drop policy if exists "chung_tu_auth_select" on storage.objects;
create policy "chung_tu_auth_select" on storage.objects
  for select to authenticated
  using (bucket_id in ('dntt-documents', 'doan-files'));
