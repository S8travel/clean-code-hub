import { describe, it, expect } from "vitest";
import { locBaoGia, coDangLoc, ngayTaoVN, chuanHoaTim, type BaoGiaLocRow } from "./bao-gia-loc";

const r = (p: Partial<BaoGiaLocRow> & { id: number }): BaoGiaLocRow => ({
  ma_bg: null,
  tieu_de: null,
  trang_thai: "draft",
  loai_bao_gia: "tu_tinh",
  agent_id: null,
  so_phien_ban_cuoi: 0,
  created_at: "2026-09-03T04:00:00+00:00",
  ...p,
});

const TEN_DOI_TAC: Record<number, string> = { 3: "Mẫu Lữ Hành", 7: "Đài Bắc Travel" };

const rows: BaoGiaLocRow[] = [
  r({ id: 25, ma_bg: "BG00025", tieu_de: "Đài Loan 5N4Đ Hạ Long", agent_id: 3, so_phien_ban_cuoi: 3, trang_thai: "sent" }),
  r({ id: 26, ma_bg: "BG00026", tieu_de: "Hà Nội – Sapa 4 ngày", agent_id: 7 }),
  r({ id: 27, ma_bg: "BG00027", tieu_de: "Ninh Bình trọn gói", agent_id: null, loai_bao_gia: "gia_cuoi" }),
];

describe("ngayTaoVN", () => {
  it("đổi mốc UTC sang ĐÚNG ngày theo giờ Việt Nam", () => {
    expect(ngayTaoVN("2026-09-03T04:00:00+00:00")).toBe("2026-09-03");
  });

  it("báo giá tạo lúc rạng sáng VN vẫn tính là ngày hôm đó, không lùi về hôm trước", () => {
    // 23:30 UTC ngày 02/09 = 06:30 sáng VN ngày 03/09. Cắt chuỗi UTC sẽ ra 02/09 — sai.
    expect(ngayTaoVN("2026-09-02T23:30:00+00:00")).toBe("2026-09-03");
  });

  it("để trống hoặc không đọc được thì trả null chứ không ném lỗi", () => {
    expect(ngayTaoVN(null)).toBeNull();
    expect(ngayTaoVN("")).toBeNull();
    expect(ngayTaoVN("khong-phai-ngay")).toBeNull();
  });
});

describe("chuanHoaTim", () => {
  it("bỏ dấu tiếng Việt, kể cả chữ Đ hoa", () => {
    expect(chuanHoaTim("Đài Loan Hạ Long")).toBe("dai loan ha long");
  });

  it("gộp ký tự TOÀN chiều rộng về nửa chiều rộng", () => {
    // Tiêu đề đối tác Đài Loan gửi sang hay lẫn ５ ６ － ｜ ． — nhìn hệt 5 6 - | .
    expect(chuanHoaTim("下龍灣５日")).toBe("下龍灣5日");
    expect(chuanHoaTim("Ａ－Ｂ")).toBe("a b");
  });

  it("mọi dấu câu thành khoảng trắng nên gõ có gạch hay không đều như nhau", () => {
    expect(chuanHoaTim("BG00025-v2")).toBe("bg00025 v2");
    expect(chuanHoaTim("團體旅遊｜abc")).toBe("團體旅遊 abc");
  });

  it("để trống thì trả chuỗi rỗng, không ném lỗi", () => {
    expect(chuanHoaTim(null)).toBe("");
    expect(chuanHoaTim(undefined)).toBe("");
  });
});

