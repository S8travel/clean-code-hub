-- Bucket dntt-documents (public) trước chỉ cho ảnh + pdf → upload báo giá /
-- hợp đồng / danh sách khách dạng Word/Excel bị chặn:
--   "mime type application/vnd.openxmlformats-officedocument.wordprocessingml
--    .document is not supported"
-- Mở rộng allowed_mime_types thêm Word/Excel (giữ nguyên ảnh + pdf — vẫn dùng
-- cho UNC & ảnh inline email). Áp trực tiếp lên storage.buckets.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id = 'dntt-documents';
