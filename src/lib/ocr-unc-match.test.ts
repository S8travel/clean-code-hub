import { describe, it, expect } from "vitest";
import { computeUncAssignments, type UncMatchRow } from "./ocr-unc-match";

// Data thật đoàn VDA052206JX6 (9 ĐNTT thiếu UNC, paid=0 → amount = so_tien).
// 575 & 579 CÙNG số tiền 4.590.000 + cùng đoàn → phân biệt bằng NCC.
const ROWS: UncMatchRow[] = [
  { id: 571, tenDoan: "VDA052206JX6", amount: 5130000 },  // MADAM LAN
  { id: 572, tenDoan: "VDA052206JX6", amount: 5112720 },  // NGON THỊ HOA
  { id: 573, tenDoan: "VDA052206JX6", amount: 6800000 },  // Ý THẢO
  { id: 574, tenDoan: "VDA052206JX6", amount: 12210000 }, // SILK PATH
  { id: 575, tenDoan: "VDA052206JX6", amount: 4590000, nccName: "CÔNG TY TNHH MỘT THÀNH VIÊN THƯƠNG MẠI DỊCH VỤ PHÚ NGỌC" }, // HOA CHUỐI
  { id: 576, tenDoan: "VDA052206JX6", amount: 10200000 }, // ALL SEASON
  { id: 577, tenDoan: "VDA052206JX6", amount: 5202000 },  // LA CRIQUE
  { id: 578, tenDoan: "VDA052206JX6", amount: 5100000 },  // BRILLIANT
  { id: 579, tenDoan: "VDA052206JX6", amount: 4590000, nccName: "CÔNG TY TNHH MỘT THÀNH VIÊN THƯƠNG MẠI DỊCH VỤ ĐÀO LÊ" }, // ĐÀO TIÊN
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

  it("cùng số tiền + cùng đoàn, KHÔNG có NCC → KHÔNG tự ghép (an toàn)", () => {
    // HOA CHUỐI (575) & ĐÀO TIÊN (579) đều 4.590.000 cùng đoàn. 1 file, OCR
    // không nhận diện được NCC → ambiguous → để user chọn tay (không ghép bừa).
    const text = "VietinBank eFAST\n4,590,000 VND\ndoan VDA052206JX6";
    const { assign } = computeUncAssignments(ROWS, [{ amount: 4590000, text }]);
    expect(assign[575]).toBeUndefined();
    expect(assign[579]).toBeUndefined();
  });

  it("cùng số tiền + cùng đoàn → phân biệt bằng TÊN NCC (người nhận)", () => {
    // 2 file đều 4.590.000: 1 ghi ĐÀO LÊ (ĐÀO TIÊN), 1 ghi PHÚ NGỌC (HOA CHUỐI).
    // OCR tên người nhận KHÔNG dấu → ghép đúng theo NCC.
    const daoLeText = "VietinBank eFAST\n4,590,000 VND\nCONG TY TNHH MTV THUONG MAI DICH VU DAO LE\nnh DAO TIEN doan VDA052206JX6";
    const phuNgocText = "VietinBank eFAST\n4,590,000 VND\nCONG TY TNHH MTV THUONG MAI DICH VU PHU NGOC\nnh HOA CHUOI doan VDA052206JX6";
    const { assign, reasons } = computeUncAssignments(
      ROWS,
      [
        { amount: 4590000, text: daoLeText },   // file 0 = ĐÀO LÊ
        { amount: 4590000, text: phuNgocText }, // file 1 = PHÚ NGỌC
      ],
    );
    expect(assign[579]).toBe(0); // ĐÀO TIÊN (ĐÀO LÊ) ← file 0
    expect(assign[575]).toBe(1); // HOA CHUỐI (PHÚ NGỌC) ← file 1
    expect(reasons[579]).toBe("ncc");
    expect(reasons[575]).toBe("ncc");
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

  it("mã đoàn có chữ 'I' (OCR normalize I→1) vẫn khớp 2 chiều", () => {
    // ten_doan VDC052306IT6; OCR text biến IT6 → 1T6. codeNorm chuẩn hoá cả 2
    // bên cùng cách nên vẫn ghép. Phân biệt 2 dòng cùng tiền bằng NCC.
    const rows: UncMatchRow[] = [
      { id: 1, tenDoan: "VDC052306IT6", amount: 4050000, nccName: "CÔNG TY TNHH MTV THƯƠNG MẠI DỊCH VỤ ĐÀO LÊ" },
      { id: 2, tenDoan: "VDC052306IT6", amount: 4050000, nccName: "CÔNG TY TNHH MTV THƯƠNG MẠI DỊCH VỤ PHÚ NGỌC" },
    ];
    const daoLe = "VietinBank eFAST\n4,050,000 VND\nDICH VU DAO LE nh DAO TIEN doan VDC052306IT6";
    const phuNgoc = "VietinBank eFAST\n4,050,000 VND\nDICH VU PHU NGOC nh HOA CHUOI doan VDC052306IT6";
    const { assign, reasons } = computeUncAssignments(rows, [
      { amount: 4050000, text: daoLe },
      { amount: 4050000, text: phuNgoc },
    ]);
    expect(assign[1]).toBe(0); // ĐÀO LÊ
    expect(assign[2]).toBe(1); // PHÚ NGỌC
    expect(reasons[1]).toBe("ncc");
  });

  it("file không đọc được số tiền → không ghép", () => {
    const { assign } = computeUncAssignments(
      ROWS,
      [{ amount: null, text: MADAM_LAN_TEXT }],
    );
    expect(Object.values(assign).filter((v) => v !== undefined)).toHaveLength(0);
  });
});
