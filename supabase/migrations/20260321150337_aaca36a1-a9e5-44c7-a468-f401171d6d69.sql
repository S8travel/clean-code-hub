
ALTER TABLE public.doan_booking_nh ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on doan_booking_nh" ON public.doan_booking_nh FOR ALL USING (true) WITH CHECK (true);
