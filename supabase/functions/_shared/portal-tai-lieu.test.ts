import { describe, it, expect } from "vitest";
import {
  canChepLai,
  chiaSeVoiDoiTac,
  duongDanCong,
  tachStorageUrl,
  type TaiLieuNguon,
} from "./portal-tai-lieu";

const tl = (p: Partial<TaiLieuNguon> = {}): TaiLieuNguon => ({
  id: 7,
  doan_id: 399,
  loai: "hop_dong",
  ten: null,
  file_url: "https://x.supabase.co/storage/v1/object/public/dntt-documents/doan-399/hop_dong/1.pdf",
  file_name: "Hợp đồng số 12.pdf",
  uploaded_at: "2026-08-18T02:00:00Z",
  portal_enabled: null,
  ...p,
});

describe("chiaSeVoiDoiTac", () => {
  it("hợp đồng + danh sách khách mặc định cho đối tác xem", () => {
    expect(chiaSeVoiDoiTac({ loai: "hop_dong", portal_enabled: null })).toBe(true);
    expect(chiaSeVoiDoiTac({ loai: "danh_sach_khach", portal_enabled: null })).toBe(true);
  });
  it("ngăn 'tài liệu khác' mặc định KHÔNG chia sẻ — hay bị dùng làm chỗ để đồ nội bộ", () => {
    expect(chiaSeVoiDoiTac({ loai: "khac", portal_enabled: null })).toBe(false);
  });
  it("OP bật tay thì file khác cũng đi", () => {
    expect(chiaSeVoiDoiTac({ loai: "khac", portal_enabled: true })).toBe(true);
  });
  it("OP tắt tay thì hợp đồng cũng không đi", () => {
    expect(chiaSeVoiDoiTac({ loai: "hop_dong", portal_enabled: false })).toBe(false);
  });
  it("file báo giá không bao giờ đi, kể cả bật cờ — cổng đã có mục Báo giá riêng", () => {
    expect(chiaSeVoiDoiTac({ loai: "bao_gia", portal_enabled: true })).toBe(false);
  });
});

describe("tachStorageUrl", () => {
  it("tách được URL dạng public", () => {
    expect(tachStorageUrl(tl().file_url)).toEqual({
      bucket: "dntt-documents",
      path: "doan-399/hop_dong/1.pdf",
    });
  });
  it("tách được URL đã ký (có query token)", () => {
    const u = "https://x.supabase.co/storage/v1/object/sign/doan-files/a/b.pdf?token=abc";
    expect(tachStorageUrl(u)).toEqual({ bucket: "doan-files", path: "a/b.pdf" });
  });
  it("giải mã ký tự đã encode trong đường dẫn", () => {
    const u = "https://x.supabase.co/storage/v1/object/public/b/thu%20muc/f.pdf";
    expect(tachStorageUrl(u)?.path).toBe("thu muc/f.pdf");
  });
  it("URL ngoài storage → null, không đoán bừa", () => {
    expect(tachStorageUrl("https://drive.google.com/file/d/abc")).toBeNull();
    expect(tachStorageUrl("")).toBeNull();
  });
});

describe("duongDanCong", () => {
  it("thư mục cấp 1 là agent, cấp 2 là đoàn, tên file bỏ dấu", () => {
    expect(duongDanCong(3, 12, tl())).toBe("agent_3/doan_12/7_Hop-dong-so-12.pdf");
  });
  it("đ/Đ đổi sang d/D chứ không bị nuốt mất", () => {
    expect(duongDanCong(1, 1, tl({ file_name: "Đoàn Đài.docx" }))).toBe("agent_1/doan_1/7_Doan-Dai.docx");
  });
  it("thiếu file_name thì lấy tên cuối trong URL", () => {
    expect(duongDanCong(1, 1, tl({ file_name: null }))).toBe("agent_1/doan_1/7_1.pdf");
  });
  it("tên toàn ký tự lạ vẫn ra đường dẫn dùng được", () => {
    expect(duongDanCong(1, 1, tl({ file_name: "***" }))).toBe("agent_1/doan_1/7_file");
  });
});

describe("canChepLai", () => {
  it("chưa có bên cổng → chép", () => {
    expect(canChepLai(tl(), undefined)).toBe(true);
  });
  it("cùng mốc tải lên → thôi, khỏi tải lại mỗi lần chạy", () => {
    expect(canChepLai(tl(), { crm_tai_lieu_id: 7, tai_len_luc: "2026-08-18T02:00:00Z" })).toBe(false);
  });
  it("OP thay file (mốc tải lên đổi) → chép lại", () => {
    expect(canChepLai(tl(), { crm_tai_lieu_id: 7, tai_len_luc: "2026-08-01T02:00:00Z" })).toBe(true);
  });
});
