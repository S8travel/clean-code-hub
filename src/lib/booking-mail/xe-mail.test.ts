import { describe, it, expect } from "vitest";
import {
  buildXeEmailHtml, buildXeMailSnapshot, diffXeMailSnapshot, parseXeMailSnapshot,
  type XeMailInput,
} from "./xe-mail";

// Dữ liệu giả — repo public, KHÔNG dùng tên / SĐT thật.
const base: XeMailInput = {
  tenDoan: "S8DAD2D260916-XX",
  nhaXeTen: "Nhà xe Mẫu",
  tenXe: "35c",
  soCho: 35,
  ngayDi: "2026-09-16",
  ngayVe: "2026-09-17",
  chuyenBayDon: "VJ901 19:00 → 20:55",
  chuyenBayTien: "VJ902 14:25 → 18:00",
  hdvText: "HDV Mẫu — 0900000001",
  soKhach: 16,
  ghiChu: "Đón ở cửa ga quốc tế",
  cells: [
    {
      ngay_date: "2026-09-16", thu: "T4",
      chuongTrinh: "Đà Nẵng\n• Đón sân bay",
      anTrua: "",
      anToi: "Nhà hàng Biển Mẫu\n1 Đường Biển\n0900000002",
      khachSan: "Khách sạn Sao Mẫu\n2 Đường Sông",
    },
    {
      ngay_date: "2026-09-17", thu: "T5",
      chuongTrinh: "Hội An\n• Chùa Cầu\n• Phố cổ",
      anTrua: "Nhà hàng Phố Mẫu\n3 Đường Phố",
      anToi: "",
      khachSan: "",
    },
  ],
  senderName: "Điều hành Mẫu",
  senderPhone: "0900000003",
};

type Cell = XeMailInput["cells"][number];

/** Bản sao `input` với ô lịch trình ngày `idx` được sửa. */
function withCell(input: XeMailInput, idx: number, patch: Partial<Cell>): XeMailInput {
  return { ...input, cells: input.cells.map((c, k) => (k === idx ? { ...c, ...patch } : c)) };
}

/** Dời cả đoàn sang ngày hôm sau (ngày đón/tiễn + ngày lịch từng ngày). */
const doiNgaySau: XeMailInput = {
  ...base,
  ngayDi: "2026-09-17",
  ngayVe: "2026-09-18",
  cells: base.cells.map((c, k) => ({ ...c, ngay_date: `2026-09-1${7 + k}` })),
};

const HL = "background:#fef08a";
const demToVang = (html: string) => html.split(HL).length - 1;

describe("buildXeEmailHtml — mail đặt lần đầu", () => {
  it("đủ thông tin xe + lịch trình từng ngày + ghi chú, nhờ báo giá", () => {
    const html = buildXeEmailHtml(base, "first");
    expect(html).toContain("Nhà xe Mẫu");
    expect(html).toContain("35 chỗ");
    expect(html).toContain("VJ901 19:00 → 20:55");
    expect(html).toContain("16 khách");
    expect(html).toContain("Lịch trình");
    expect(html).toContain("Chùa Cầu");
    expect(html).toContain("Nhà hàng Biển Mẫu");
    expect(html).toContain("Khách sạn Sao Mẫu");
    expect(html).toContain("Đón ở cửa ga quốc tế");
    expect(html).toContain("báo giá trong vòng");
    expect(html).not.toContain("EMAIL CẬP NHẬT");
  });

  it("không bao giờ liệt kê / tô vàng thay đổi, kể cả khi có bản chụp cũ", () => {
    const html = buildXeEmailHtml({ ...base, soKhach: 20, prevSnapshot: buildXeMailSnapshot(base) }, "first");
    expect(html).not.toContain("Các thay đổi so với mail trước");
    expect(demToVang(html)).toBe(0);
  });

  it("escape ký tự HTML trong dữ liệu gõ tay", () => {
    const html = buildXeEmailHtml({ ...base, tenDoan: "Đoàn <b>X</b>", ghiChu: "a & b" }, "first");
    expect(html).toContain("Đoàn &lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<b>X</b>");
  });
});

