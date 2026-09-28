import { describe, it, expect } from "vitest";
import { queryConGiuCong, buocChoTaiLai, type QueryChoLite, type TrangThaiTai } from "./cho-tai-lai";

const q = (isStale: boolean, fetchStatus: TrangThaiTai): QueryChoLite => ({ isStale, fetchStatus });
const TUOI = q(false, "idle");
const CU_DANG_TAI = q(true, "fetching");
// Sau 30s cache tự hết hạn: isStale lật, KHÔNG có lượt tải nào đi kèm. Cũng là thế sau
// một lượt tải lỗi / bị hủy (data vẫn cũ nhưng không còn gì đang tải).
const CU_KHONG_TAI = q(true, "idle");

describe("queryConGiuCong", () => {
  it("cũ và đang tải (cache cũ lúc mở, hoặc bị invalidate) → giữ cổng", () => {
    expect(queryConGiuCong(CU_DANG_TAI)).toBe(true);
  });
  it("mất mạng, lượt tải treo → vẫn giữ (có mạng tự chạy tiếp)", () => {
    expect(queryConGiuCong(q(true, "paused"))).toBe(true);
  });
  it("cũ mà không còn lượt tải nào (tự hết hạn / lỗi / bị hủy) → không giữ, không kẹt vô hạn", () => {
    expect(queryConGiuCong(CU_KHONG_TAI)).toBe(false);
  });
  it("tươi → không giữ, kể cả khi đang tải lại tay", () => {
    expect(queryConGiuCong(TUOI)).toBe(false);
    expect(queryConGiuCong(q(false, "fetching"))).toBe(false);
  });
});

describe("buocChoTaiLai", () => {
  it("mở với cache tươi → thả ngay, hiện bảng luôn", () => {
    expect(buocChoTaiLai(null, "1|", [TUOI, TUOI]).daTha).toBe(true);
  });

  it("mở với cache NH cũ (sau khi lưu Điều tour) → chờ", () => {
    expect(buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]).daTha).toBe(false);
  });

  it("HỒI QUY 28/09: mở với cache tươi, 30s sau cache tự hết hạn → KHÔNG quay lại 'Đang tải'", () => {
    const m1 = buocChoTaiLai(null, "1|", [TUOI, TUOI]);
    const m2 = buocChoTaiLai(m1, "1|", [CU_KHONG_TAI, CU_KHONG_TAI]);
    expect(m2.daTha).toBe(true);
    expect(m2).toBe(m1);
  });

  it("HỒI QUY 28/09: mở với cache tươi rồi bị invalidate (lưu ô KS/DV, realtime) → không nháy 'Đang tải'", () => {
    const m1 = buocChoTaiLai(null, "1|", [TUOI, TUOI]);
    expect(buocChoTaiLai(m1, "1|", [CU_DANG_TAI, CU_DANG_TAI]).daTha).toBe(true);
  });

  it("cache cũ lúc mở → chờ lượt tải lúc mở; tải lại ngầm về sau không chờ lại", () => {
    const m1 = buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]);
    const m2 = buocChoTaiLai(m1, "1|", [TUOI, TUOI]);
    expect(m2.daTha).toBe(true);
    const m3 = buocChoTaiLai(m2, "1|", [CU_DANG_TAI, CU_DANG_TAI]);
    expect(m3.daTha).toBe(true);
    expect(m3).toBe(m2);
  });

  it("lượt tải lúc mở lỗi hoặc bị hủy → thả, không kẹt; lượt tải mới sau đó KHÔNG chờ lại", () => {
    const m1 = buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]);
    const m2 = buocChoTaiLai(m1, "1|", [CU_KHONG_TAI, TUOI]);
    expect(m2.daTha).toBe(true);
    expect(buocChoTaiLai(m2, "1|", [CU_DANG_TAI, TUOI]).daTha).toBe(true);
  });

  it("mở lúc mất mạng với cache cũ → vẫn chờ", () => {
    expect(buocChoTaiLai(null, "1|", [q(true, "paused"), TUOI]).daTha).toBe(false);
  });

  it("chỉ chi phí cũ lúc mở (đang tải lại sau lưu Điều tour) → chờ theo chi phí rồi thả", () => {
    const m1 = buocChoTaiLai(null, "1|", [TUOI, CU_DANG_TAI]);
    expect(m1.daTha).toBe(false);
    expect(buocChoTaiLai(m1, "1|", [TUOI, TUOI]).daTha).toBe(true);
  });

  it("chi phí tươi lúc mở nhưng tự hết hạn trong lúc NH đang tải lần đầu → chỉ chờ theo NH", () => {
    const m1 = buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]);
    const m2 = buocChoTaiLai(m1, "1|", [CU_DANG_TAI, CU_KHONG_TAI]);
    expect(m2.daTha).toBe(false);
    expect(buocChoTaiLai(m2, "1|", [TUOI, CU_KHONG_TAI]).daTha).toBe(true);
  });

  it("chi phí tươi lúc mở bị invalidate khi NH còn chờ (lưu Điều tour xong giữa chừng) → chờ luôn chi phí", () => {
    const m1 = buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]);
    const m2 = buocChoTaiLai(m1, "1|", [CU_DANG_TAI, CU_DANG_TAI]);
    const m3 = buocChoTaiLai(m2, "1|", [TUOI, CU_DANG_TAI]);
    expect(m3.daTha).toBe(false);
    expect(buocChoTaiLai(m3, "1|", [TUOI, TUOI]).daTha).toBe(true);
  });

  it("sang đoàn khác → chờ lại theo đoàn mới; cùng đoàn thì không", () => {
    const m1 = buocChoTaiLai(null, "1|", [TUOI, TUOI]);
    expect(buocChoTaiLai(m1, "1|", [CU_DANG_TAI, TUOI]).daTha).toBe(true);
    const m2 = buocChoTaiLai(m1, "2|", [CU_DANG_TAI, TUOI]);
    expect(m2.khoa).toBe("2|");
    expect(m2.daTha).toBe(false);
    expect(buocChoTaiLai(m1, "2|", [TUOI, TUOI])).toEqual({ khoa: "2|", daTha: true });
  });

  it("không có gì đổi giữa 2 lượt render → trả đúng tham chiếu cũ (không setState lặp)", () => {
    const cho = buocChoTaiLai(null, "1|", [CU_DANG_TAI, TUOI]);
    expect(buocChoTaiLai(cho, "1|", [CU_DANG_TAI, TUOI])).toBe(cho);
    const tha = buocChoTaiLai(null, "1|", [TUOI, TUOI]);
    expect(buocChoTaiLai(tha, "1|", [TUOI, TUOI])).toBe(tha);
  });
});
