/**
 * Lỗi từ BACKSTOP của `useSaveDieuTour` — ném ra TRƯỚC khi ghi bất kỳ byte nào xuống DB.
 *
 * Tồn tại để `DoanDetail.onError` phân biệt hai loại hỏng hoàn toàn khác nhau:
 *
 *  - `DieuTourGuardError`: DB chưa bị đụng. Thao tác của OP vẫn đúng và còn nguyên trên
 *    màn hình. GIỮ nguyên `days`, chỉ báo lý do. Refetch lúc này = xoá sạch mọi sửa đổi
 *    khác trong cùng lượt (số khách, cảnh điểm ngày khác…) chỉ vì một dòng vướng ĐNTT —
 *    đúng thứ khiến OP mất cả buổi làm và ngại gõ vào Điều tour.
 *
 *  - Lỗi khác: có thể đã ghi một phần (mạng đứt giữa chừng, race sau backstop). Không
 *    biết DB đang ở đâu → refetch để kéo UI về đúng sự thật.
 */
export class DieuTourGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DieuTourGuardError";
  }
}
