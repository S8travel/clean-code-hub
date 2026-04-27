Mình sẽ xử lý lỗi link public bị trắng theo hướng ổn định runtime production, không chỉ preview.

Kết quả rà soát hiện tại:
- App public/preview đang load được dữ liệu từ backend ngoài ở `/dashboard`.
- Vẫn còn một điểm nguy hiểm trong `src/hooks/use-doan.ts`: file này import `@/integrations/supabase/client` và gọi `supabase.auth.getUser()` trong `useCurrentUserProfile()`.
- Client này phụ thuộc biến build của Lovable Cloud (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Trên link public nếu build/env không có hoặc lệch, module có thể throw runtime error kiểu `supabaseUrl is required`, làm app trắng trang.
- Root route `/` hiện đang redirect vào `/dashboard`; nếu có lỗi trong layout/dashboard hoặc auth check, người dùng public sẽ thấy blank thay vì trang login/lỗi rõ ràng.

Kế hoạch sửa:

1. Loại bỏ hoàn toàn client backend cũ khỏi frontend runtime
   - Sửa `src/hooks/use-doan.ts` để bỏ import `@/integrations/supabase/client`.
   - Đổi `useCurrentUserProfile()` sang dùng `externalSupabase.auth.getUser()` giống các hook còn lại.
   - Đảm bảo không còn import `@/integrations/supabase/client` trong code app.

2. Làm auth/session an toàn hơn trên link public
   - Giữ timeout session hiện tại, nhưng tránh phụ thuộc trực tiếp vào `window.setTimeout` ở module scope nếu cần.
   - Đảm bảo trạng thái loading luôn thoát về login nếu session/user query bị lỗi hoặc bị treo.

3. Thêm lớp chống trắng trang ở root app
   - Bọc router/layout bằng Error Boundary nhẹ.
   - Nếu có runtime error, hiển thị màn hình lỗi có nút tải lại/đăng nhập lại thay vì blank screen.
   - Log lỗi ra console để lần sau dễ truy vết.

4. Kiểm tra lại đường dẫn root và public routes
   - Đảm bảo `/` redirect đúng sang `/dashboard` khi đã đăng nhập.
   - Nếu chưa đăng nhập hoặc session hết hạn, chuyển về `/login` thay vì đứng ở màn hình trắng.

5. Verify sau khi sửa
   - Chạy TypeScript check và production build.
   - Rà lại bằng search để xác nhận không còn dùng client backend cũ trong `src/` ngoài file auto-generated.
   - Nếu build pass, bạn chỉ cần bấm Publish/Update lại để link public nhận frontend mới.