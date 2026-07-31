import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildCostingXlsxSheet, costingFileName } from "./export-bao-gia-costing-excel";
import { buildXlsxBlob } from "./xlsx-simple";
import type { CostingSheet, CostingRow } from "@/components/bao-gia/detail/helpers";

const row = (p: Partial<CostingRow> & Pick<CostingRow, "loai" | "unit" | "mo_ta" | "don_gia">): CostingRow => ({
  itemIndex: 0, ngay_so: 1, don_gia_usd: p.don_gia / 26000, so_luong: 1,
  foc_manual: null, editable: true, cells: [], ...p,
});

const sheet: CostingSheet = {
  guests: [16, 20],
  configs: [{ guests: 16, pax: 17, rooms: 9 }, { guests: 20, pax: 21, rooms: 11 }],
  xr: 26000,
  groups: [
    {
      key: "transport", label: "Xe / Vận chuyển", subtotals: [5_000_000, 5_000_000],
      rows: [row({
        loai: "transport", unit: "lump", mo_ta: "Xe 29 chỗ", don_gia: 5_000_000, ngay_so: 0,
        cells: [{ guests: 16, qty: 1, foc: 0, total: 5_000_000 }, { guests: 20, qty: 1, foc: 0, total: 5_000_000 }],
      })],
    },
    { key: "hotel", label: "Khách sạn", rows: [], subtotals: [0, 0] },
    {
      key: "meal", label: "Ăn uống", subtotals: [4_800_000, 6_000_000],
      rows: [row({
        loai: "meal", unit: "pax", mo_ta: "Cơm trưa NH ABC", ten_zh: "午餐", don_gia: 300_000,
        bua_an: "trua", foc_khach: 16, foc_mien: 1,
        cells: [{ guests: 16, qty: 17, foc: 1, total: 4_800_000 }, { guests: 20, qty: 21, foc: 1, total: 6_000_000 }],
      })],
    },
    { key: "ticket", label: "Vé tham quan", rows: [], subtotals: [0, 0] },
  ],
  footer: [
    { key: "tong_von", label: "TỔNG CHI PHÍ VỐN", values: [9_800_000, 11_000_000], kind: "total" },
    { key: "gia_pax", label: "GIÁ BÁN / KHÁCH", values: [900_000, 800_000], kind: "price" },
    { key: "usd_pax", label: "≈ USD / khách", values: [34.615, 30.769], kind: "usd" },
    { key: "bien", label: "Biên lợi nhuận %", values: [12.34, 10], kind: "pct" },
  ],
};

const meta = { tenChuongTrinh: "Đà Nẵng 4N3Đ", maBg: "BG00012", soNgay: 4, profitUsd: 50 };
const flat = (xs: { value: string | number }[][]) => xs.map((r) => r.map((c) => String(c.value)).join("|"));

describe("buildCostingXlsxSheet — bảng tính giá song ngữ", () => {
  const out = buildCostingXlsxSheet(sheet, meta);
  const lines = flat(out.rows);

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
    expect(lines.some((l) => l.includes("匯率") && l.includes("26.000"))).toBe(true);
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

  it("dòng dịch vụ: giữ tên tiếng Trung, đơn vị, và SL đã trừ FOC", () => {
    const r = out.rows.find((x) => x[1]?.value === "Cơm trưa NH ABC")!;
    expect(r[0].value).toBe("D1·Trưa 午");
    expect(r[2].value).toBe("午餐");        // cột 中文名稱
    expect(r[3].value).toBe("Khách 人");
    expect(r[4].value).toBe("11.54");        // ĐG USD giữ 2 số lẻ
    expect(r[5].value).toBe(300_000);
    expect(r[7].value).toBe("16免1");        // FOC theo chính sách
    expect(r[8].value).toBe("17−1");         // SL bậc 16 khách: 17 pax − 1 miễn
    expect(r[9].value).toBe(4_800_000);
  });

  it("dòng xe trọn gói: không có SL, tiền lặp theo từng bậc", () => {
    const r = out.rows.find((x) => x[1]?.value === "Xe 29 chỗ")!;
    expect(r[0].value).toBe("");     // lump không gắn ngày
    expect(r[3].value).toBe("Trọn gói 總價");
    expect(r[8].value).toBe("—");
    expect(r[9].value).toBe(5_000_000);
  });

  it("nhóm rỗng vẫn in dải tiêu đề + ghi (chưa có)", () => {
    expect(lines.some((l) => l.includes("KHÁCH SẠN 飯店"))).toBe(true);
    expect(lines.some((l) => l.includes("(chưa có 無)"))).toBe(true);
  });

  it("cộng nhóm + footer đặt số vào ĐÚNG cột Thành tiền để Excel cộng được", () => {
    const sub = out.rows.find((x) => String(x[0].value).startsWith("Cộng ăn uống"))!;
    expect(sub[0].colSpan).toBe(8);
    expect(sub[1].value).toBe("");        // cột SL bỏ trống
    expect(sub[2].value).toBe(4_800_000);
    expect(sub[4].value).toBe(6_000_000);
    const tong = out.rows.find((x) => String(x[0].value).startsWith("TỔNG CHI PHÍ VỐN"))!;
    expect(tong[0].value).toContain("總成本");
    expect(tong[2].value).toBe(9_800_000);
  });

  it("USD và % xuất dạng chuỗi — numFmt của file chỉ có #,##0 nên số lẻ sẽ mất", () => {
    const usd = out.rows.find((x) => String(x[0].value).includes("每人美金"))!;
    expect(usd[2].value).toBe("34.62");
    const pct = out.rows.find((x) => String(x[0].value).includes("利潤率"))!;
    expect(pct[2].value).toBe("12.3%");
  });

  // Writer .xlsx là hàng tự viết (zip + XML thuần) → phải chứng minh file mở
  // ĐƯỢC, nhất là khi có ô gộp + chữ Hán. Đọc ngược lại bằng thư viện xlsx.
  it("file .xlsx dựng ra đọc ngược lại được, chữ Hán không vỡ mã", async () => {
    // jsdom chưa có Blob.arrayBuffer() → đọc qua FileReader.
    const blob = buildXlsxBlob(out, new Date(2026, 6, 31));
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(wb.SheetNames[0]).toContain("報價計算");
    const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    const text = grid.map((r) => r.join("|")).join("\n");
    expect(text).toContain("旅遊報價計算表");
    expect(text).toContain("午餐");           // tên dịch vụ tiếng Trung
    expect(text).toContain("Thành tiền 金額");
    expect(text).toContain("4,800,000");      // đã ăn định dạng #,##0 của file
    // Tiền phải là Ô SỐ thật (Excel cộng được), không phải chuỗi.
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
    const dongAn = raw.find((r) => r[1] === "Cơm trưa NH ABC")!;
    expect(dongAn[9]).toBe(4_800_000);
    expect(typeof dongAn[9]).toBe("number");
  });

  it("tên file có mã báo giá + ngày, bỏ ký tự cấm", () => {
    const f = costingFileName({ ...meta, tenChuongTrinh: 'Tour A/B: "hè"' }, new Date(2026, 6, 31));
    expect(f).toBe("Bang-tinh-gia_BG00012_Tour A-B- -hè-_20260731.xlsx");
    expect(f).not.toMatch(/[\\/:*?"<>|]/);
  });
});
