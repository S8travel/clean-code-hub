import { describe, it, expect } from "vitest";
import { tinhDnttConTreo, type DnttConTreoRow } from "@/lib/dntt-con-treo";

const dntt = (
  trang_thai_duyet: string,
  so_tien: number,
  paid_amount = 0,
): DnttConTreoRow => ({ trang_thai_duyet, so_tien, paid_amount });

describe("tinhDnttConTreo", () => {
  it("không có phiếu nào → 0", () => {
    expect(tinhDnttConTreo([])).toBe(0);
  });

  it("bỏ qua phiếu đã hủy / từ chối (RPC cũng loại)", () => {
    expect(tinhDnttConTreo([dntt("da_huy", 500_000), dntt("tu_choi", 300_000)])).toBe(0);
  });

  it("đã duyệt + trả đủ → hết treo", () => {
    expect(tinhDnttConTreo([dntt("da_duyet", 6_396_000, 6_396_000)])).toBe(0);
  });

  it("đã duyệt + trả một phần → treo phần còn lại", () => {
    expect(tinhDnttConTreo([dntt("da_duyet", 1_000_000, 400_000)])).toBe(600_000);
  });

  it("đã duyệt + trả dư → không trả số âm", () => {
    expect(tinhDnttConTreo([dntt("da_duyet", 1_000_000, 1_200_000)])).toBe(0);
  });

  // Đây là ca sinh ra bug: phiếu bổ sung cấn trừ đủ nhưng CHƯA duyệt.
  // View báo payment_status='paid' → cách tính cũ coi như hết treo → nút hiện,
  // trong khi so_tien_da_tt chưa cộng đồng nào.
  it("chờ duyệt + đã cấn trừ ĐỦ → vẫn treo TOÀN BỘ", () => {
    expect(tinhDnttConTreo([dntt("cho_duyet", 273_000, 273_000)])).toBe(273_000);
  });

  it("chờ duyệt + chưa trả gì → treo toàn bộ", () => {
    expect(tinhDnttConTreo([dntt("cho_duyet", 273_000, 0)])).toBe(273_000);
  });

  it("ca thật: phiếu chính đã duyệt trả đủ + phiếu bổ sung chờ duyệt cấn trừ đủ", () => {
    expect(
      tinhDnttConTreo([
        dntt("da_duyet", 6_396_000, 6_396_000),
        dntt("cho_duyet", 273_000, 273_000),
        dntt("tu_choi", 273_000, 0),
      ]),
    ).toBe(273_000);
  });

  it("so_tien null / 0 / rác → bỏ qua, không ra NaN", () => {
    expect(
      tinhDnttConTreo([
        { trang_thai_duyet: "cho_duyet", so_tien: null },
        { trang_thai_duyet: "cho_duyet", so_tien: 0 },
        { trang_thai_duyet: "da_duyet", so_tien: "500000", paid_amount: 200_000 },
      ]),
    ).toBe(300_000);
  });

  it("paid_amount thiếu → coi như chưa trả", () => {
    expect(tinhDnttConTreo([{ trang_thai_duyet: "da_duyet", so_tien: 900_000 }])).toBe(900_000);
  });
});
