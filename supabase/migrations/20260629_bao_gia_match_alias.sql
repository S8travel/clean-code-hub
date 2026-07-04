-- Bộ nhớ khớp tự học cho AI báo giá: ghi nhớ ánh xạ "text lịch trình → dòng
-- danh mục + giá" mỗi lần OP sửa/áp dụng → lần sau tự khớp các từ lặp lại
-- (玻璃桥, set menu, ...). Từ điển CHUNG cả công ty (không scope theo VP/người).

CREATE TABLE public.bao_gia_match_alias (
  id bigserial PRIMARY KEY,
  text_key text NOT NULL,            -- key đã chuẩn hoá (lowercase, bỏ dấu, bỏ token giá USD)
  loai text NOT NULL,                -- 'hotel'|'meal'|'ticket'|'transport'
  match_table text,                  -- 'khach_san'|'nha_hang'|'canh_diem'|'nha_xe_loai_xe' | null
  target_id bigint,                  -- id trong match_table | null (alias chỉ-giá)
  set_menu_id bigint,                -- set menu cho nha_hang | null
  ten_hien_thi text,                 -- tên fill vào mo_ta
  gia_override numeric,              -- giá học được (VND) | null (lấy giá catalog)
  lan_dung integer NOT NULL DEFAULT 1,
  tao_boi uuid,
  tao_luc timestamptz NOT NULL DEFAULT now(),
  cap_nhat_luc timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bao_gia_match_alias_key_uidx
  ON public.bao_gia_match_alias (text_key, loai);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bao_gia_match_alias TO authenticated, service_role;
GRANT SELECT ON public.bao_gia_match_alias TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.bao_gia_match_alias_id_seq TO authenticated, service_role;

ALTER TABLE public.bao_gia_match_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.bao_gia_match_alias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
      (text_key, loai, match_table, target_id, set_menu_id, ten_hien_thi, gia_override, tao_boi)
    VALUES (
      it->>'text_key', it->>'loai', NULLIF(it->>'match_table',''),
      NULLIF(it->>'target_id','')::bigint, NULLIF(it->>'set_menu_id','')::bigint,
      NULLIF(it->>'ten_hien_thi',''), NULLIF(it->>'gia_override','')::numeric,
      NULLIF(it->>'tao_boi','')::uuid
    )
    ON CONFLICT (text_key, loai) DO UPDATE SET
      match_table  = COALESCE(EXCLUDED.match_table,  public.bao_gia_match_alias.match_table),
      target_id    = COALESCE(EXCLUDED.target_id,    public.bao_gia_match_alias.target_id),
      set_menu_id  = COALESCE(EXCLUDED.set_menu_id,  public.bao_gia_match_alias.set_menu_id),
      ten_hien_thi = COALESCE(EXCLUDED.ten_hien_thi, public.bao_gia_match_alias.ten_hien_thi),
      gia_override = COALESCE(EXCLUDED.gia_override, public.bao_gia_match_alias.gia_override),
      lan_dung     = public.bao_gia_match_alias.lan_dung + 1,
      cap_nhat_luc = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.learn_bao_gia_aliases(jsonb) TO authenticated, service_role;
