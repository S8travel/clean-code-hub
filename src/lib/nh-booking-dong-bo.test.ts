import { describe, it, expect } from "vitest";
import { duocDienNhaHangTuBooking } from "./nh-booking-dong-bo";

describe("duocDienNhaHangTuBooking", () => {
  it("chương trình chưa có nhà hàng nào → cho vá từ booking (dữ liệu cũ chưa migrate)", () => {
    expect(
      duocDienNhaHangTuBooking([
        { an_trua_nha_hang_id: null, an_toi_nha_hang_id: null },
        { an_trua_nha_hang_id: null, an_toi_nha_hang_id: null },
      ]),
    ).toBe(true);
  });

  it("chương trình đã có nhà hàng, một ô bữa bị OP gỡ → KHÔNG điền đè", () => {
    // Lỗi cũ: ô trống + còn booking → mỗi lần vào lại là nhà hàng tự quay về,
    // OP tưởng hệ thống không ghi nhận thao tác gỡ.
    expect(
      duocDienNhaHangTuBooking([
        { an_trua_nha_hang_id: 141, an_toi_nha_hang_id: 125 },
        { an_trua_nha_hang_id: 181, an_toi_nha_hang_id: null },
        { an_trua_nha_hang_id: null, an_toi_nha_hang_id: null },
      ]),
    ).toBe(false);
  });

  it("chỉ một bữa duy nhất có nhà hàng cũng đủ coi là chương trình đã dựng", () => {
    expect(
      duocDienNhaHangTuBooking([
        { an_trua_nha_hang_id: null, an_toi_nha_hang_id: null },
        { an_trua_nha_hang_id: null, an_toi_nha_hang_id: 361 },
      ]),
    ).toBe(false);
  });

  it("chương trình rỗng → coi như chưa có gì, cho vá", () => {
    expect(duocDienNhaHangTuBooking([])).toBe(true);
  });
});
