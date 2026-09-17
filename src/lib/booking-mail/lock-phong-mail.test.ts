import { describe, it, expect } from "vitest";
import {
  buildLockPhongSubject,
  buildLockPhongEmailHtml,
  buildLockPhongMailFields,
  isLockPhongDirty,
  fmtLockPhongDate,
  type LockPhongMailInput,
} from "./lock-phong-mail";
import { hashMailContent } from "@/lib/mail-content-hash";
import type { LockPhongKSDisplay } from "@/hooks/use-lock-phong";

const baseInput: LockPhongMailInput = {
  tenDoan: "DEMO5D001",
  tenSeri: "Seri Demo",
  ngayXuatPhat: "2027-01-01",
  khachSanTen: "Khách sạn Demo",
  checkIn: "2027-01-04",
  checkOut: "2027-01-05",
  soDem: 1,
  soPhong: "14TWN+2DBL",
  ghiChu: "COD 30 ngày",
  senderName: "Người Gửi",
  senderPhone: "0900000000",
};

function ksRow(over: Partial<LockPhongKSDisplay> = {}): LockPhongKSDisplay {
  return {
    id: 1,
    lock_phong_id: 1,
    khach_san_id: 19,
    check_in: "2027-01-04",
    check_out: "2027-01-05",
    so_phong: "14TWN+2DBL",
    tinh_trang_phong: null,
    code_ncc: null,
    outcome_status: null,
    code_doan_thanh: null,
    ghi_chu: null,
    email_status: "chua_gui",
    email_sent_at: null,
    email_sent_by: null,
    email_confirm_at: null,
    email_thread_id: null,
    created_at: "2026-09-17T00:00:00Z",
    mail_content_hash: null,
    khach_san_ten: "Khách sạn Demo",
    khach_san_email: "ks@demo.test",
    khach_san_dia_diem: "Hà Nội",
    so_dem: 1,
    ...over,
  };
}

describe("buildLockPhongSubject", () => {
  it("có code đoàn và tên khách sạn — mỗi đoàn một subject riêng để Gmail tách thread", () => {
    const a = buildLockPhongSubject("DEMO5D001", "Khách sạn Demo");
    const b = buildLockPhongSubject("DEMO5D002", "Khách sạn Demo");
    expect(a).toContain("DEMO5D001");
    expect(a).toContain("Khách sạn Demo");
    expect(a).toContain("Lock Phòng");
    expect(a).not.toBe(b);
  });
});

describe("fmtLockPhongDate", () => {
  it("ISO → dd/MM/yyyy", () => {
    expect(fmtLockPhongDate("2027-01-04")).toBe("04/01/2027");
  });

  it("chuỗi hỏng thì trả nguyên văn, không văng lỗi giữa lúc dựng mail", () => {
    expect(fmtLockPhongDate("")).toBe("");
  });
});

describe("buildLockPhongEmailHtml — mail mới", () => {
  const html = buildLockPhongEmailHtml(baseInput, "first");

  it("có đủ code đoàn, seri, ngày xuất phát, ngày ở và cấu hình phòng", () => {
    expect(html).toContain("DEMO5D001");
    expect(html).toContain("Seri Demo");
    expect(html).toContain("01/01/2027");
    expect(html).toContain("04/01/2027");
    expect(html).toContain("05/01/2027");
    expect(html).toContain("14TWN+2DBL");
    expect(html).toContain("(1 đêm)");
  });

  it("có ghi chú khi nhập, không có khối ghi chú khi để trống", () => {
    expect(html).toContain("COD 30 ngày");
    const khongGhiChu = buildLockPhongEmailHtml({ ...baseInput, ghiChu: null }, "first");
    expect(khongGhiChu).not.toContain("<strong>Ghi chú:</strong>");
  });

  it("thiếu cấu hình phòng thì hiện gạch ngang thay vì 'null'", () => {
    const html2 = buildLockPhongEmailHtml({ ...baseInput, soPhong: null }, "first");
    expect(html2).not.toContain("null");
    expect(html2).toContain("—");
  });

  it("ký tên người gửi + số điện thoại", () => {
    expect(html).toContain("Người Gửi");
    expect(html).toContain("0900000000");
  });
});

describe("buildLockPhongEmailHtml — mail cập nhật", () => {
  it("nêu đúng đoàn đang cập nhật và kèm lời nhắn của OP", () => {
    const html = buildLockPhongEmailHtml(baseInput, "update", "Đổi từ 14TWN sang 15TWN");
    expect(html).toContain("Cập nhật lock phòng đoàn DEMO5D001");
    expect(html).toContain("Đổi từ 14TWN sang 15TWN");
  });
});

describe("buildLockPhongMailFields + isLockPhongDirty", () => {
  it("field hash chỉ gồm KS / ngày ở / phòng / ghi chú", () => {
    expect(Object.keys(buildLockPhongMailFields(ksRow())).sort()).toEqual(
      ["check_in", "check_out", "ghi_chu", "khach_san_id", "so_phong"],
    );
  });

  it("chưa gửi mail → không coi là có thay đổi", () => {
    expect(isLockPhongDirty(ksRow())).toBe(false);
  });

  it("đã gửi, nội dung y nguyên → không dirty", () => {
    const row = ksRow({ email_status: "cho_xac_nhan", email_sent_at: "2026-09-17T00:00:00Z" });
    row.mail_content_hash = hashMailContent(buildLockPhongMailFields(row));
    expect(isLockPhongDirty(row)).toBe(false);
  });

  it("đã gửi rồi đổi số phòng → dirty (phải gửi cập nhật)", () => {
    const row = ksRow({ email_status: "cho_xac_nhan", email_sent_at: "2026-09-17T00:00:00Z" });
    row.mail_content_hash = hashMailContent(buildLockPhongMailFields(row));
    row.so_phong = "15TWN+2DBL";
    expect(isLockPhongDirty(row)).toBe(true);
  });

  it("lock đã hủy thì thôi báo dirty dù nội dung có đổi", () => {
    const row = ksRow({ email_status: "da_huy", email_sent_at: "2026-09-17T00:00:00Z" });
    row.mail_content_hash = "hash-cu-khac";
    expect(isLockPhongDirty(row)).toBe(false);
  });
});
