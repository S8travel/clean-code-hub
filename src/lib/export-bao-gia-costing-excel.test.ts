import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildCostingXlsxSheet, costingFileName } from "./export-bao-gia-costing-excel";
import { buildXlsxBlob, type XlsxCell } from "./xlsx-simple";
import type { CostingSheet, CostingRow } from "@/components/bao-gia/detail/helpers";

const row = (p: Partial<CostingRow> & Pick<CostingRow, "loai" | "unit" | "mo_ta" | "don_gia">): CostingRow => ({
  itemIndex: 0, ngay_so: 1, don_gia_usd: p.don_gia / 26000, so_luong: 1,
  foc_manual: null, editable: true, cells: [], ...p,
});

/** Bảng đầy đủ như app dựng thật: 2 bậc, đủ 4 nhóm + đủ 9 dòng footer.
 *  Số liệu tự nhất quán (tổng vốn = dịch vụ + HDV + BH + tip …) để test kiểm
 *  chứng được công thức tái tạo ĐÚNG con số. */
function makeSheet(): CostingSheet {
  const configs = [{ guests: 16, pax: 17, rooms: 9 }, { guests: 20, pax: 21, rooms: 11 }];
  const xr = 26_000, profitUsd = 50, soNgay = 4;
  const groups: CostingSheet["groups"] = [
    {
      key: "transport", label: "Xe / Vận chuyển", subtotals: [5_000_000, 5_000_000],
      rows: [row({
        loai: "transport", unit: "lump", mo_ta: "Xe 29 chỗ", don_gia: 5_000_000, ngay_so: 0,
        cells: [{ guests: 16, qty: 1, foc: 0, total: 5_000_000 }, { guests: 20, qty: 1, foc: 0, total: 5_000_000 }],
      })],
    },
    {
      key: "hotel", label: "Khách sạn", subtotals: [10_800_000, 13_200_000],
      rows: [row({
        loai: "hotel", unit: "rooms", mo_ta: "KS 4* Đà Nẵng", don_gia: 1_200_000, so_luong: 1,
        cells: [{ guests: 16, qty: 9, foc: 0, total: 10_800_000 }, { guests: 20, qty: 11, foc: 0, total: 13_200_000 }],
      })],
    },
    {
      key: "meal", label: "Ăn uống", subtotals: [4_800_000, 6_000_000],
      rows: [row({
        loai: "meal", unit: "pax", mo_ta: "Cơm trưa NH ABC", ten_zh: "午餐", don_gia: 300_000,
        bua_an: "trua", foc_khach: 16, foc_mien: 1,
        cells: [{ guests: 16, qty: 17, foc: 1, total: 4_800_000 }, { guests: 20, qty: 21, foc: 1, total: 6_000_000 }],
      })],
    },
    { key: "ticket", label: "Vé tham quan", rows: [], subtotals: [0, 0] },
  ];
  const dichVu = configs.map((_, ti) => groups.reduce((s, g) => s + g.subtotals[ti], 0));
  const hdv = configs.map(() => 200_000 * soNgay);
  const baoHiem = configs.map((c) => 100_000 * c.pax);
  const tip = configs.map(() => 500_000);
  const tongVon = configs.map((_, ti) => dichVu[ti] + hdv[ti] + baoHiem[ti] + tip[ti]);
  const loiNhuan = configs.map((c) => Math.round(profitUsd * xr * c.guests));
  const giaBan = configs.map((_, ti) => tongVon[ti] + loiNhuan[ti]);
  const giaPax = configs.map((c, ti) => Math.round(giaBan[ti] / c.guests));
  return {
    guests: [16, 20], configs, xr, groups,
    footer: [
      { key: "dich_vu", label: "Cộng dịch vụ", values: dichVu, kind: "cost" },
      { key: "hdv", label: "Hướng dẫn viên", values: hdv, kind: "cost" },
      { key: "bao_hiem", label: "Bảo hiểm", values: baoHiem, kind: "cost" },
      { key: "tip", label: "Tip", values: tip, kind: "cost" },
      { key: "tong_von", label: "TỔNG CHI PHÍ VỐN", values: tongVon, kind: "total" },
      { key: "loi_nhuan", label: "Lợi nhuận (50.00 USD/khách)", values: loiNhuan, kind: "profit" },
      { key: "gia_pax", label: "GIÁ BÁN / KHÁCH", values: giaPax, kind: "price" },
      { key: "usd_pax", label: "≈ USD / khách", values: giaPax.map((g) => g / xr), kind: "usd" },
      { key: "bien", label: "Biên lợi nhuận %", values: giaBan.map((b, ti) => loiNhuan[ti] / b * 100), kind: "pct" },
    ],
  };
}

