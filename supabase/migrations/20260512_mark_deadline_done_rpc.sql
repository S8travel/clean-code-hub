-- SECURITY DEFINER function để đánh dấu deadline xong, bypass RLS edge case
-- (PostgREST UPDATE đôi khi silent fail dù policy cho phép).
-- Trả về số rows ảnh hưởng (0 nếu booking không tồn tại).
CREATE OR REPLACE FUNCTION public.mark_deadline_done(p_type text, p_booking_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_type = 'ks' THEN
    UPDATE public.doan_booking_ks SET deadline_done_at = NOW() WHERE id = p_booking_id;
  ELSIF p_type = 'nh' THEN
    UPDATE public.doan_booking_nh SET deadline_done_at = NOW() WHERE id = p_booking_id;
  ELSIF p_type = 'dv' THEN
    UPDATE public.doan_booking_dv SET deadline_done_at = NOW() WHERE id = p_booking_id;
  ELSE
    RAISE EXCEPTION 'Invalid type: %', p_type;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_deadline_done(text, bigint) TO authenticated, anon;
