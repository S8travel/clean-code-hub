-- HOÀN TÁC: trả 79 đoàn đuôi "-FY" về đối tác Guo (agents.id = 3).
--
-- Bối cảnh 18/08/2026: tách đối tác Yifei ra khỏi Guo. Trước khi đổi, cả 79 đoàn
-- khớp `upper(btrim(ten_doan)) LIKE '%-FY'` đều thuộc agent_id = 3 (Guo) — không
-- có ngoại lệ, nên hoàn tác chỉ là gán ngược lại.
--
-- Chạy khi nào: nếu quyết định gộp Yifei về lại Guo, hoặc nếu việc tách làm lệch
-- báo cáo doanh thu theo đối tác.
--
-- LƯU Ý: liệt kê id cứng thay vì lọc lại theo tên. Đoàn đặt tên sau ngày tách
-- cũng có đuôi -FY nhưng thuộc Yifei thật, lọc theo tên sẽ kéo nhầm chúng về Guo.

UPDATE public.doan SET agent_id = 3
WHERE id IN (
  22,28,29,33,34,36,49,51,58,61,62,78,87,91,102,110,147,150,154,155,
  203,213,252,254,255,257,276,277,278,284,305,306,307,308,309,314,317,322,353,362,
  365,366,368,426,476,479,494,500,512,523,524,529,540,545,547,632,633,636,647,648,
  650,655,656,659,660,662,667,668,669,670,671,672,673,682,695,717,742,752,769
);

-- Gỡ luôn đối tác Yifei nếu không còn đoàn nào trỏ vào:
-- DELETE FROM public.agents WHERE ten = 'Yifei'
--   AND NOT EXISTS (SELECT 1 FROM public.doan WHERE agent_id = agents.id);
