-- Bộ nhớ khớp báo giá: phân biệt alias do NGƯỜI SỬA TAY với alias học thụ động.
--
-- Trước: alias chỉ được dùng khi AI khớp KHÔNG chắc (confidence < 0.6). Đúng ca
-- khó chịu nhất — AI khớp/dịch SAI một cách tự tin — thì OP sửa tay bao nhiêu lần
-- cũng vô ích, lần sau nó vẫn khớp sai y hệt.
--
-- Sau: dòng nào OP thật sự động tay trong màn review (chọn lại danh mục, gõ tên,
-- sửa giá, đổi loại, tự thêm) → alias mang cờ sua_tay và được quyền THẮNG cả khi
-- AI khớp chắc. Alias học thụ động (dòng chỉ trôi qua một lần Áp dụng, không ai
-- sửa) vẫn nhường AI như cũ — nó chỉ là "đã từng dùng", không phải người dạy.
--
-- ALTER TABLE trên bảng có sẵn → giữ nguyên GRANT + RLS, không cần cấp lại.

ALTER TABLE public.bao_gia_match_alias
  ADD COLUMN IF NOT EXISTS sua_tay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bao_gia_match_alias.sua_tay IS
  'TRUE = do OP sửa tay trong màn review AI (không phải học thụ động) → ưu tiên hơn cả AI khớp chắc';

-- Học alias hàng loạt: upsert + tăng lần dùng. COALESCE để KHÔNG xoá kiến thức
-- cũ khi lần này thiếu (vd lần này chỉ có giá, giữ catalog ref đã học trước).
CREATE OR REPLACE FUNCTION public.learn_bao_gia_aliases(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE it jsonb;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(items) LOOP
    INSERT INTO public.bao_gia_match_alias
      (text_key, loai, match_table, target_id, set_menu_id, ten_hien_thi, gia_override, tao_boi, sua_tay)
    VALUES (
      it->>'text_key', it->>'loai', NULLIF(it->>'match_table',''),
      NULLIF(it->>'target_id','')::bigint, NULLIF(it->>'set_menu_id','')::bigint,
      NULLIF(it->>'ten_hien_thi',''), NULLIF(it->>'gia_override','')::numeric,
      NULLIF(it->>'tao_boi','')::uuid,
      COALESCE((it->>'sua_tay')::boolean, false)
    )
    ON CONFLICT (text_key, loai) DO UPDATE SET
      match_table  = COALESCE(EXCLUDED.match_table,  public.bao_gia_match_alias.match_table),
      target_id    = COALESCE(EXCLUDED.target_id,    public.bao_gia_match_alias.target_id),
      set_menu_id  = COALESCE(EXCLUDED.set_menu_id,  public.bao_gia_match_alias.set_menu_id),
      ten_hien_thi = COALESCE(EXCLUDED.ten_hien_thi, public.bao_gia_match_alias.ten_hien_thi),
      gia_override = COALESCE(EXCLUDED.gia_override, public.bao_gia_match_alias.gia_override),
      -- Chỉ NÂNG lên true, không bao giờ hạ: đã có người dạy thì lần sau OP để
      -- nguyên (= đồng ý) không được làm alias mất quyền ưu tiên.
      sua_tay      = public.bao_gia_match_alias.sua_tay OR EXCLUDED.sua_tay,
      lan_dung     = public.bao_gia_match_alias.lan_dung + 1,
      cap_nhat_luc = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.learn_bao_gia_aliases(jsonb) TO authenticated, service_role;
