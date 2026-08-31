import { describe, expect, it } from "vitest";
import {
  chuanHoaYeuCau,
  duongDanLeadFile,
  laLinkCongHopLe,
  mimeTuDuoi,
  stampTuNgay,
  MAX_CO_CHU,
} from "./yeu-cau-doi-tac";

// Host giả: repo này công khai, không ghép sẵn địa chỉ project cổng vào đây.
// Hàm nhận origin qua tham số nên test không cần địa chỉ thật.
const CONG = "https://cong-doi-tac.supabase.co";
const linkKy = (ten = "lich-trinh.pdf") =>
  `${CONG}/storage/v1/object/sign/yeu-cau/agent_3/${ten}?token=abc.def`;

describe("laLinkCongHopLe", () => {
  it("nhận link ký của đúng project cổng", () => {
    expect(laLinkCongHopLe(linkKy(), CONG)).toBe(true);
  });

  it("từ chối link sang host khác — đây là hàng rào SSRF", () => {
    expect(laLinkCongHopLe("https://evil.example/storage/v1/object/sign/x/y", CONG)).toBe(false);
    // Host trông giống nhưng khác domain gốc.
    expect(laLinkCongHopLe("https://cong-doi-tac.supabase.co.evil.io/storage/v1/object/sign/a/b", CONG)).toBe(false);
  });

  it("từ chối đường dẫn không phải link ký (metadata nội bộ, bucket public)", () => {
    expect(laLinkCongHopLe(`${CONG}/rest/v1/agent?select=*`, CONG)).toBe(false);
    expect(laLinkCongHopLe(`${CONG}/storage/v1/object/public/yeu-cau/a.pdf`, CONG)).toBe(false);
  });

  it("từ chối chuỗi rỗng / không phải URL", () => {
    expect(laLinkCongHopLe("", CONG)).toBe(false);
    expect(laLinkCongHopLe("agent_3/a.pdf", CONG)).toBe(false);
    expect(laLinkCongHopLe(linkKy(), "")).toBe(false);
  });
});

describe("duongDanLeadFile", () => {
  it("thư mục cấp 1 mang id đối tác, tên rút về ASCII", () => {
    expect(duongDanLeadFile(3, "20260821-091530", 0, "Lịch trình Đài Loan.pdf"))
      .toBe("agent_3/20260821-091530_0_Lich-trinh-Dai-Loan.pdf");
  });

  it("hai file trùng tên trong cùng lượt gửi không đè nhau", () => {
    const a = duongDanLeadFile(3, "20260821-091530", 0, "a.pdf");
    const b = duongDanLeadFile(3, "20260821-091530", 1, "a.pdf");
    expect(a).not.toBe(b);
  });

  it("hai đối tác gửi cùng tên file thì nằm hai thư mục khác nhau", () => {
    const a = duongDanLeadFile(3, "20260821-091530", 0, "a.pdf");
    const b = duongDanLeadFile(13, "20260821-091530", 0, "a.pdf");
    expect(a).not.toBe(b);
  });
});

