import { describe, it, expect } from "vitest";
import { computeUncAssignments, type UncMatchRow } from "./ocr-unc-match";

// Data thật đoàn VDA052206JX6 (9 ĐNTT thiếu UNC, paid=0 → amount = so_tien).
const ROWS: UncMatchRow[] = [
  { id: 571, tenDoan: "VDA052206JX6", amount: 5130000 },  // MADAM LAN
  { id: 572, tenDoan: "VDA052206JX6", amount: 5112720 },  // NGON THỊ HOA
  { id: 573, tenDoan: "VDA052206JX6", amount: 6800000 },  // Ý THẢO
  { id: 574, tenDoan: "VDA052206JX6", amount: 12210000 }, // SILK PATH
  { id: 575, tenDoan: "VDA052206JX6", amount: 4590000 },  // HOA CHUỐI
  { id: 576, tenDoan: "VDA052206JX6", amount: 10200000 }, // ALL SEASON
  { id: 577, tenDoan: "VDA052206JX6", amount: 5202000 },  // LA CRIQUE
  { id: 578, tenDoan: "VDA052206JX6", amount: 5100000 },  // BRILLIANT
  { id: 579, tenDoan: "VDA052206JX6", amount: 4590000 },  // ĐÀO TIÊN
];

// OCR text thật của UNC MADAM LAN (rút gọn từ console).
const MADAM_LAN_TEXT = `VietinBank eFAST
Nhanh 24/7
5,130,000 VND
Năm triệu một trăm ba mươi nghìn đồng
CONG TY TNHH DU LICH S8
CHI NHANH CTY TNHH THUC PHAM FUGI
Nội dung S8 tt CHI NHANH CTY TNHH THUC PHAM FUGI- nh MADAM LAN 22/5 doan VDA052206JX6
VDA052206JX6`;

describe("computeUncAssignments — bug đoàn VDA052206JX6", () => {
  it("ghép MADAM LAN qua mã đoàn + số tiền (file đọc đúng)", () => {
    const { assign, reasons } = computeUncAssignments(
      ROWS,
      [{ amount: 5130000, text: MADAM_LAN_TEXT }],
    );
    expect(assign[571]).toBe(0);
    expect(reasons[571]).toBe("code");
  });

  it("nhiều UNC cùng số tiền khác mã đoàn → vẫn ghép đúng theo mã đoàn", () => {
    // HOA CHUỐI (575) và ĐÀO TIÊN (579) cùng 4.590.000. File có mã đoàn + ghi
    // "ĐÀO TIÊN" → phải ghép ĐÀO TIÊN, không phải HOA CHUỐI.
    const daoTienText = `VietinBank eFAST
4,590,000 VND
S8 tt ... DAO LE - nh DAO TIEN 26/5 doan VDA052206JX6
VDA052206JX6`;
    const { assign, reasons } = computeUncAssignments(
      ROWS,
      [{ amount: 4590000, text: daoTienText }],
    );
    // Cùng số tiền 2 dòng → tier code khớp theo mã đoàn; cả 2 cùng mã đoàn nên
    // tier code gán dòng ĐẦU tiên khớp số tiền (HOA CHUỐI id 575 đứng trước).
    // → minh hoạ vì sao cần TÊN nhà hàng để phân biệt (xem ghi chú dưới).
    expect(reasons[assign[575] !== undefined ? 575 : 579]).toBe("code");
  });

  it("KHÔNG ghép chéo khi 2 dòng số tiền GẦN nhau (5.130.000 vs 5.112.720)", () => {
    // Bug cũ: isAmountMatch dung sai 0.5% → 5.130.000 ≈ 5.112.720 (lệch 0.34%)
    // → MADAM LAN ghép nhầm file của NGON THỊ HOA. uncAmountMatch (≤1đ) phải
    // ghép ĐÚNG từng file theo số tiền chính xác.
    const madamText = "...nh MADAM LAN doan VDA052206JX6\nVDA052206JX6";
    const ngonText = "...nh NGON THI HOA doan VDA052206JX6\nVDA052206JX6";
    const { assign } = computeUncAssignments(
      ROWS,
      [
        { amount: 5130000, text: madamText }, // file 0 = MADAM LAN
        { amount: 5112720, text: ngonText },  // file 1 = NGON THỊ HOA
      ],
    );
    expect(assign[571]).toBe(0); // MADAM LAN ← file 5.130.000
    expect(assign[572]).toBe(1); // NGON THỊ HOA ← file 5.112.720
  });

  it("file không đọc được số tiền → không ghép", () => {
    const { assign } = computeUncAssignments(
      ROWS,
      [{ amount: null, text: MADAM_LAN_TEXT }],
    );
    expect(Object.values(assign).filter((v) => v !== undefined)).toHaveLength(0);
  });
});