describe("buildXeEmailHtml — gửi cập nhật", () => {
  it("gửi lại ĐỦ lịch trình (lỗi cũ: chỉ còn tóm tắt + 'xem mail booking gốc')", () => {
    const html = buildXeEmailHtml(base, "update", "Tăng khách");
    expect(html).toContain("EMAIL CẬP NHẬT");
    expect(html).toContain("Lịch trình");
    expect(html).toContain("Chùa Cầu");
    expect(html).toContain("Khách sạn Sao Mẫu");
    expect(html).toContain("Đón ở cửa ga quốc tế");
    expect(html).toContain("Tăng khách");
    expect(html).not.toContain("mail booking gốc");
    expect(html).not.toContain("báo giá trong vòng");
  });

  it("chưa có bản chụp mail trước → không tự liệt kê, không tô vàng", () => {
    const html = buildXeEmailHtml({ ...base, soKhach: 18, prevSnapshot: null }, "update");
    expect(html).not.toContain("Các thay đổi so với mail trước");
    expect(demToVang(html)).toBe(0);
  });

  it("có bản chụp nhưng không đổi gì → không có khung thay đổi", () => {
    const html = buildXeEmailHtml({ ...base, prevSnapshot: buildXeMailSnapshot(base) }, "update");
    expect(html).not.toContain("Các thay đổi so với mail trước");
    expect(demToVang(html)).toBe(0);
  });

  it("đổi số khách + cảnh điểm → khung trước/nay + tô vàng đúng 2 ô", () => {
    const moi = withCell({ ...base, soKhach: 18 }, 1, { chuongTrinh: "Hội An\n• Chùa Cầu\n• Rừng dừa" });
    const html = buildXeEmailHtml(
      { ...moi, prevSnapshot: buildXeMailSnapshot(base), prevSentLabel: "15/09/2026 09:30" },
      "update",
    );
    expect(html).toContain("Các thay đổi so với mail trước (gửi 15/09/2026 09:30)");
    expect(html).toContain("Ngày 2 (17/9) · Chương trình");
    expect(html).toContain("Rừng dừa");
    expect(demToVang(html)).toBe(2); // dòng Số khách + ô chương trình ngày 2
  });

  it("dời ngày đón → tô dòng ngày đón/tiễn + ô ngày của từng ngày", () => {
    const html = buildXeEmailHtml({ ...doiNgaySau, prevSnapshot: buildXeMailSnapshot(base) }, "update");
    expect(demToVang(html)).toBe(4); // 2 dòng thông tin + 2 ô ngày trong lịch trình
  });
});