describe("mimeTuDuoi", () => {
  it("suy kiểu từ đuôi — bucket không nhận octet-stream nên không được để trống", () => {
    expect(mimeTuDuoi("lich-trinh.pdf")).toBe("application/pdf");
    expect(mimeTuDuoi("BAOGIA.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("đuôi lạ trả null để chỗ gọi tự quyết", () => {
    expect(mimeTuDuoi("a.hwp")).toBeNull();
    expect(mimeTuDuoi("khong-duoi")).toBeNull();
  });
});

describe("stampTuNgay", () => {
  it("dựng mốc thời gian theo UTC, đủ 2 chữ số", () => {
    expect(stampTuNgay(new Date("2026-08-21T09:05:03Z"))).toBe("20260821-090503");
  });
});

describe("chuanHoaYeuCau", () => {
  const base = { crm_agent_id: 3, noi_dung: "Xin báo giá 5N4Đ Hà Nội – Hạ Long" };

  it("từ chối khi thiếu đối tác", () => {
    const kq = chuanHoaYeuCau({ ...base, crm_agent_id: 0 }, CONG);
    expect(kq.ok).toBe(false);
  });

  it("từ chối khi không có cả tiêu đề lẫn nội dung", () => {
    const kq = chuanHoaYeuCau({ crm_agent_id: 3, tieu_de: "   ", noi_dung: "" }, CONG);
    expect(kq).toEqual({ ok: false, loi: "Cần nhập nội dung yêu cầu" });
  });

  it("chỉ có tiêu đề vẫn nhận", () => {
    const kq = chuanHoaYeuCau({ crm_agent_id: 3, tieu_de: "詢價 5D4N" }, CONG);
    expect(kq.ok).toBe(true);
  });

  it("cắt nội dung quá dài về 2000 ký tự", () => {
    const kq = chuanHoaYeuCau({ ...base, noi_dung: "x".repeat(5000) }, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.noi_dung).toHaveLength(2000);
  });

  it("số khách âm / không phải số → bỏ, không đẩy số rác sang CRM", () => {
    const am = chuanHoaYeuCau({ ...base, so_khach: -5 }, CONG);
    const chu = chuanHoaYeuCau({ ...base, so_khach: "nhiều" }, CONG);
    if (!am.ok || !chu.ok) throw new Error("phải hợp lệ");
    expect(am.data.so_khach).toBeNull();
    expect(chu.data.so_khach).toBeNull();
  });

  it("số khách vượt trần bị kẹp lại", () => {
    const kq = chuanHoaYeuCau({ ...base, so_khach: 99999 }, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.so_khach).toBe(1000);
  });

  it("chỉ nhận ngày dạng ISO, chuỗi lạ thành null", () => {
    const kq = chuanHoaYeuCau(
      { ...base, ngay_di_du_kien: "2026-10-05", ngay_ve_du_kien: "tháng 10" },
      CONG,
    );
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.ngay_di_du_kien).toBe("2026-10-05");
    expect(kq.data.ngay_ve_du_kien).toBeNull();
  });

  it("giữ tối đa 3 file", () => {
    const kq = chuanHoaYeuCau(
      { ...base, tep: [1, 2, 3, 4, 5].map((i) => ({ ten: `f${i}.pdf`, url: linkKy(`f${i}.pdf`) })) },
      CONG,
    );
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tep).toHaveLength(3);
  });

  it("bỏ file có link lạ nhưng VẪN nhận yêu cầu", () => {
    const kq = chuanHoaYeuCau(
      {
        ...base,
        tep: [
          { ten: "ok.pdf", url: linkKy() },
          { ten: "xau.pdf", url: "https://evil.example/a.pdf" },
        ],
      },
      CONG,
    );
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tep.map((t) => t.ten)).toEqual(["ok.pdf"]);
  });

  it("bỏ file quá nặng và file sai định dạng", () => {
    const kq = chuanHoaYeuCau(
      {
        ...base,
        tep: [
          { ten: "nang.pdf", url: linkKy("nang.pdf"), co_chu: MAX_CO_CHU + 1 },
          { ten: "la.exe", url: linkKy("la.exe"), mime: "application/x-msdownload" },
          { ten: "ok.docx", url: linkKy("ok.docx"), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        ],
      },
      CONG,
    );
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tep.map((t) => t.ten)).toEqual(["ok.docx"]);
  });

  it("giữ số file đối tác thực sự đính kèm (để biết có file nào rớt)", () => {
    const kq = chuanHoaYeuCau({ ...base, so_tep_gui: 3, tep: [{ ten: "a.pdf", url: linkKy() }] }, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.so_tep_gui).toBe(3);
    expect(kq.data.tep).toHaveLength(1);
  });

  it("không khai số file gửi thì để null, không đoán", () => {
    const kq = chuanHoaYeuCau(base, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.so_tep_gui).toBeNull();
  });

  it("giữ tài khoản cổng đã gửi (cột 'tài khoản nào gửi' bên CRM)", () => {
    const kq = chuanHoaYeuCau(
      { ...base, tai_khoan_email: "guo@s8travel.com", tai_khoan_ten: "Guo Ling" },
      CONG,
    );
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tai_khoan_email).toBe("guo@s8travel.com");
    expect(kq.data.tai_khoan_ten).toBe("Guo Ling");
  });

  it("thiếu tài khoản thì để null chứ không lấy tạm người liên hệ", () => {
    const kq = chuanHoaYeuCau({ ...base, nguoi_lien_he: "Chị Lan" }, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tai_khoan_email).toBeNull();
    expect(kq.data.tai_khoan_ten).toBeNull();
    expect(kq.data.nguoi_lien_he).toBe("Chị Lan");
  });

  it("tep không phải mảng thì coi như không có file", () => {
    const kq = chuanHoaYeuCau({ ...base, tep: "a.pdf" }, CONG);
    if (!kq.ok) throw new Error("phải hợp lệ");
    expect(kq.data.tep).toEqual([]);
  });
});
