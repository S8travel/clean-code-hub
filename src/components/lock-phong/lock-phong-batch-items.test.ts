import { describe, it, expect } from "vitest";
import { collectLockPhongBatchItems, type LockPhongBatchEntry } from "./lock-phong-batch-items";
import { buildLockPhongMailFields } from "@/lib/booking-mail/lock-phong-mail";
import { hashMailContent } from "@/lib/mail-content-hash";
import type { LockPhongDisplay, LockPhongKSDisplay } from "@/hooks/use-lock-phong";

const CTX = { khachSanEmail: "ks@demo.test", senderName: "Người Gửi", senderPhone: "0900000000" };

function lockPhong(over: Partial<LockPhongDisplay> = {}): LockPhongDisplay {
  return {
    id: 1,
    ten_seri: "Seri Demo",
    seri_id: null,
    ten_doan: "DEMO5D001",
    ngay_xuat_phat: "2027-01-01",
    deadline: "2026-12-04",
    ghi_chu: "COD 30 ngày",
    created_by: null,
    created_at: "2026-09-17T00:00:00Z",
    hotels: [],
    ...over,
  };
}

function ksRow(over: Partial<LockPhongKSDisplay> = {}): LockPhongKSDisplay {
  return {
    id: 360,
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

function entry(lp: Partial<LockPhongDisplay>, ks: Partial<LockPhongKSDisplay>): LockPhongBatchEntry {
  return { lockPhong: lockPhong(lp), ksRow: ksRow(ks) };
}

describe("collectLockPhongBatchItems", () => {
  it("mỗi đêm ở là một dòng mail riêng, không gộp", () => {
    const items = collectLockPhongBatchItems(
      [
        entry({ ten_doan: "DEMO5D001" }, { id: 360 }),
        entry({ id: 2, ten_doan: "DEMO5D002" }, { id: 361, check_in: "2027-01-08", check_out: "2027-01-09" }),
      ],
      CTX,
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.ksId)).toEqual([360, 361]);
    expect(items[0].subject).not.toBe(items[1].subject);
    expect(items[0].subject).toContain("DEMO5D001");
  });

  it("đoàn chưa gửi, đủ email + cấu hình phòng → gửi mới và tick sẵn", () => {
    const [item] = collectLockPhongBatchItems([entry({}, {})], CTX);
    expect(item.mode).toBe("first");
    expect(item.defaultInclude).toBe(true);
    expect(item.skipReason).toBeUndefined();
    expect(item.email).toBe("ks@demo.test");
  });

  it("đã gửi mà nội dung y nguyên → gửi cập nhật, KHÔNG tick sẵn (tránh bắn lại cả loạt)", () => {
    const ks = ksRow({ email_status: "cho_xac_nhan", email_sent_at: "2026-09-17T00:00:00Z" });
    ks.mail_content_hash = hashMailContent(buildLockPhongMailFields(ks));
    const [item] = collectLockPhongBatchItems([{ lockPhong: lockPhong(), ksRow: ks }], CTX);
    expect(item.mode).toBe("update");
    expect(item.defaultInclude).toBe(false);
  });

  it("đã gửi rồi sửa số phòng → tick sẵn để gửi cập nhật", () => {
    const ks = ksRow({ email_status: "cho_xac_nhan", email_sent_at: "2026-09-17T00:00:00Z" });
    ks.mail_content_hash = hashMailContent(buildLockPhongMailFields(ks));
    ks.so_phong = "15TWN+2DBL";
    const [item] = collectLockPhongBatchItems([{ lockPhong: lockPhong(), ksRow: ks }], CTX);
    expect(item.mode).toBe("update");
    expect(item.defaultInclude).toBe(true);
  });

  it("khách sạn chưa có email → chặn gửi, nêu lý do, không tick", () => {
    const [item] = collectLockPhongBatchItems(
      [entry({}, { khach_san_email: null })],
      { ...CTX, khachSanEmail: null },
    );
    expect(item.skipReason).toBe("Khách sạn chưa có email");
    expect(item.defaultInclude).toBe(false);
  });

  it("đoàn đã hủy → chặn gửi (đừng bắn mail lock cho đoàn không còn chạy)", () => {
    const [item] = collectLockPhongBatchItems([entry({}, { outcome_status: "da_huy" })], CTX);
    expect(item.skipReason).toBe("Đoàn đã hủy");
    expect(item.defaultInclude).toBe(false);
  });

  it("chưa nhập cấu hình phòng → vẫn gửi được nhưng cảnh báo và không tick sẵn", () => {
    const [item] = collectLockPhongBatchItems([entry({}, { so_phong: null })], CTX);
    expect(item.skipReason).toBeUndefined();
    expect(item.warning).toBe("Chưa nhập cấu hình phòng");
    expect(item.defaultInclude).toBe(false);
  });

  it("đã thành đoàn → cảnh báo, không tick sẵn", () => {
    const [item] = collectLockPhongBatchItems([entry({}, { outcome_status: "thanh_doan" })], CTX);
    expect(item.skipReason).toBeUndefined();
    expect(item.warning).toContain("Đã thành đoàn");
    expect(item.defaultInclude).toBe(false);
  });

  it("ghi chú riêng của dòng đè ghi chú chung; không có thì lấy ghi chú chung", () => {
    const [chung] = collectLockPhongBatchItems([entry({ ghi_chu: "COD 30 ngày" }, { ghi_chu: null })], CTX);
    expect(chung.input.ghiChu).toBe("COD 30 ngày");
    const [rieng] = collectLockPhongBatchItems(
      [entry({ ghi_chu: "COD 30 ngày" }, { ghi_chu: "Khách VIP" })],
      CTX,
    );
    expect(rieng.input.ghiChu).toBe("Khách VIP");
  });

  it("giữ thread cũ để mail cập nhật nối vào đúng luồng", () => {
    const [item] = collectLockPhongBatchItems(
      [entry({}, { email_sent_at: "2026-09-17T00:00:00Z", email_thread_id: "thread-abc" })],
      CTX,
    );
    expect(item.emailThreadId).toBe("thread-abc");
  });
});
