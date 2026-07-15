import { describe, it, expect } from "vitest";
import { coTien, buildBotDemCanhBao, nhanDem, type DemChiPhiLite } from "./ks-bot-dem";

const dem = (over: Partial<DemChiPhiLite> = {}): DemChiPhiLite => ({
  dayId: 1, ngaySo: 5, ngayDate: "2026-07-12", daDeNghi: 0, daTra: 0, ...over,
});

describe("coTien — đêm nào đáng chặn", () => {
  it("đã trả tiền → có tiền", () => {
    expect(coTien(dem({ daTra: 17_600_000 }))).toBe(true);
  });

  // ĐNTT đã duyệt chờ chi: tiền CHƯA ra khỏi công ty nhưng CHẮC CHẮN sẽ ra. Gỡ đêm bây giờ
  // mà không ai biết → kế toán vẫn chi cho một đêm không còn tồn tại.
  it("mới cam kết qua ĐNTT, chưa chi → VẪN có tiền", () => {
    expect(coTien(dem({ daDeNghi: 17_600_000, daTra: 0 }))).toBe(true);
  });

  it("chưa cam kết, chưa trả → sạch, không chặn", () => {
    expect(coTien(dem())).toBe(false);
  });
});

describe("buildBotDemCanhBao", () => {
  const go = (over: Record<string, unknown> = {}) => ({
    kind: "go_bot_dem" as const, oldKsId: 7, oldKsName: "KS Demo", soDemConLai: 1,
    demBiGo: [] as DemChiPhiLite[], ...over,
  });

  // Ca thường gặp nhất: OP đổi khách sạn cho một đêm chưa book gì. Phải im lặng tuyệt đối,
  // nếu không modal nổ hàng ngày và sẽ có người xin tắt nó đi.
  it("không đêm nào dính tiền → null (đổi 1 click, im lặng)", () => {
    expect(buildBotDemCanhBao(go({
      demBiGo: [dem(), dem({ dayId: 2, ngaySo: 6 })],
    }))).toBeNull();
  });

  // Ca đã xảy ra thật: một KS ở 2 đêm liền, OP gỡ 1 đêm (đêm đó đã trả tiền) → guard
  // cũ im lặng vì KS vẫn còn đêm kia.
  it("gỡ đêm đã trả, KS còn đêm khác → cảnh báo, nêu rõ số đêm còn lại", () => {
    const r = buildBotDemCanhBao(go({
      demBiGo: [dem({ dayId: 105, ngaySo: 5, daDeNghi: 17_600_000, daTra: 17_600_000 })],
    }));
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("go_bot_dem");
    expect(r!.tongDaTra).toBe(17_600_000);
    expect(r!.tongDaDeNghi).toBe(17_600_000);
    expect(r!.soDemConLai).toBe(1);
    expect(r!.demDinhTien).toHaveLength(1);
  });

  // Chỉ đêm dính tiền mới được đưa vào modal — đêm sạch không phải việc của OP lúc này.
  it("lọc bỏ đêm sạch, chỉ giữ đêm dính tiền", () => {
    const r = buildBotDemCanhBao(go({
      soDemConLai: 0,
      demBiGo: [
        dem({ dayId: 10, ngaySo: 4, daTra: 5_000_000 }),
        dem({ dayId: 11, ngaySo: 5 }),                       // sạch
        dem({ dayId: 12, ngaySo: 6, daDeNghi: 3_000_000 }),  // mới cam kết, chưa chi
      ],
    }));
    expect(r!.demDinhTien.map((d) => d.ngaySo)).toEqual([4, 6]);
    expect(r!.tongDaTra).toBe(5_000_000);
    expect(r!.tongDaDeNghi).toBe(3_000_000);
  });

  it("cộng dồn nhiều đêm dính tiền", () => {
    const r = buildBotDemCanhBao(go({
      soDemConLai: 2,
      demBiGo: [
        dem({ dayId: 1, ngaySo: 4, daDeNghi: 17_600_000, daTra: 17_600_000 }),
        dem({ dayId: 2, ngaySo: 5, daDeNghi: 17_600_000, daTra: 10_000_000 }),
      ],
    }));
    expect(r!.tongDaTra).toBe(27_600_000);
    expect(r!.tongDaDeNghi).toBe(35_200_000);
  });

  // Nửa thứ hai của tai nạn: đêm đang mồ côi (đã trả cho KS cũ), OP gán KS mới vào.
  // Đây mới là lúc tiền BỊ QUY NHẦM sang khách sạn khác. Không biết KS cũ là ai → null.
  it("gán KS vào đêm đang giữ tiền mồ côi → cảnh báo, oldKs = null", () => {
    const r = buildBotDemCanhBao({
      kind: "gan_ks_vao_dem_co_tien", oldKsId: null, oldKsName: null, soDemConLai: 0,
      demBiGo: [dem({ dayId: 105, ngaySo: 5, daDeNghi: 17_600_000, daTra: 17_600_000 })],
    });
    expect(r!.kind).toBe("gan_ks_vao_dem_co_tien");
    expect(r!.oldKsId).toBeNull();
    expect(r!.tongDaTra).toBe(17_600_000);
  });

  it("gán KS vào đêm sạch → null (ca bình thường, không hỏi)", () => {
    expect(buildBotDemCanhBao({
      kind: "gan_ks_vao_dem_co_tien", oldKsId: null, oldKsName: null, soDemConLai: 0,
      demBiGo: [dem({ dayId: 105, ngaySo: 5 })],
    })).toBeNull();
  });
});

describe("nhanDem", () => {
  it("có đủ dữ liệu", () => {
    expect(nhanDem(dem({ ngaySo: 5, ngayDate: "2026-07-12" }))).toBe("Đêm 5 (12/07)");
  });

  it("thiếu ngày tháng → vẫn ra nhãn dùng được", () => {
    expect(nhanDem(dem({ ngaySo: 5, ngayDate: null }))).toBe("Đêm 5");
    expect(nhanDem(dem({ ngaySo: null, ngayDate: null, dayId: 77 }))).toBe("Đêm #77");
  });
});
