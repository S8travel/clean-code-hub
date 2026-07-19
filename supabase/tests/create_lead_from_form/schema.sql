-- Schema tối thiểu để test public.create_lead_from_form trên Postgres thuần.
-- CHỈ gồm cột mà hàm đọc/ghi — không phải bản sao schema production.

-- Role Supabase — Postgres thuần không có sẵn. Cần tạo để câu `GRANT EXECUTE
-- ... TO anon, authenticated, service_role` cuối migration chạy được, nhờ đó
-- test nạp migration nguyên bản thay vì phải copy hàm ra (single source of truth).
DO $$ BEGIN CREATE ROLE anon;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE lead (
  id                    bigserial PRIMARY KEY,
  ho_ten                text,
  so_dien_thoai         text,
  email                 text,
  nguon                 text,
  loai_tour             text,
  so_nguoi_lon          integer,
  so_nguoi_em           integer,
  ngay_di_du_kien       date,
  ngay_ve_du_kien       date,
  ngan_sach_per_khach   bigint,
  yeu_cau_dac_biet      text,
  ghi_chu               text,
  assigned_to           uuid,
  trang_thai            text,
  khach_hang_id         bigint,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_diem_den (
  id       bigserial PRIMARY KEY,
  lead_id  bigint NOT NULL,
  diem_den text
);

CREATE TABLE lead_activity (
  id       bigserial PRIMARY KEY,
  lead_id  bigint NOT NULL,
  loai     text,
  noi_dung text
);

CREATE TABLE user_roles (
  id              bigserial PRIMARY KEY,
  user_id         uuid,
  bo_phan         text,
  active          boolean DEFAULT true,
  phan_loai_tour  text[]
);

CREATE TABLE khach_hang (
  id            bigserial PRIMARY KEY,
  ho_ten        text,
  so_dien_thoai text,
  email         text,
  nguon_dau     text
);

-- STUB — không phải hàm thật.
--
-- find_or_create_khach_hang thật (20260622_khach_hang_phase1.sql:91) làm dedup
-- theo sdt_norm và gọi auth.uid(); cả hai đều nằm ngoài phạm vi test này. Bản
-- test chỉ kiểm chứng phần create_lead_from_form chịu trách nhiệm: cap độ dài
-- và rate-limit. Stub vẫn INSERT để test bắt được nếu giá trị truyền xuống
-- CHƯA bị cap.
CREATE FUNCTION find_or_create_khach_hang(
  p_ho_ten text, p_so_dien_thoai text DEFAULT NULL, p_email text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL, p_ten_to_chuc text DEFAULT NULL,
  p_chuc_vu text DEFAULT NULL, p_nguon text DEFAULT NULL,
  p_van_phong_id bigint DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO khach_hang (ho_ten, so_dien_thoai, email, nguon_dau)
  VALUES (p_ho_ten, p_so_dien_thoai, p_email, p_nguon)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
