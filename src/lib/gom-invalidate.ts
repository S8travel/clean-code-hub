/** Gom nhiều lần gọi sát nhau thành MỘT lần chạy, sau khoảng lặng `cho` mili giây.
 *
 *  Vì sao cần: bảng `doan` nằm trong publication realtime và mỗi sự kiện đều
 *  invalidate query danh sách đoàn — câu query nặng nhất hệ thống (join agents,
 *  HDV, xe, văn phòng...). Một lệnh UPDATE chạm 187 dòng sinh 187 sự kiện, nhân
 *  với số tab CRM đang mở → hàng trăm request trong vài giây, cạn pool PostgREST
 *  và auth đói theo, OP không đăng nhập được (sự cố 18/08/2026 08:34).
 *
 *  Nguồn sinh sự kiện hàng loạt thì có nhiều: đồng bộ cổng đối tác, cascade khi
 *  đổi số khách, hủy đoàn hàng loạt, sửa dữ liệu bằng SQL. Chặn từng nguồn một là
 *  đuổi theo triệu chứng; gom ở đầu nhận mới là chỗ chặn đúng.
 */
export function gomLaiMotLan(fn: () => void, cho = 800): () => void {
  let hen: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (hen) clearTimeout(hen);
    hen = setTimeout(() => {
      hen = null;
      fn();
    }, cho);
  };
}
