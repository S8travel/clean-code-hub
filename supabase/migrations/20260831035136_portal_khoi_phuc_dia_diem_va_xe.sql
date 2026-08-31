-- Khôi phục 2 khối 'dia_diem' và 'xe' bị migration 20260818094118 (hdv_ten_zh)
-- ghi đè mất. Nguyên nhân: bản đó lấy 20260814_portal_doi_tac.sql trong repo làm
-- nền, mà bản repo cũ hơn prod (thiếu 20260818013228). Cổng đối tác mất ô địa
-- điểm + ô loại xe từ 18/08.
--
-- Thân hàm dưới đây = bản đang chạy trên prod + 2 khối khôi phục. Ai sửa lần
-- sau: lấy nền bằng pg_get_functiondef trên DB thật, ĐỪNG copy từ file migration
-- cũ trong repo.
--
-- ĐÃ APPLY LÊN PROD 31/08/2026 (version 20260831035136).
CREATE OR REPLACE FUNCTION public.build_portal_doan_noi_dung(p_doan_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'version',        1,
    'ma_doan',        d.ten_doan,
    'ngay_di',        d.ngay_di,
    'ngay_ve',        d.ngay_ve,
    'so_khach',       d.so_khach,
    'dia_diem',       (SELECT dd.ten FROM dia_diem dd WHERE dd.id = d.dia_diem_id),
    'truong_doan',    d.truong_doan,
    'chuyen_bay_den', d.chuyen_bay_don,
    'chuyen_bay_di',  d.chuyen_bay_tien,
    -- Chỉ loại xe + số chỗ. KHÔNG đẩy tên nhà xe, KHÔNG đẩy giá.
    'xe', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('ten_xe', x.ten_xe, 'so_cho', x.so_cho)
                                ORDER BY x.thu_tu), '[]'::jsonb)
      FROM (
        SELECT 1 AS thu_tu, lx.ten_xe, lx.so_cho FROM nha_xe_loai_xe lx WHERE lx.id = d.xe_id
        UNION ALL
        SELECT 2, lx.ten_xe, lx.so_cho FROM nha_xe_loai_xe lx WHERE lx.id = d.xe_id_2
      ) x
    ),
    'hdv', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'ten', h.ten,
               -- Tên tiếng Trung để RIÊNG chứ không ghi đè 'ten': cổng hiện cả
               -- hai. Khách cầm tờ giấy tiếng Trung ra sân bay mà thẻ HDV ghi
               -- tên tiếng Việt thì không đối chiếu được với nhau.
               'ten_zh', NULLIF(h.ten_zh, ''),
               'so_dien_thoai', h.so_dien_thoai)), '[]'::jsonb)
      FROM huong_dan_vien h
      WHERE h.id IN (d.huong_dan_vien_id, d.huong_dan_vien_id_2)
    ),
    'ngay', (
      SELECT coalesce(jsonb_agg(s.noi_dung ORDER BY s.ngay_so), '[]'::jsonb)
      FROM (
        SELECT dn.ngay_so, jsonb_build_object(
          'ngay_so',   dn.ngay_so,
          'ngay_date', dn.ngay_date,
          'thu',       dn.thu,
          'thanh_pho', dn.thanh_pho,
          'khach_san', (SELECT portal_lam_sach_ten(coalesce(NULLIF(ks.ten_zh, ''), ks.ten))
                        FROM khach_san ks WHERE ks.id = dn.khach_san_id),
          'an_trua',   (SELECT portal_lam_sach_ten(coalesce(NULLIF(nh.ten_zh, ''), nh.ten))
                        FROM nha_hang nh WHERE nh.id = dn.an_trua_nha_hang_id),
          'an_toi',    (SELECT portal_lam_sach_ten(coalesce(NULLIF(nh.ten_zh, ''), nh.ten))
                        FROM nha_hang nh WHERE nh.id = dn.an_toi_nha_hang_id),
          'canh_diem', (
            SELECT coalesce(jsonb_agg(x.ten ORDER BY x.thu_tu, x.id), '[]'::jsonb)
            FROM (
              SELECT it.id, it.thu_tu,
                     portal_lam_sach_ten(coalesce(zh.text_key, cd.ten)) AS ten
              FROM doan_ngay_item it
              JOIN canh_diem cd ON cd.id = it.canh_diem_id
              LEFT JOIN LATERAL (
                SELECT a.text_key FROM bao_gia_match_alias a
                WHERE a.match_table = 'canh_diem'
                  AND a.target_id = cd.id
                  AND a.text_key ~ '[一-鿿]'
                ORDER BY a.lan_dung DESC NULLS LAST, a.id
                LIMIT 1
              ) zh ON true
              WHERE it.doan_ngay_id = dn.id
            ) x
            WHERE x.ten IS NOT NULL
          )
        ) AS noi_dung
        FROM doan_ngay dn
        WHERE dn.doan_id = d.id
      ) s
    )
  )
  FROM doan d
  WHERE d.id = p_doan_id;
$$;

GRANT EXECUTE ON FUNCTION public.build_portal_doan_noi_dung(bigint) TO authenticated, service_role;
