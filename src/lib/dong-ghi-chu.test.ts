import { describe, it, expect } from "vitest";
import {
  docDongGhiChu, tachDongGhiChu, tronDongGhiChu, diffDongGhiChu, laDongGhiChu,
  type DongGhiChu,
} from "./dong-ghi-chu";

type Dong = { canh_diem_id: number; dong_ghi_chu?: string };
const cd = (id: number): Dong => ({ canh_diem_id: id });
const gc = (noi_dung: string): Dong => ({ canh_diem_id: 0, dong_ghi_chu: noi_dung });
const tron = (canhDiem: Dong[], ghiChu: DongGhiChu[]) =>
  tronDongGhiChu(canhDiem, ghiChu, (g) => gc(g.noi_dung));

describe("laDongGhiChu", () => {
  it("dòng có dong_ghi_chu (kể cả rỗng lúc đang gõ) là dòng ghi chú; dòng trống chưa chọn thì không", () => {
    expect(laDongGhiChu(gc("Bay VN1823"))).toBe(true);
    expect(laDongGhiChu(gc(""))).toBe(true);
    expect(laDongGhiChu(cd(0))).toBe(false);
    expect(laDongGhiChu(cd(5))).toBe(false);
  });
});

describe("tachDongGhiChu — màn hình → DB", () => {
  it("mốc = số cảnh điểm đứng trước: đầu ngày, giữa, cuối ngày", () => {
    const items = [gc("Bay VN1823 07:00"), cd(1), cd(2), gc("Tự do mua sắm"), cd(3), gc("19:00 Gala dinner")];
    expect(tachDongGhiChu(items)).toEqual([
      { sau: 0, noi_dung: "Bay VN1823 07:00" },
      { sau: 2, noi_dung: "Tự do mua sắm" },
      { sau: 3, noi_dung: "19:00 Gala dinner" },
    ]);
  });

  it("dòng trống chưa chọn cảnh điểm KHÔNG tính vào mốc (lưu xong nó biến mất)", () => {
    expect(tachDongGhiChu([cd(1), cd(0), gc("A"), cd(0)])).toEqual([{ sau: 1, noi_dung: "A" }]);
  });

  it("cắt khoảng trắng hai đầu, giữ xuống dòng bên trong; dòng rỗng / toàn khoảng trắng bị bỏ", () => {
    expect(tachDongGhiChu([gc("  Bay VN1823\nĐón tại sân bay  "), gc("   "), gc("")])).toEqual([
      { sau: 0, noi_dung: "Bay VN1823\nĐón tại sân bay" },
    ]);
  });

  it("ngày không có dòng ghi chú → mảng rỗng (khớp DEFAULT '[]' của cột)", () => {
    expect(tachDongGhiChu([cd(1), cd(2)])).toEqual([]);
  });

  it("khoá dựng theo thứ tự jsonb trả về (sau trước noi_dung) — để lần lưu sau nhận ra y nguyên", () => {
    const [g] = tachDongGhiChu([gc("A")]);
    expect(Object.keys(g)).toEqual(["sau", "noi_dung"]);
  });
});

