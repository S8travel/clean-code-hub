import type { KetQuaDay } from "@/hooks/use-portal-push";

// Diễn giải kết quả đồng bộ cổng đối tác thành câu cho OP đọc.
//
// Trước đây đẩy 0 dòng vẫn hiện toast XANH "đã đẩy 0 báo giá, 0 đoàn" nên OP tưởng
// xong việc rồi ngồi đợi đối tác gọi. Nguyên tắc ở đây: chỉ báo xanh khi đối tác
// THỰC SỰ xem được — đẩy được dòng nào đó, không bỏ sót, và đối tác có tài khoản.
export function ketQuaThanhLoi(r: KetQuaDay): { kieu: "success" | "warning"; loi: string } {
  const phanDay = `${r.bao_gia} báo giá, ${r.doan} đoàn` + (r.xoa ? `, gỡ ${r.xoa} dòng` : "");
  const thieu = r.agent_thieu_tai_khoan ?? [];
  const boQua = r.bo_qua ?? [];

  if (r.bao_gia === 0 && r.doan === 0) {
    return {
      kieu: "warning",
      loi: boQua.length
        ? `Chưa đẩy được gì. ${boQua[0].ly_do}` + (boQua.length > 1 ? ` (và ${boQua.length - 1} dòng khác)` : "")
        : "Chưa có báo giá hoặc đoàn nào đang mở cổng.",
    };
  }
  if (thieu.length) {
    return {
      kieu: "warning",
      loi: `Đã đẩy ${phanDay}, nhưng ${thieu.map((a) => a.ten).join(", ")} chưa có tài khoản đăng nhập cổng nên vẫn chưa xem được.`,
    };
  }
  if (boQua.length) {
    return { kieu: "warning", loi: `Đã đẩy ${phanDay}. Bỏ qua ${boQua.length} dòng: ${boQua[0].ly_do}` };
  }
  return { kieu: "success", loi: `Đã đẩy ${phanDay} sang cổng.` };
}
