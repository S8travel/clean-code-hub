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

/** 09:00 sáng giờ Việt Nam ngày 10/09 — TRƯỚC giờ cron chạy (09:15). */
const NOW = new Date("2026-09-10T02:00:00Z");
/** 10:00 sáng giờ Việt Nam cùng ngày — SAU giờ cron chạy. */
const SAU_CRON = new Date("2026-09-10T03:00:00Z");

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

/** Ngày (theo lịch VN) mà chuông kế tiếp nổ, dạng "YYYY-MM-DD". */
function ngayNhac(v: ViecCanNhac, now: Date): string | null {
  const d = lanNhacKe(v, now);
  return d ? d.toISOString().slice(0, 10) : null;
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

describe("quaHan — tính theo ngày lịch Việt Nam", () => {
  it("không có hạn thì không bao giờ quá hạn", () => {
    expect(quaHan(null, NOW)).toBe(false);
  });
  it("hạn hôm nay chưa tính là quá hạn", () => {
    expect(quaHan("2026-09-10", NOW)).toBe(false);
  });
  it("hạn hôm qua là quá hạn", () => {
    expect(quaHan("2026-09-09", NOW)).toBe(true);
  });
  it("nửa đêm giờ Việt Nam đã sang ngày mới, dù giờ máy chủ còn hôm trước", () => {
    // 00:30 ngày 11/09 giờ VN = 17:30 ngày 10/09 giờ UTC.
    const nuaDem = new Date("2026-09-10T17:30:00Z");
    expect(quaHan("2026-09-10", nuaDem)).toBe(true);
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
  it("giao hôm qua chưa ai bấm nhận → nhắc", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-09-09T10:00:00Z" }), NOW)).toBe(true);
  });
  it("giao chiều muộn hôm qua vẫn được nhắc sáng nay, không lùi thêm một ngày", () => {
    // 23h ngày 09/09 giờ VN = 16:00 UTC. Đếm theo giờ thì chưa đủ 24h lúc cron chạy.
    const v = viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-09-09T16:00:00Z" });
    expect(denKyNhac(v, NOW)).toBe(true);
  });
  it("cron hôm nay chạy sớm hơn hôm qua vài mili-giây vẫn không trượt kỳ", () => {
    // Bẫy cũ: nhac_lan_cuoi do chính cron ghi, so "đủ 24 giờ" thì hụt và mất một ngày.
    const v = viec({ tan_suat_nhac: "hang_ngay", nhac_lan_cuoi: "2026-09-09T02:15:00.123Z" });
    expect(denKyNhac(v, new Date("2026-09-10T02:15:00.089Z"))).toBe(true);
  });
  it("vừa nhắc sáng nay thì thôi, chờ kỳ sau", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_ngay", nhac_lan_cuoi: "2026-09-10T01:00:00Z" }), NOW)).toBe(false);
  });
  it("hàng tuần: nhắc 4 ngày trước thì chưa tới kỳ", () => {
    expect(denKyNhac(viec({ tan_suat_nhac: "hang_tuan", nhac_lan_cuoi: "2026-09-06T02:00:00Z" }), NOW)).toBe(false);
  });
  it("hàng tuần nhưng đã quá hạn → nhắc lại sau một ngày", () => {
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

describe("lanNhacKe — không bao giờ trả về ngày đã qua", () => {
  it("việc treo lâu, hỏi trước giờ cron → chuông nổ ngay sáng nay", () => {
    expect(ngayNhac(viec({ created_at: "2026-06-01T02:00:00Z" }), NOW)).toBe("2026-09-10");
  });
  it("việc treo lâu, hỏi sau giờ cron → chuông nổ sáng mai", () => {
    expect(ngayNhac(viec({ created_at: "2026-06-01T02:00:00Z" }), SAU_CRON)).toBe("2026-09-11");
  });
  it("vừa nhắc sáng nay, hàng ngày → sáng mai", () => {
    const v = viec({ tan_suat_nhac: "hang_ngay", nhac_lan_cuoi: "2026-09-10T02:15:00Z" });
    expect(ngayNhac(v, SAU_CRON)).toBe("2026-09-11");
  });
  it("ba ngày một lần: nhắc hôm qua → hai ngày nữa", () => {
    const v = viec({ tan_suat_nhac: "ba_ngay", nhac_lan_cuoi: "2026-09-09T02:15:00Z" });
    expect(ngayNhac(v, SAU_CRON)).toBe("2026-09-12");
  });
  it("việc mới giao chiều nay, hàng ngày → sáng mai", () => {
    const v = viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-09-10T08:00:00Z" });
    expect(ngayNhac(v, new Date("2026-09-10T09:00:00Z"))).toBe("2026-09-11");
  });
  it("việc tắt nhắc hoặc đã đóng → không có lần kế", () => {
    expect(lanNhacKe(viec({ tan_suat_nhac: "khong" }), NOW)).toBeNull();
    expect(lanNhacKe(viec({ trang_thai: "hoan_thanh" }), NOW)).toBeNull();
  });
});

describe("nhãn và chuông phải khớp nhau", () => {
  it("đã tới kỳ thì ngày nhắc là lượt cron gần nhất còn lại, không phải quá khứ", () => {
    const v = viec({ tan_suat_nhac: "hang_ngay", created_at: "2026-08-01T02:00:00Z" });
    expect(denKyNhac(v, NOW)).toBe(true);
    expect(ngayNhac(v, NOW)).toBe("2026-09-10");
  });
  it("chưa tới kỳ thì ngày nhắc đúng bằng mốc cộng số ngày của tần suất", () => {
    const v = viec({ tan_suat_nhac: "hang_tuan", nhac_lan_cuoi: "2026-09-08T02:15:00Z" });
    expect(denKyNhac(v, NOW)).toBe(false);
    expect(ngayNhac(v, NOW)).toBe("2026-09-15");
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
