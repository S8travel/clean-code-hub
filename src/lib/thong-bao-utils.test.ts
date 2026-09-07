import { describe, it, expect } from "vitest";
import { targetUrl, iconFor } from "./thong-bao-utils";
import type { ThongBaoRow } from "@/hooks/use-thong-bao";

const tb = (p: Partial<ThongBaoRow>): ThongBaoRow => ({
  id: 1, user_id: "u", log_id: null, doan_id: null, doan_ten: null,
  loai: "", tieu_de: "", noi_dung: null, is_read: false,
  created_at: "2026-08-03T00:00:00Z", cong_viec_id: null, dntt_id: null,
  lead_id: null, bao_gia_id: null,
  ...p,
});

describe("targetUrl — đối tác yêu cầu sửa báo giá", () => {
  it("mở thẳng báo giá đó, không đáp xuống trang danh sách", () => {
    expect(targetUrl(tb({ loai: "bao_gia_yeu_cau_sua", bao_gia_id: 25 }))).toBe("/bao-gia/25");
  });

  it("thiếu bao_gia_id thì không bịa đường dẫn", () => {
    expect(targetUrl(tb({ loai: "bao_gia_yeu_cau_sua" }))).toBeNull();
  });
});

// Thông báo lead từ webhook Messenger phải mở ĐÚNG lead (deep-link ?lead=:id),
// không chỉ đáp xuống trang list. Bản sao logic trong send-push/index.ts —
// sửa bên đây thì sửa cả bên đó.
describe("targetUrl — thông báo lead deep-link vào LeadDrawer", () => {
  it("lead_tin_nhan_fb (tin nhắn Messenger) có lead_id → /leads?lead=:id", () => {
    expect(targetUrl(tb({ loai: "lead_tin_nhan_fb", lead_id: 42 }))).toBe("/leads?lead=42");
  });

  it("lead_moi có lead_id → deep-link; không lead_id (thông báo cũ) → /leads", () => {
    expect(targetUrl(tb({ loai: "lead_moi", lead_id: 7 }))).toBe("/leads?lead=7");
    expect(targetUrl(tb({ loai: "lead_moi" }))).toBe("/leads");
  });

  it("các loai khác giữ nguyên hành vi cũ", () => {
    expect(targetUrl(tb({ loai: "deadline_booking", doan_id: 9 }))).toBe("/doan/9");
    expect(targetUrl(tb({ loai: "giao_viec", cong_viec_id: 3 }))).toBe("/my-job?cong_viec=3");
    // Nhắc gộp "Còn N đoàn chưa phân người" không kèm id nào.
    expect(targetUrl(tb({ loai: "giao_viec" }))).toBe("/my-job");
    expect(targetUrl(tb({ loai: "dntt_can_duyet" }))).toBe("/de-nghi-thanh-toan");
    expect(targetUrl(tb({ loai: "khong_biet" }))).toBeNull();
  });
});

describe("iconFor", () => {
  it("lead_tin_nhan_fb có icon 💬; loai lạ fallback 🔔", () => {
    expect(iconFor("lead_tin_nhan_fb")).toBe("💬");
    expect(iconFor("loai_chua_dinh_nghia")).toBe("🔔");
  });
});