const sheet = makeSheet();
const meta = { tenChuongTrinh: "Đà Nẵng 4N3Đ", maBg: "BG00012", soNgay: 4, profitUsd: 50 };
const flat = (xs: XlsxCell[][]) => xs.map((r) => r.map((c) => String(c.value)).join("|"));

describe("buildCostingXlsxSheet — bảng tính giá song ngữ", () => {
  const out = buildCostingXlsxSheet(sheet, meta);
  const lines = flat(out.rows);
  // Nhãn tham số ("Bảo hiểm / khách") trùng tiền tố với nhãn footer ("Bảo hiểm")
  // → phân biệt bằng colSpan ô đầu: tham số gộp 2 ô, footer/cộng nhóm gộp 8.
  const findBy = (span: number) => (pre: string) => {
    const i = out.rows.findIndex((r) => (r[0]?.colSpan ?? 1) === span && String(r[0]?.value).startsWith(pre));
    return { cells: out.rows[i], rowNo: i + 1 };
  };
  /** Dòng footer / cộng nhóm, kèm số dòng Excel (1-based). */
  const find = findBy(8);
  /** Dòng trong khối THAM SỐ. */
  const findParam = findBy(2);
  const byName = (name: string) => {
    const i = out.rows.findIndex((r) => r[1]?.value === name);
    return { cells: out.rows[i], rowNo: i + 1 };
  };

  it("số cột = 8 cố định + 2 cột / bậc số khách", () => {
    expect(out.columns).toHaveLength(8 + 2 * 2);
  });

  it("mọi dòng có nội dung đều trải đúng hết chiều ngang bảng", () => {
    const totalCols = out.columns.length;
    for (const r of out.rows) {
      const span = r.reduce((s, c) => s + (c.colSpan ?? 1), 0);
      const rong = r.every((c) => String(c.value ?? "") === "");
      if (!rong) expect(span).toBe(totalCols);
    }
  });

  it("có tiêu đề + thông tin đầu file song ngữ", () => {
    expect(lines[0]).toContain("旅遊報價計算表");
    expect(lines.some((l) => l.includes("行程") && l.includes("Đà Nẵng 4N3Đ"))).toBe(true);
  });

  it("khối THAM SỐ để số ở ô C, sửa được", () => {
    const xr = findParam("Tỷ giá 匯率");
    expect(xr.cells[1].value).toBe(26_000);
    expect(xr.cells[1].colSpan ?? 1).toBe(1);          // ô đơn → công thức trỏ được
    expect(findParam("Lợi nhuận 利潤").cells[1].value).toBe(50);
    expect(findParam("Số ngày 天數").cells[1].value).toBe(4);
    // HDV / BH / Tip suy ngược từ footer → đúng đơn giá gốc, không hardcode lại
    expect(findParam("HDV / ngày").cells[1].value).toBe(200_000);
    expect(findParam("Bảo hiểm / khách").cells[1].value).toBe(100_000);
    expect(findParam("Tip / đoàn").cells[1].value).toBe(500_000);
  });

  it("tiêu đề cột có tiếng Trung + mỗi bậc 2 cột SL / Thành tiền", () => {
    const hdr = lines.find((l) => l.startsWith("Ngày 日期"))!;
    expect(hdr).toContain("中文名稱");
    expect(hdr).toContain("FOC 免費");
    expect(hdr.match(/SL 數量/g)).toHaveLength(2);
    expect(hdr.match(/Thành tiền 金額/g)).toHaveLength(2);
    const dai = lines.find((l) => l.includes("16 khách / 16人"))!;
    expect(dai).toContain("9 phòng 房");
    expect(out.freezeRows).toBeGreaterThan(0);
  });

  it("dòng dịch vụ: SL là SỐ đã trừ FOC, tiền là công thức ĐG × N × SL", () => {
    const { cells: r, rowNo } = byName("Cơm trưa NH ABC");
    expect(r[0].value).toBe("D1·Trưa 午");
    expect(r[2].value).toBe("午餐");        // cột 中文名稱
    expect(r[3].value).toBe("Khách 人");
    expect(r[5].value).toBe(300_000);
    expect(r[7].value).toBe("16免1");        // FOC theo chính sách
    expect(r[8].value).toBe(16);             // 17 pax − 1 miễn, ô SỐ để công thức nhân
    expect(r[9].value).toBe(4_800_000);
    expect(r[9].formula).toBe(`F${rowNo}*G${rowNo}*I${rowNo}`);
    expect(r[11].formula).toBe(`F${rowNo}*G${rowNo}*K${rowNo}`);  // bậc 2
    // ĐG USD quy đổi từ ĐG VND qua ô tham số tỷ giá
    expect(r[4].value).toBeCloseTo(300_000 / 26_000, 9);
    expect(r[4].formula).toMatch(/^F\d+\/\$C\$\d+$/);
  });

  it("dòng xe trọn gói: không có SL, công thức chỉ ĐG × N", () => {
    const { cells: r, rowNo } = byName("Xe 29 chỗ");
    expect(r[0].value).toBe("");     // lump không gắn ngày
    expect(r[3].value).toBe("Trọn gói 總價");
    expect(r[8].value).toBe("—");
    expect(r[9].value).toBe(5_000_000);
    expect(r[9].formula).toBe(`F${rowNo}*G${rowNo}`);
  });

  it("nhóm rỗng vẫn in dải tiêu đề + ghi (chưa có), cộng nhóm để số tĩnh", () => {
    expect(lines.some((l) => l.includes("VÉ THAM QUAN 景點門票"))).toBe(true);
    expect(lines.some((l) => l.includes("(chưa có 無)"))).toBe(true);
    const sub = find("Cộng vé tham quan");
    expect(sub.cells[2].value).toBe(0);
    expect(sub.cells[2].formula).toBeUndefined();   // không SUM dải rỗng
  });

  it("cộng nhóm = SUM dải dòng của nhóm, đặt đúng cột Thành tiền", () => {
    const an = byName("Cơm trưa NH ABC");
    const sub = find("Cộng ăn uống");
    expect(sub.cells[0].colSpan).toBe(8);
    expect(sub.cells[1].value).toBe("");        // cột SL bỏ trống
    expect(sub.cells[2].value).toBe(4_800_000);
    expect(sub.cells[2].formula).toBe(`SUM(J${an.rowNo}:J${an.rowNo})`);
    expect(sub.cells[4].formula).toBe(`SUM(L${an.rowNo}:L${an.rowNo})`);
  });

  it("footer cộng dồn bằng công thức, không phải số chết", () => {
    const dv = find("Cộng dịch vụ");
    const tv = find("TỔNG CHI PHÍ VỐN");
    const ln = find("Lợi nhuận");
    const gia = find("GIÁ BÁN / KHÁCH");
    const usd = find("≈ USD / khách");
    const bien = find("Biên lợi nhuận");

    // Cộng dịch vụ = cộng 4 ô "cộng nhóm"
    expect(dv.cells[2].formula).toMatch(/^J\d+\+J\d+\+J\d+\+J\d+$/);
    // Tổng vốn = cộng 4 dòng chi phí phía trên (dịch vụ + HDV + BH + tip)
    expect(tv.cells[2].formula).toBe(
      [dv.rowNo, find("Hướng dẫn viên").rowNo, find("Bảo hiểm 保險").rowNo, find("Tip 小費").rowNo]
        .map((r) => `J${r}`).join("+"),
    );
    expect(ln.cells[2].formula).toMatch(/^ROUND\(\$C\$\d+\*\$C\$\d+\*16,0\)$/);
    expect(gia.cells[2].formula).toBe(`ROUND((J${tv.rowNo}+J${ln.rowNo})/16,0)`);
    expect(usd.cells[2].formula).toMatch(new RegExp(`^J${gia.rowNo}/\\$C\\$\\d+$`));
    expect(bien.cells[2].formula).toBe(
      `IF((J${tv.rowNo}+J${ln.rowNo})=0,0,(J${ln.rowNo})/(J${tv.rowNo}+J${ln.rowNo})*100)`,
    );
  });

  it("giá trị cache của MỌI ô công thức = đúng con số app đã tính", () => {
    // sheet gốc tự nhất quán → không ô nào được rơi về số tĩnh vì lệch.
    const f = sheet.footer;
    const at = (key: string, ti: number) => find(f.find((x) => x.key === key)!.label).cells[2 + ti * 2];
    for (const key of ["dich_vu", "hdv", "bao_hiem", "tong_von", "loi_nhuan", "gia_pax", "usd_pax", "bien"]) {
      const src = f.find((x) => x.key === key)!;
      for (let ti = 0; ti < 2; ti++) {
        expect(at(key, ti).value).toBe(src.values[ti]);
        expect(at(key, ti).formula, `${key} bậc ${ti}`).toBeTruthy();
      }
    }
  });

  it("có tỷ giá VCB → biên lợi nhuận cộng thêm chênh lệch tỷ giá", () => {
    const vcb = 26_500;
    const s2 = makeSheet();
    const giaBan = s2.footer.find((x) => x.key === "tong_von")!.values
      .map((tv, ti) => tv + s2.footer.find((x) => x.key === "loi_nhuan")!.values[ti]);
    const ln = s2.footer.find((x) => x.key === "loi_nhuan")!.values;
    s2.footer.find((x) => x.key === "bien")!.values = giaBan.map((b, ti) =>
      (ln[ti] + Math.round(b * (vcb - s2.xr) / s2.xr)) / b * 100);
    const o2 = buildCostingXlsxSheet(s2, { ...meta, vcbRate: vcb });
    const bien = o2.rows.find((r) => String(r[0].value).startsWith("Biên lợi nhuận"))!;
    expect(bien[2].formula).toContain("ROUND(");
    expect(bien[2].formula).toContain("-$C$");     // (vcb − tỷ giá) / tỷ giá
    expect(bien[2].value).toBeCloseTo(s2.footer.find((x) => x.key === "bien")!.values[0], 9);
  });

  it("app đổi cách tính mà file chưa theo kịp → BỎ công thức, giữ số tĩnh", () => {
    const s3 = makeSheet();
    s3.footer.find((x) => x.key === "tong_von")!.values[0] += 1_234;   // số không còn khớp
    const o3 = buildCostingXlsxSheet(s3, meta);
    const tv = o3.rows.find((r) => String(r[0].value).startsWith("TỔNG CHI PHÍ VỐN"))!;
    expect(tv[2].formula).toBeUndefined();
    expect(tv[2].value).toBe(s3.footer.find((x) => x.key === "tong_von")!.values[0]);
    expect(tv[4].formula).toBeTruthy();            // bậc 2 vẫn khớp → vẫn có công thức
  });

  it("footer thiếu dòng (bảng rút gọn) → không gắn công thức treo lơ lửng", () => {
    const s4: CostingSheet = {
      ...makeSheet(),
      footer: [{ key: "tong_von", label: "TỔNG CHI PHÍ VỐN", values: [1, 2], kind: "total" }],
    };
    const o4 = buildCostingXlsxSheet(s4, meta);
    const tv = o4.rows.find((r) => String(r[0].value).startsWith("TỔNG CHI PHÍ VỐN"))!;
    expect(tv[2].formula).toBeUndefined();
    expect(tv[2].value).toBe(1);
  });

  // Writer .xlsx là hàng tự viết (zip + XML thuần) → phải chứng minh file mở
  // ĐƯỢC, nhất là khi có ô gộp + chữ Hán + công thức. Đọc ngược bằng thư viện xlsx.
  it("file .xlsx dựng ra đọc ngược lại được, chữ Hán không vỡ mã, công thức còn nguyên", async () => {
    // jsdom chưa có Blob.arrayBuffer() → đọc qua FileReader.
    const blob = buildXlsxBlob(out, new Date(2026, 6, 31));
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(wb.SheetNames[0]).toContain("報價計算");
    const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    const text = grid.map((r) => r.join("|")).join("\n");
    expect(text).toContain("旅遊報價計算表");
    expect(text).toContain("午餐");           // tên dịch vụ tiếng Trung
    expect(text).toContain("Thành tiền 金額");
    expect(text).toContain("4,800,000");      // đã ăn định dạng #,##0 của file
    // 2 numFmt mới phải sống: ĐG USD 2 số lẻ và biên lợi nhuận có đuôi %
    expect(text).toContain("11.54");
    expect(text).toMatch(/利潤率\|+\d+\.\d%/);

    // Tiền phải là Ô SỐ thật + mang công thức Excel hiểu được.
    const an = byName("Cơm trưa NH ABC");
    const cell = ws[`J${an.rowNo}`] as { v: number; t: string; f?: string };
    expect(cell.t).toBe("n");
    expect(cell.v).toBe(4_800_000);
    expect(cell.f).toBe(`F${an.rowNo}*G${an.rowNo}*I${an.rowNo}`);
  });

  it("tên file có mã báo giá + ngày, bỏ ký tự cấm", () => {
    const f = costingFileName({ ...meta, tenChuongTrinh: 'Tour A/B: "hè"' }, new Date(2026, 6, 31));
    expect(f).toBe("Bang-tinh-gia_BG00012_Tour A-B- -hè-_20260731.xlsx");
    expect(f).not.toMatch(/[\\/:*?"<>|]/);
  });
});
