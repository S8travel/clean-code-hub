import { describe, it, expect } from "vitest";
import {
  tanSuatMacDinh,
  tanSuatHieuLuc,
  quaHan,
  soNgayGiuaNhac,
  lanNhacKe,
  denKyNhac,
  coTheNhacNgay,
  dangTreo,
  thuocLuongNhac,
  soNgayTreo,
  type ViecCanNhac,
} from "./nhac-cong-viec";

const NOW = new Date("2026-09-10T02:00:00Z");

function viec(over: Partial<ViecCanNhac> = {}): ViecCanNhac {
  return {
    trang_thai: "cho_nhan",
    nguon_tao: "tay",
    do_uu_tien: "binh_thuong",
    tan_suat_nhac: null,
    han_xu_ly: null,
    nhac_lan_cuoi: null,
    created_at: "2026-09-01T02:00:00Z",
    ...over,
  };
}

describe("tanSuatMacDinh", () => {
  it("khẩn cấp và cao → hàng ngày", () => {
    expect(tanSuatMacDinh("khan_cap")).toBe("hang_ngay");
    expect(tanSuatMacDinh("cao")).toBe("hang_ngay");
  });
  it("bình thường → 3 ngày, thấp → hàng tuần", () => {
    expect(tanSuatMacDinh("binh_thuong")).toBe("ba_ngay");
    expect(tanSuatMacDinh("thap")).toBe("hang_tuan");
  });
  it("ưu tiên trống hoặc lạ → 3 ngày", () => {
    expect(tanSuatMacDinh(null)).toBe("ba_ngay");
    expect(tanSuatMacDinh("linh_tinh")).toBe("ba_ngay");
  });
});

describe("tanSuatHieuLuc", () => {
  it("người giao chọn thì thắng mức ưu tiên", () => {
    expect(tanSuatHieuLuc({ tan_suat_nhac: "hang_tuan", do_uu_tien: "khan_cap" })).toBe("hang_tuan");
    expect(tanSuatHieuLuc({ tan_suat_nhac: "khong", do_uu_tien: "khan_cap" })).toBe("khong");
  });
  it("không chọn → suy theo mức ưu tiên", () => {
    expect(tanSuatHieuLuc({ tan_suat_nhac: null, do_uu_tien: "cao" })).toBe("hang_ngay");
  });
  it("giá trị rác trong DB → coi như không chọn", () => {
    expect(tanSuatHieuLuc({ tan_suat_nhac: "moi_gio", do_uu_tien: "thap" })).toBe("hang_tuan");
  });
});

describe("quaHan", () => {
  it("không có hạn thì không bao giờ quá hạn", () => {
    expect(quaHan(null, NOW)).toBe(false);
  });
  it("hạn hôm nay chưa tính là quá hạn", () => {
    expect(quaHan("2026-09-10", NOW)).toBe(false);
  });
  it("hạn hôm qua là quá hạn", () => {
    expect(quaHan("2026-09-09", NOW)).toBe(true);
  });
});

describe("soNgayGiuaNhac", () => {
  it("quá hạn kéo mọi tần suất về hàng ngày", () => {
    expect(soNgayGiuaNhac("hang_tuan", true)).toBe(1);
    expect(soNgayGiuaNhac("ba_ngay", true)).toBe(1);
  });
  it('"không nhắc" vẫn im lặng kể cả khi quá hạn', () => {
    expect(soNgayGiuaNhac("khong", true)).toBeNull();
  });
  it("chưa quá hạn thì giữ đúng tần suất đã chọn", () => {
    expect(soNgayGiuaNhac("hang_tuan", false)).toBe(7);
    expect(soNgayGiuaNhac("hang_ngay", false)).toBe(1);
  });
});

describe("denKyNhac", () => {
  it("giao hôm nay, tần suất hàng ngày → chưa nhắc vội", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-09-10T01:00:00Z" }), NOW)).toBe(false);
  });
  it("giao hơn 1 ngày chưa ai bấm nhận → nhắc", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-09-08T01:00:00Z" }), NOW)).toBe(true);
  });
  it("vừa nhắc sáng nay thì thôi, chờ kỳ sau", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_ngay", nhac_lan_cuoi: "2026-09-10T01:00:00Z" }), NOW)).toBe(false);
  });
  it("hàng tuần: nhắc 4 ngày trước thì chưa tới kỳ", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_tuan", nhac_lan_cuoi: "2026-09-06T02:00:00Z" }), NOW)).toBe(false);
  });
  it("hàng tuần nhưng đã quá hạn → nhắc lại sau 1 ngày", () => {
    const v = viec({ tan_suat_nhac: "hang_tuan", han_xu_ly: "2026-09-05", nhac_lan_cuoi: "2026-09-06T02:00:00Z" });
    expect(denKyNhac(v, NOW)).toBe(true);
  });
  it('người giao chọn "Không nhắc" → im hẳn dù treo cả tháng', () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "khong", created_at: "2026-06-01T02:00:00Z" }), NOW)).toBe(false);
  });
  it("việc đã hoàn thành hoặc đã hủy thì ngừng nhắc", () => {
    for (const tt of ["hoan_thanh", "tu_choi", "huy", "khong_can"]) {
      expect(denKyNhac(viec({ trang_thai: tt, created_at: "2026-06-01T02:00:00Z" }), NOW)).toBe(false);
    }
  });
  it("việc tồn đọng cũ không có hạn vẫn bị nhắc theo mức ưu tiên", () => {
    expect(denKyNhac(viec({ created_at: "2026-06-01T02:00:00Z" }), NOW)).toBe(true);
  });
});

