-- ⚠️ FILE BÙ SỔ — chép NGUYÊN VĂN từ bản đã chạy trên prod, không phải viết mới.
--    Phiên bản trên prod: 20260817020149   (4/9 trong chuỗi migration cổng đối tác)
--    Bù vào repo 31/08/2026: thư mục migrations thiếu file này, nên người sau
--    lấy nhầm bản cũ trong repo làm nền cho CREATE OR REPLACE và xoá mất việc
--    của người trước. Xem PR mô tả sự cố.
-- ─── nguyên văn ───
CREATE OR REPLACE FUNCTION public.portal_lam_sach_ten(p_ten text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(trim(b6), '') FROM
    (SELECT regexp_replace(b5, '\s+\)', ')', 'g') AS b6 FROM
      (SELECT regexp_replace(b4, '\(\s+', '(', 'g') AS b5 FROM
        (SELECT regexp_replace(b3, '\s{2,}', ' ', 'g') AS b4 FROM
          (SELECT regexp_replace(b2, '\(\s*[-–/,.:;]*\s*\)', '', 'g') AS b3 FROM
            (SELECT regexp_replace(b1, '\m[0-9]{5,}\M', '', 'g') AS b2 FROM
              (SELECT regexp_replace(b0, '\m[0-9]{1,3}([.,][0-9]{3})+\M', '', 'g') AS b1 FROM
                (SELECT regexp_replace(coalesce(p_ten, ''),
                        '[0-9][0-9.,]*\s*(k|K|đ|Đ|vnd|VND|VNĐ)\M(\s*/\s*[^)\s]+)?', '', 'g') AS b0
                ) t0
              ) t1
            ) t2
          ) t3
        ) t4
      ) t5
    ) t6;
$$;
