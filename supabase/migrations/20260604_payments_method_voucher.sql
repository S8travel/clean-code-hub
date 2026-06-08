-- Cho phép payments.method='voucher' (ĐNTT "đã trả bằng voucher" cho voucher MUA).
-- payments CÓ 2 CHECK constraint chặn: payments_method_check (chỉ cash/can_tru) và
-- can_tru_must_have_cong_no (voucher với cong_no_id NULL không khớp nhánh nào).
-- → nới cả hai để method='voucher' (cong_no_id NULL) hợp lệ.

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
  CHECK (method = ANY (ARRAY['cash'::text, 'can_tru'::text, 'voucher'::text]));

-- cong_no_id bắt buộc CHỈ khi can_tru; cash & voucher → cong_no_id phải NULL.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS can_tru_must_have_cong_no;
ALTER TABLE public.payments ADD CONSTRAINT can_tru_must_have_cong_no
  CHECK (
    (method = 'can_tru'::text AND cong_no_id IS NOT NULL)
    OR (method <> 'can_tru'::text AND cong_no_id IS NULL)
  );
