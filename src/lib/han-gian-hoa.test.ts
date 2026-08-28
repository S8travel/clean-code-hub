import { describe, it, expect } from "vitest";
import { gianHoa, SO_CAP_PHON_GIAN, _CAP_PHON_GIAN_THO } from "./han-gian-hoa";

// Bảng này gõ tay hàng trăm cặp nên nguy cơ lớn nhất KHÔNG phải logic sai mà là
// GÕ LỆCH MỘT KÝ TỰ — lệch một cái là mọi cặp phía sau xê dịch và bảng biến thành
// rác im lặng. Bốn test đầu là để bắt đúng chuyện đó.

describe("bảng phồn→giản tự kiểm cấu trúc", () => {
  it("độ dài chẵn — thiếu một chữ là lệch hết phần sau", () => {
    expect(_CAP_PHON_GIAN_THO.length % 2).toBe(0);
  });

  it("không chữ nào tự map về chính nó (dấu hiệu gõ lệch)", () => {
    const loi: string[] = [];
    for (let i = 0; i < _CAP_PHON_GIAN_THO.length; i += 2) {
      if (_CAP_PHON_GIAN_THO[i] === _CAP_PHON_GIAN_THO[i + 1]) {
        loi.push(`vị trí ${i}: ${_CAP_PHON_GIAN_THO[i]}`);
      }
    }
    expect(loi).toEqual([]);
  });

  it("không khai trùng một chữ phồn thể hai lần", () => {
    const daGap = new Set<string>();
    const trung: string[] = [];
    for (let i = 0; i < _CAP_PHON_GIAN_THO.length; i += 2) {
      const c = _CAP_PHON_GIAN_THO[i];
      if (daGap.has(c)) trung.push(c);
      daGap.add(c);
    }
    expect(trung).toEqual([]);
  });

  it("mọi ký tự đều là chữ Hán — lọt chữ Latin/khoảng trắng là gõ nhầm", () => {
    const xau = [..._CAP_PHON_GIAN_THO].filter((c) => !/\p{Script=Han}/u.test(c));
    expect(xau).toEqual([]);
  });

  it("phủ đủ rộng để dùng thật", () => {
    expect(SO_CAP_PHON_GIAN).toBeGreaterThan(300);
  });
});

describe("gianHoa", () => {
  it("gộp đúng ca đã đo được trên máy chủ — trước khi nắn chỉ giống nhau 0,09", () => {
    expect(gianHoa("下龍灣遊船")).toBe(gianHoa("下龙湾游船"));
    expect(gianHoa("下龍灣遊船")).toBe("下龙湾游船");
  });

  it("gộp tên dịch vụ hay gặp trong lịch trình đối tác", () => {
    expect(gianHoa("長安生態保護區")).toBe("长安生态保护区");
    expect(gianHoa("電瓶車遊36古街")).toBe("电瓶车游36古街");
    expect(gianHoa("水上木偶戲")).toBe("水上木偶戏");
    expect(gianHoa("豪華日遊船 國賓號")).toBe("豪华日游船 国宾号");
    expect(gianHoa("四星飯店雙人房")).toBe("四星饭店双人房");
    expect(gianHoa("船上自助餐")).toBe("船上自助餐"); // vốn đã giản thể
  });

  it("KHÔNG đụng chữ Latin, chữ số, dấu câu, tiếng Việt", () => {
    expect(gianHoa("Paradise餐廳 8USD")).toBe("Paradise餐厅 8USD");
    expect(gianHoa("Tràng An (du thuyền)")).toBe("Tràng An (du thuyền)");
    expect(gianHoa("")).toBe("");
  });

  it("idempotent — bắt buộc, vì kết quả được lưu xuống DB làm khoá", () => {
    for (const s of ["下龍灣遊船", "長安生態保護區", "河內Capital Garden", "船上自助餐", ""]) {
      expect(gianHoa(gianHoa(s))).toBe(gianHoa(s));
    }
  });

  it("chữ chưa có trong bảng thì giữ nguyên, không bịa", () => {
    // Chữ hiếm ngoài phạm vi du lịch — phải đi qua nguyên vẹn.
    expect(gianHoa("龘")).toBe("龘");
  });
});