describe("diffXeMailSnapshot", () => {
  const snap = buildXeMailSnapshot;

  it("không đổi gì → rỗng", () => {
    expect(diffXeMailSnapshot(snap(base), snap({ ...base }))).toEqual([]);
  });

  it("chuyến bay (chuỗi sẵn có '→') + số khách → trước / nay tách cột", () => {
    const changes = diffXeMailSnapshot(snap(base), snap({ ...base, soKhach: 18, chuyenBayDon: "VJ905 21:00 → 22:30" }));
    expect(changes).toEqual([
      { key: "chuyen_bay_don", label: "Chuyến bay đón", truoc: ["VJ901 19:00 → 20:55"], nay: ["VJ905 21:00 → 22:30"] },
      { key: "so_khach", label: "Số khách", truoc: ["16 khách"], nay: ["18 khách"] },
    ]);
  });

  it("thêm / bỏ cảnh điểm → chỉ liệt kê dòng thay đổi", () => {
    const changes = diffXeMailSnapshot(snap(base), snap(withCell(base, 1, { chuongTrinh: "Hội An\n• Chùa Cầu\n• Rừng dừa" })));
    expect(changes).toEqual([
      { key: "ngay:1:chuong_trinh", label: "Ngày 2 (17/9) · Chương trình", truoc: ["• Phố cổ"], nay: ["• Rừng dừa"] },
    ]);
  });

  it("đổi nhà hàng → tên + địa chỉ cũ / mới; các ô khác không bị báo", () => {
    const changes = diffXeMailSnapshot(snap(base), snap(withCell(base, 0, { anToi: "Nhà hàng Núi Mẫu\n9 Đường Núi" })));
    expect(changes).toEqual([
      {
        key: "ngay:0:an_toi",
        label: "Ngày 1 (16/9) · Ăn tối",
        truoc: ["Nhà hàng Biển Mẫu", "1 Đường Biển", "0900000002"],
        nay: ["Nhà hàng Núi Mẫu", "9 Đường Núi"],
      },
    ]);
  });

  it("cùng nhà hàng, chỉ đổi SĐT → nhãn kèm tên quán", () => {
    const changes = diffXeMailSnapshot(
      snap(base),
      snap(withCell(base, 0, { anToi: "Nhà hàng Biển Mẫu\n1 Đường Biển\n0900000009" })),
    );
    expect(changes).toEqual([
      { key: "ngay:0:an_toi", label: "Ngày 1 (16/9) · Ăn tối — Nhà hàng Biển Mẫu", truoc: ["0900000002"], nay: ["0900000009"] },
    ]);
  });

  it("chỉ đảo thứ tự cảnh điểm → 'đổi thứ tự' kèm đủ 2 danh sách", () => {
    const changes = diffXeMailSnapshot(snap(base), snap(withCell(base, 1, { chuongTrinh: "Hội An\n• Phố cổ\n• Chùa Cầu" })));
    expect(changes).toEqual([
      {
        key: "ngay:1:chuong_trinh",
        label: "Ngày 2 (17/9) · Chương trình (đổi thứ tự)",
        truoc: ["Hội An", "• Chùa Cầu", "• Phố cổ"],
        nay: ["Hội An", "• Phố cổ", "• Chùa Cầu"],
      },
    ]);
  });

  it("thêm / bỏ ngày cuối", () => {
    const them: XeMailInput = {
      ...base,
      ngayVe: "2026-09-18",
      cells: [...base.cells, { ngay_date: "2026-09-18", thu: "T6", chuongTrinh: "Đà Nẵng\n• Tiễn sân bay", anTrua: "", anToi: "", khachSan: "" }],
    };
    expect(diffXeMailSnapshot(snap(base), snap(them))).toEqual([
      { key: "ngay_ve", label: "Ngày tiễn", truoc: ["17/09/2026"], nay: ["18/09/2026"] },
      { key: "ngay:2", label: "Thêm ngày 3 (18/9)", truoc: [], nay: ["Đà Nẵng", "• Tiễn sân bay"] },
    ]);
    expect(diffXeMailSnapshot(snap(them), snap(base))).toEqual([
      { key: "ngay_ve", label: "Ngày tiễn", truoc: ["18/09/2026"], nay: ["17/09/2026"] },
      { key: "bo_ngay:2", label: "Bỏ ngày 3 (18/9)", truoc: ["Đà Nẵng", "• Tiễn sân bay"], nay: [] },
    ]);
  });

  it("dời cả đoàn sang hôm sau → chỉ báo ngày đón / tiễn, không báo đổi từng ngày", () => {
    expect(diffXeMailSnapshot(snap(base), snap(doiNgaySau)).map((c) => c.key)).toEqual(["ngay_di", "ngay_ve"]);
  });
});

describe("parseXeMailSnapshot", () => {
  it("chưa có / sai khuôn → null", () => {
    expect(parseXeMailSnapshot(null)).toBeNull();
    expect(parseXeMailSnapshot("abc")).toBeNull();
    expect(parseXeMailSnapshot([])).toBeNull();
    expect(parseXeMailSnapshot({ v: 2, ngay: [] })).toBeNull();
    expect(parseXeMailSnapshot({ v: 1 })).toBeNull();
  });

  it("qua jsonb (JSON) rồi đọc lại → y hệt, so ra không đổi", () => {
    const s = buildXeMailSnapshot(base);
    const back = parseXeMailSnapshot(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(diffXeMailSnapshot(back!, buildXeMailSnapshot(base))).toEqual([]);
  });

  it("một ngày hỏng khuôn vẫn giữ đúng vị trí các ngày sau", () => {
    const raw = JSON.parse(JSON.stringify(buildXeMailSnapshot(base)));
    raw.ngay[0] = "hỏng";
    const back = parseXeMailSnapshot(raw);
    expect(back?.ngay).toHaveLength(2);
    expect(back?.ngay[1].chuong_trinh).toContain("Chùa Cầu");
  });
});