describe("lanNhacKe", () => {
  it("đếm từ lần nhắc gần nhất, không đếm từ lúc giao", () => {
    const v = viec({ tan_suat_nhac: "ba_ngay", nhac_lan_cuoi: "2026-09-09T02:00:00Z" });
    expect(lanNhacKe(v, NOW)?.toISOString()).toBe("2026-09-12T02:00:00.000Z");
  });
  it("chưa nhắc lần nào thì đếm từ lúc giao việc", () => {
    const v = viec({ tan_suat_nhac: "ba_ngay", created_at: "2026-09-09T02:00:00Z" });
    expect(lanNhacKe(v, NOW)?.toISOString()).toBe("2026-09-12T02:00:00.000Z");
  });
  it("việc tắt nhắc hoặc đã đóng → không có lần kế", () => {
    expect(lanNhacKe(viec({ tan_suat_nhac: "khong" }), NOW)).toBeNull();
    expect(lanNhacKe(viec({ trang_thai: "hoan_thanh" }), NOW)).toBeNull();
  });
});

describe("coTheNhacNgay", () => {
  it("chưa nhắc lần nào → bấm được", () => {
    expect(coTheNhacNgay({ trang_thai: "cho_nhan", nhac_lan_cuoi: null }, NOW)).toBe(true);
  });
  it("mới nhắc cách đây 2 tiếng → chặn", () => {
    expect(coTheNhacNgay({ trang_thai: "dang_lam", nhac_lan_cuoi: "2026-09-10T00:00:00Z" }, NOW)).toBe(false);
  });
  it("nhắc hôm kia → bấm lại được", () => {
    expect(coTheNhacNgay({ trang_thai: "dang_lam", nhac_lan_cuoi: "2026-09-08T00:00:00Z" }, NOW)).toBe(true);
  });
  it("việc đã đóng → không giục nữa", () => {
    expect(coTheNhacNgay({ trang_thai: "hoan_thanh", nhac_lan_cuoi: null }, NOW)).toBe(false);
  });
});

describe("dangTreo", () => {
  it("chỉ chờ nhận và đang làm mới là việc còn treo", () => {
    expect(dangTreo("cho_nhan")).toBe(true);
    expect(dangTreo("dang_lam")).toBe(true);
    expect(dangTreo("hoan_thanh")).toBe(false);
    expect(dangTreo("huy")).toBe(false);
  });
});

describe("soNgayTreo", () => {
  it("giao 9 ngày trước → treo 9 ngày", () => {
    expect(soNgayTreo({ created_at: "2026-09-01T02:00:00Z" }, NOW)).toBe(9);
  });
  it("giao sáng nay → treo 0 ngày", () => {
    expect(soNgayTreo({ created_at: "2026-09-10T01:00:00Z" }, NOW)).toBe(0);
  });
  it("giờ tạo lỡ nằm ở tương lai → vẫn về 0, không ra số âm", () => {
    expect(soNgayTreo({ created_at: "2026-09-12T02:00:00Z" }, NOW)).toBe(0);
  });
});

describe("thuocLuongNhac", () => {
  it("việc gõ tay còn treo → có nhắc", () => {
    expect(thuocLuongNhac({ trang_thai: "cho_nhan", nguon_tao: "tay" })).toBe(true);
    expect(thuocLuongNhac({ trang_thai: "dang_lam", nguon_tao: "tay" })).toBe(true);
  });
  it("việc hệ thống tự sinh → không nhắc dù treo cả tháng", () => {
    expect(thuocLuongNhac({ trang_thai: "cho_nhan", nguon_tao: "tu_dong" })).toBe(false);
  });
  it("thiếu nguồn (dữ liệu cũ chưa migrate) → không nhắc, tránh dội chuông oan", () => {
    expect(thuocLuongNhac({ trang_thai: "cho_nhan", nguon_tao: undefined })).toBe(false);
  });
  it("việc tay đã xong → thôi nhắc", () => {
    expect(thuocLuongNhac({ trang_thai: "hoan_thanh", nguon_tao: "tay" })).toBe(false);
  });
});