describe("tronDongGhiChu — DB → màn hình", () => {
  it("chèn đúng chỗ, giữ thứ tự cảnh điểm", () => {
    const kq = tron([cd(1), cd(2), cd(3)], [
      { sau: 0, noi_dung: "Bay" }, { sau: 2, noi_dung: "Tự do" }, { sau: 3, noi_dung: "Gala" },
    ]);
    expect(kq).toEqual([gc("Bay"), cd(1), cd(2), gc("Tự do"), cd(3), gc("Gala")]);
  });

  it("nhiều dòng cùng mốc giữ đúng thứ tự trong mảng", () => {
    expect(tron([cd(1)], [{ sau: 1, noi_dung: "A" }, { sau: 0, noi_dung: "B" }, { sau: 1, noi_dung: "C" }]))
      .toEqual([gc("B"), cd(1), gc("A"), gc("C")]);
  });

  it("dòng rác canh_diem_id 0/NULL không tính vào mốc — khớp cách đếm lúc tách", () => {
    const rac = { canh_diem_id: null as unknown as number };
    expect(tron([rac, cd(1), cd(2)], [{ sau: 0, noi_dung: "Bay" }, { sau: 1, noi_dung: "Tự do" }]))
      .toEqual([rac, gc("Bay"), cd(1), gc("Tự do"), cd(2)]);
  });

  it("mốc vượt số cảnh điểm (cảnh điểm bị gỡ chỗ khác, vd áp seri) → dồn xuống cuối, không mất dòng", () => {
    expect(tron([cd(1)], [{ sau: 4, noi_dung: "Gala" }])).toEqual([cd(1), gc("Gala")]);
    expect(tron([], [{ sau: 2, noi_dung: "Bay" }])).toEqual([gc("Bay")]);
  });

  it("đi một vòng màn hình → DB → màn hình ra y nguyên (bỏ dòng trống)", () => {
    const manHinh = [gc("Bay"), cd(1), cd(0), gc("Tự do"), cd(2), gc("Gala"), gc("Ngủ đêm trên tàu")];
    const canhDiem = manHinh.filter((x) => !laDongGhiChu(x) && x.canh_diem_id > 0);
    expect(tron(canhDiem, tachDongGhiChu(manHinh))).toEqual(manHinh.filter((x) => laDongGhiChu(x) || x.canh_diem_id > 0));
  });
});

describe("docDongGhiChu — đọc cột jsonb", () => {
  it("đọc đúng dữ liệu hợp lệ", () => {
    expect(docDongGhiChu([{ sau: 1, noi_dung: "Bay" }])).toEqual([{ sau: 1, noi_dung: "Bay" }]);
  });

  it("không phải mảng (null, đoàn cũ trước khi có cột) → rỗng", () => {
    expect(docDongGhiChu(null)).toEqual([]);
    expect(docDongGhiChu(undefined)).toEqual([]);
    expect(docDongGhiChu({ sau: 1, noi_dung: "Bay" })).toEqual([]);
  });

  it("phần tử hỏng bị bỏ qua, phần tử tốt vẫn giữ; mốc hỏng/âm/lẻ → về số nguyên ≥ 0", () => {
    expect(docDongGhiChu([
      null, "chuỗi", { sau: 1 }, { noi_dung: "   " }, { noi_dung: 5 },
      { noi_dung: "Không mốc" }, { sau: -3, noi_dung: "Âm" }, { sau: 2.7, noi_dung: "Lẻ" }, { sau: "1", noi_dung: "Mốc chữ" },
    ])).toEqual([
      { sau: 0, noi_dung: "Không mốc" }, { sau: 0, noi_dung: "Âm" }, { sau: 2, noi_dung: "Lẻ" }, { sau: 0, noi_dung: "Mốc chữ" },
    ]);
  });
});

describe("diffDongGhiChu — nhật ký", () => {
  const g = (sau: number, noi_dung: string): DongGhiChu => ({ sau, noi_dung });

  it("thêm và bỏ theo nội dung", () => {
    expect(diffDongGhiChu([g(0, "Bay")], [g(0, "Bay"), g(2, "Gala")])).toEqual({ them: ["Gala"], bo: [] });
    expect(diffDongGhiChu([g(0, "Bay"), g(2, "Gala")], [g(2, "Gala")])).toEqual({ them: [], bo: ["Bay"] });
  });

  it("chỉ kéo đổi chỗ → không ghi gì", () => {
    expect(diffDongGhiChu([g(0, "Bay"), g(2, "Gala")], [g(3, "Bay"), g(0, "Gala")])).toEqual({ them: [], bo: [] });
  });

  it("sửa chữ = bỏ dòng cũ + thêm dòng mới", () => {
    expect(diffDongGhiChu([g(0, "Bay 07:00")], [g(0, "Bay 08:30")])).toEqual({ them: ["Bay 08:30"], bo: ["Bay 07:00"] });
  });

  it("hai dòng trùng chữ được đếm riêng", () => {
    expect(diffDongGhiChu([g(0, "Tự do"), g(1, "Tự do")], [g(0, "Tự do")])).toEqual({ them: [], bo: ["Tự do"] });
  });
});