describe("locBaoGia", () => {
  it("không lọc gì thì giữ nguyên cả danh sách VÀ nguyên thứ tự", () => {
    expect(locBaoGia(rows).map((x) => x.id)).toEqual([25, 26, 27]);
    expect(locBaoGia(rows, {}, TEN_DOI_TAC).map((x) => x.id)).toEqual([25, 26, 27]);
  });

  it("lọc theo trạng thái", () => {
    expect(locBaoGia(rows, { trangThai: "sent" }).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { trangThai: "draft" }).map((x) => x.id)).toEqual([26, 27]);
    // Hệ thống chỉ ghi "draft" và "sent"; trạng thái lạ thì không dòng nào khớp.
    expect(locBaoGia(rows, { trangThai: "trang_thai_la" })).toHaveLength(0);
  });

  it("dòng để trống trạng thái vẫn được tính là Nháp (bảng cũng vẽ như vậy)", () => {
    const chuaCo = [r({ id: 99, trang_thai: null })];
    expect(locBaoGia(chuaCo, { trangThai: "draft" })).toHaveLength(1);
  });

  it("lọc theo loại báo giá", () => {
    expect(locBaoGia(rows, { loaiBaoGia: "gia_cuoi" }).map((x) => x.id)).toEqual([27]);
    expect(locBaoGia(rows, { loaiBaoGia: "tu_tinh" }).map((x) => x.id)).toEqual([25, 26]);
  });

  it("lọc theo đối tác, và lọc riêng nhóm chưa gắn đối tác", () => {
    expect(locBaoGia(rows, { agentId: 3 }).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { agentId: "chua_gan" }).map((x) => x.id)).toEqual([27]);
  });

  it("agentId = 0 vẫn là một bộ lọc thật, không bị coi là bỏ trống", () => {
    const co0 = [r({ id: 1, agent_id: 0 }), r({ id: 2, agent_id: 5 })];
    expect(locBaoGia(co0, { agentId: 0 }).map((x) => x.id)).toEqual([1]);
  });

  it("tìm theo mã BG", () => {
    expect(locBaoGia(rows, { q: "BG00026" }).map((x) => x.id)).toEqual([26]);
    expect(locBaoGia(rows, { q: "bg00026" }).map((x) => x.id)).toEqual([26]);
  });

  it("tìm được cả tên có số bản, đúng cách đối tác nhắn tin (BG00025-v3)", () => {
    expect(locBaoGia(rows, { q: "BG00025-v3" }).map((x) => x.id)).toEqual([25]);
    // Báo giá chưa chào bản nào thì không có hậu tố -v.
    expect(locBaoGia(rows, { q: "BG00026-v1" })).toHaveLength(0);
  });

  it("tìm được cả BẢN CŨ đối tác đang cầm, không riêng bản mới nhất", () => {
    // File Word gửi đi mang tên của chính bản đó (BG00025-v2), đối tác nhắn lại
    // đúng cái tên ấy — tìm không ra là màn hình nói "không có báo giá nào khớp".
    expect(locBaoGia(rows, { q: "BG00025-v2" }).map((x) => x.id)).toEqual([25]);
    // Nhưng bản chưa từng chào thì không được khớp bừa.
    expect(locBaoGia(rows, { q: "BG00025-v9" })).toHaveLength(0);
  });

  it("báo giá mới gửi khách một lần mang CHÍNH mã gốc, không có hậu tố -v1", () => {
    // RPC tao_phien_ban_bao_gia ghi ma_hien_thi = "BG00040" cho bản 1; cổng đối tác
    // và file Word gửi đi cũng gọi thế. "BG00040-v1" là cái tên không nơi nào phát ra.
    const guiMotLan = [r({ id: 40, ma_bg: "BG00040", so_phien_ban_cuoi: 1, trang_thai: "sent" })];
    expect(locBaoGia(guiMotLan, { q: "BG00040" }).map((x) => x.id)).toEqual([40]);
    expect(locBaoGia(guiMotLan, { q: "BG00040-v1" })).toHaveLength(0);
  });

  it("gõ mã có gạch hay thay gạch bằng khoảng trắng đều ra như nhau", () => {
    expect(locBaoGia(rows, { q: "BG00025 v2" }).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { q: "BG00025-v3" }).map((x) => x.id)).toEqual([25]);
  });

  it("tiêu đề tiếng Trung có ký tự toàn chiều rộng vẫn tìm được bằng bàn phím thường", () => {
    const trung: BaoGiaLocRow[] = [
      r({ id: 48, ma_bg: "BG00048", tieu_de: "下龍灣５日" }),
      r({ id: 50, ma_bg: "BG00050", tieu_de: "順化６日－皇城" }),
      r({ id: 51, ma_bg: "BG00051", tieu_de: "團體旅遊｜mau-doi-tac" }),
    ];
    expect(locBaoGia(trung, { q: "5日" }).map((x) => x.id)).toEqual([48]);
    expect(locBaoGia(trung, { q: "6日-皇城" }).map((x) => x.id)).toEqual([50]);
    expect(locBaoGia(trung, { q: "mau-doi-tac" }).map((x) => x.id)).toEqual([51]);
  });

  it("chưa có mã trong DB thì vẫn tìm được bằng mã suy từ id", () => {
    const chuaCoMa = [r({ id: 8, ma_bg: null })];
    expect(locBaoGia(chuaCoMa, { q: "BG00008" })).toHaveLength(1);
  });

  it("tìm tên chương trình không cần gõ dấu", () => {
    expect(locBaoGia(rows, { q: "dai loan" }).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { q: "ninh binh" }).map((x) => x.id)).toEqual([27]);
  });

  it("tìm được theo tên đối tác", () => {
    expect(locBaoGia(rows, { q: "mau" }, TEN_DOI_TAC).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { q: "dai bac" }, TEN_DOI_TAC).map((x) => x.id)).toEqual([26]);
  });

  it("gõ nhiều từ thì mọi từ đều phải khớp, thứ tự bất kỳ", () => {
    expect(locBaoGia(rows, { q: "loan dai" }).map((x) => x.id)).toEqual([25]);
    // Trộn mã BG với tên đối tác — hai nguồn khác nhau trên cùng một dòng.
    expect(locBaoGia(rows, { q: "mau bg00025" }, TEN_DOI_TAC).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { q: "mau sapa" }, TEN_DOI_TAC)).toHaveLength(0);
  });

  it("không truyền map tên đối tác thì tìm theo tên đối tác không ra, nhưng không vỡ", () => {
    expect(locBaoGia(rows, { q: "mau" })).toHaveLength(0);
  });

  it("lọc khoảng ngày tạo theo giờ VN", () => {
    const theoNgay = [
      r({ id: 1, created_at: "2026-09-01T03:00:00+00:00" }), // 01/09 VN
      r({ id: 2, created_at: "2026-09-02T23:30:00+00:00" }), // 03/09 VN (rạng sáng)
      r({ id: 3, created_at: "2026-09-05T10:00:00+00:00" }), // 05/09 VN
    ];
    expect(locBaoGia(theoNgay, { tuNgay: "2026-09-03" }).map((x) => x.id)).toEqual([2, 3]);
    expect(locBaoGia(theoNgay, { denNgay: "2026-09-03" }).map((x) => x.id)).toEqual([1, 2]);
    expect(locBaoGia(theoNgay, { tuNgay: "2026-09-03", denNgay: "2026-09-03" }).map((x) => x.id)).toEqual([2]);
  });

  it("dòng không rõ ngày tạo bị loại khi đang lọc theo ngày, nhưng vẫn còn khi không lọc ngày", () => {
    const khuyet = [r({ id: 1, created_at: null })];
    expect(locBaoGia(khuyet, { tuNgay: "2026-09-01" })).toHaveLength(0);
    expect(locBaoGia(khuyet, {})).toHaveLength(1);
  });

  it("nhiều bộ lọc cùng lúc thì phải thoả TẤT CẢ", () => {
    expect(locBaoGia(rows, { q: "dai", trangThai: "sent", agentId: 3 }).map((x) => x.id)).toEqual([25]);
    expect(locBaoGia(rows, { q: "dai", trangThai: "draft", agentId: 3 })).toHaveLength(0);
  });
});

describe("coDangLoc", () => {
  it("không có gì thì tắt nút Xoá lọc", () => {
    expect(coDangLoc({})).toBe(false);
    expect(coDangLoc({ q: "   ", trangThai: "", loaiBaoGia: "", agentId: null, tuNgay: "", denNgay: "" })).toBe(false);
  });

  it("bật khi có bất kỳ bộ lọc nào", () => {
    expect(coDangLoc({ q: "a" })).toBe(true);
    expect(coDangLoc({ trangThai: "sent" })).toBe(true);
    expect(coDangLoc({ loaiBaoGia: "gia_cuoi" })).toBe(true);
    expect(coDangLoc({ agentId: 3 })).toBe(true);
    expect(coDangLoc({ agentId: "chua_gan" })).toBe(true);
    expect(coDangLoc({ tuNgay: "2026-09-01" })).toBe(true);
    expect(coDangLoc({ denNgay: "2026-09-01" })).toBe(true);
  });

  it("lọc đúng đối tác id 0 vẫn coi là đang lọc", () => {
    expect(coDangLoc({ agentId: 0 })).toBe(true);
  });
});
