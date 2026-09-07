import { describe, it, expect } from "vitest";
import {
  idGocCua, demBanPhu, xepNhomBaoGia, tenBanPhu, type DongChum,
} from "./bao-gia-nhom";

/** Danh sách vào theo NGÀY TẠO GIẢM DẦN — đúng thứ tự useBaoGiaList trả về. */
const r = (id: number, goc: number | null = null): DongChum => ({ id, bao_gia_goc_id: goc });

describe("idGocCua", () => {
  it("báo giá độc lập thì gốc là chính nó", () => {
    expect(idGocCua(r(10))).toBe(10);
  });

  it("tạo bản phụ TỪ một bản phụ thì gắn vào bản gốc chung, không đẻ chùm hai tầng", () => {
    expect(idGocCua(r(12, 10))).toBe(10);
  });
});

describe("demBanPhu", () => {
  it("đếm theo từng bản gốc, bỏ qua báo giá độc lập", () => {
    const dem = demBanPhu([r(10), r(11), r(12, 10), r(13, 10), r(14, 11)]);
    expect(dem.get(10)).toBe(2);
    expect(dem.get(11)).toBe(1);
    expect(dem.has(12)).toBe(false);
  });

  it("danh sách rỗng thì không nổ", () => {
    expect(demBanPhu([]).size).toBe(0);
  });
});

describe("xepNhomBaoGia", () => {
  const idsCua = (n: ReturnType<typeof xepNhomBaoGia<DongChum>>) =>
    n.map((x) => [x.dau.id, x.con.map((c) => c.id)] as const);

  it("không có bản phụ nào thì mỗi dòng một chùm, giữ nguyên thứ tự", () => {
    expect(idsCua(xepNhomBaoGia([r(13), r(12), r(11)]))).toEqual([
      [13, []], [12, []], [11, []],
    ]);
  });

  it("bản phụ thụt vào dưới bản gốc khi cả hai cùng có mặt", () => {
    // Ngày tạo giảm dần: bản phụ (13, 12) mới hơn nên đứng TRƯỚC bản gốc (10).
    const nhom = xepNhomBaoGia([r(13, 10), r(12, 10), r(11), r(10)]);
    expect(idsCua(nhom)).toEqual([[10, [13, 12]], [11, []]]);
  });

  it("chùm neo theo thành viên gặp đầu tiên — thêm bản phụ là cả chùm nổi lên đầu", () => {
    // Bản gốc 10 cũ hơn 11, nhưng bản phụ 13 của nó mới nhất → chùm đứng trước 11.
    const nhom = xepNhomBaoGia([r(13, 10), r(11), r(10)]);
    expect(nhom[0].dau.id).toBe(10);
    expect(nhom[1].dau.id).toBe(11);
  });

  it("con thứ tự thế nào thì giữ nguyên thế ấy", () => {
    const nhom = xepNhomBaoGia([r(15, 10), r(13, 10), r(14, 10), r(10)]);
    expect(nhom[0].con.map((c) => c.id)).toEqual([15, 13, 14]);
  });

  // ── Gộp nhóm gặp bộ lọc ────────────────────────────────────────────────────
  it("bản gốc bị bộ lọc giấu thì bản phụ đứng riêng, KHÔNG bị nuốt mất", () => {
    // Chỉ bản phụ 12 khớp bộ lọc; bản gốc 10 không có trong danh sách.
    const nhom = xepNhomBaoGia([r(12, 10)]);
    expect(idsCua(nhom)).toEqual([[12, []]]);
    expect(nhom[0].gocVang).toBe(10); // để màn hình vẽ chip "bản phụ của BG00010"
  });

  it("bản gốc có mặt thì không gắn cờ gocVang", () => {
    const nhom = xepNhomBaoGia([r(12, 10), r(10)]);
    expect(nhom[0].gocVang).toBeNull();
  });

  it("mọi dòng khớp đều được vẽ đúng MỘT lần — dòng đếm không nói dối", () => {
    const ds = [r(15, 11), r(14, 10), r(13), r(12, 10), r(11), r(10)];
    const nhom = xepNhomBaoGia(ds);
    const daVe = nhom.flatMap((n) => [n.dau.id, ...n.con.map((c) => c.id)]);
    expect(daVe.length).toBe(ds.length);
    expect(new Set(daVe).size).toBe(ds.length);
  });

  it("bản gốc đã bị xoá (liên kết đứt) cũng cho ra một chùm đứng riêng", () => {
    const nhom = xepNhomBaoGia([r(12, 999), r(11)]);
    expect(idsCua(nhom)).toEqual([[12, []], [11, []]]);
    expect(nhom[0].gocVang).toBe(999);
  });

  // ── Ưu tiên "đối tác chờ trả lời" ──────────────────────────────────────────
  it("chùm có BẤT KỲ thành viên nào đang chờ trả lời đều được đẩy lên đầu", () => {
    // Đang chờ là bản PHỤ 12, không phải bản gốc 10 → vẫn phải lên đầu, kẻo dải
    // cảnh báo nói "đã đưa lên đầu danh sách" mà nhìn bảng không thấy đâu.
    const ds = [r(14), r(13), r(12, 10), r(10)];
    const nhom = xepNhomBaoGia(ds, (x) => x.id === 12);
    expect(nhom[0].dau.id).toBe(10);
    expect(nhom[0].con.map((c) => c.id)).toEqual([12]);
  });

  it("chùm nào cũng không ưu tiên thì thứ tự giữ nguyên (sort ổn định)", () => {
    const nhom = xepNhomBaoGia([r(14), r(13), r(12)], () => false);
    expect(nhom.map((n) => n.dau.id)).toEqual([14, 13, 12]);
  });

  it("nhiều chùm ưu tiên thì giữ nguyên thứ tự tương đối giữa chúng", () => {
    const ds = [r(15), r(14), r(13), r(12)];
    const nhom = xepNhomBaoGia(ds, (x) => x.id === 14 || x.id === 12);
    expect(nhom.map((n) => n.dau.id)).toEqual([14, 12, 15, 13]);
  });

  it("danh sách rỗng trả mảng rỗng", () => {
    expect(xepNhomBaoGia([])).toEqual([]);
  });
});

describe("tenBanPhu", () => {
  it("đánh số tiếp theo số bản phụ đang có", () => {
    expect(tenBanPhu("Đài Loan 5N4Đ", 0)).toBe("Đài Loan 5N4Đ (bản phụ 1)");
    expect(tenBanPhu("Đài Loan 5N4Đ", 2)).toBe("Đài Loan 5N4Đ (bản phụ 3)");
  });

  it("báo giá chưa đặt tên thì để trống, không đẻ ra cái tên trơ trọi", () => {
    expect(tenBanPhu(null, 0)).toBeNull();
    expect(tenBanPhu("   ", 1)).toBeNull();
  });
});
