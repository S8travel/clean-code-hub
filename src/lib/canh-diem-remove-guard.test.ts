import { describe, it, expect } from "vitest";
import {
  findDoomedCanhDiemItems, findBlockedChiPhi, buildCanhDiemBlockedMessage,
  type DoanNgayItemLite,
} from "./canh-diem-remove-guard";

const item = (id: number, ngayId: number, cdId: number | null): DoanNgayItemLite =>
  ({ id, doan_ngay_id: ngayId, canh_diem_id: cdId });

// doan_ngay 10 = ngày 1, doan_ngay 11 = ngày 2
const ngayMap = new Map([[10, 1], [11, 2]]);

describe("findDoomedCanhDiemItems", () => {
  it("cảnh điểm bị bỏ khỏi ngày → sẽ bị xóa", () => {
    const items = [item(1, 10, 100), item(2, 10, 200)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [100] }]);
    expect(doomed).toEqual([2]);
  });

  it("giữ nguyên cảnh điểm → không xóa gì", () => {
    const items = [item(1, 10, 100), item(2, 10, 200)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [100, 200] }]);
    expect(doomed).toEqual([]);
  });

  it("bỏ HẾT cảnh điểm của ngày → xóa mọi item của ngày đó", () => {
    const items = [item(1, 10, 100), item(2, 10, 200)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [] }]);
    expect(doomed).toEqual([1, 2]);
  });

  it("canh_diem_id null/0 luôn bị coi là không được chọn", () => {
    const items = [item(1, 10, null), item(2, 10, 0)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [100] }]);
    expect(doomed).toEqual([1, 2]);
  });

  // Vòng lặp save chỉ chạy trên `days` (state local). Ngày bị cắt khỏi tour KHÔNG đi qua
  // nhánh xóa item — backstop phải mirror y hệt, nếu không sẽ chặn nhầm.
  it("ngày không còn trong state local → KHÔNG tính là sẽ xóa", () => {
    const items = [item(1, 10, 100), item(9, 11, 300)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [100] }]);
    expect(doomed).toEqual([]); // item 9 thuộc ngày 2, ngày 2 không được lưu lượt này
  });

  it("item của doan_ngay lạ (nhóm khác) → bỏ qua", () => {
    const items = [item(5, 99, 100)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [{ ngay_so: 1, canhDiemIds: [] }]);
    expect(doomed).toEqual([]);
  });

  it("nhiều ngày cùng lúc, mỗi ngày một tập chọn riêng", () => {
    const items = [item(1, 10, 100), item(2, 10, 200), item(3, 11, 300), item(4, 11, 400)];
    const doomed = findDoomedCanhDiemItems(items, ngayMap, [
      { ngay_so: 1, canhDiemIds: [100] },
      { ngay_so: 2, canhDiemIds: [400] },
    ]);
    expect(doomed).toEqual([2, 3]);
  });
});

describe("findBlockedChiPhi", () => {
  const rows = [
    { id: 1, mo_ta: "Vịnh Hạ Long", so_tien_da_tt: 0 },
    { id: 2, mo_ta: "Tràng An", so_tien_da_tt: 0 },
    { id: 3, mo_ta: "Chùa Bái Đính", so_tien_da_tt: 5_000_000 },
  ];

  it("còn ĐNTT hiệu lực → chặn, kèm số hiệu phiếu", () => {
    const blocked = findBlockedChiPhi([rows[0], rows[1]], new Map([[2, [2303, 2401]]]));
    expect(blocked).toEqual([{ moTa: "Tràng An", dnttIds: [2303, 2401] }]);
  });

  // Đây là ca "ĐNTT đã hủy nhưng tiền đã ra" — xóa dòng là mất dấu đã trả.
  it("hết ĐNTT nhưng so_tien_da_tt > 0 → vẫn chặn", () => {
    const blocked = findBlockedChiPhi(rows, new Map());
    expect(blocked).toEqual([{ moTa: "Chùa Bái Đính", dnttIds: [] }]);
  });

  it("ĐNTT thắng so_tien_da_tt khi cả hai cùng có (báo số phiếu cho OP)", () => {
    const blocked = findBlockedChiPhi([rows[2]], new Map([[3, [99]]]));
    expect(blocked).toEqual([{ moTa: "Chùa Bái Đính", dnttIds: [99] }]);
  });

  it("sạch → không chặn", () => {
    expect(findBlockedChiPhi([rows[0]], new Map())).toEqual([]);
  });

  it("gộp MỌI dòng vướng trong một lần, không dừng ở dòng đầu", () => {
    const blocked = findBlockedChiPhi(rows, new Map([[1, [10]], [2, [20]]]));
    expect(blocked.map((b) => b.moTa)).toEqual(["Vịnh Hạ Long", "Tràng An", "Chùa Bái Đính"]);
  });

  it("mo_ta rỗng → vẫn có nhãn nhận dạng", () => {
    expect(findBlockedChiPhi([{ id: 7, mo_ta: null, so_tien_da_tt: 1 }], new Map())[0].moTa)
      .toBe("chi phí #7");
  });
});

describe("buildCanhDiemBlockedMessage", () => {
  it("nêu rõ số hiệu ĐNTT, lý do, và trấn an rằng lịch trình chưa đổi", () => {
    const msg = buildCanhDiemBlockedMessage([
      { moTa: "Tràng An", dnttIds: [2303] },
      { moTa: "Chùa Bái Đính", dnttIds: [] },
    ]);
    expect(msg).toContain('"Tràng An" (ĐNTT #2303)');
    expect(msg).toContain('"Chùa Bái Đính" (đã thanh toán)');
    expect(msg).toContain("Lịch trình chưa bị thay đổi");
  });
});
