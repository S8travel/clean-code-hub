import { describe, it, expect } from "vitest";
import { chuanHoaGiayTo, duongDanGiayTo, laLoaiDoiTacTai } from "./giay-to-doi-tac";

const CONG = "https://cong.example.supabase.co";
const linkKy = `${CONG}/storage/v1/object/sign/yeu-cau/agent_5/20261002-091500_0_phan-phong.xlsx?token=abc`;

const hopLe = (p: Record<string, unknown> = {}) => ({
  crm_agent_id: 3,
  crm_doan_id: 1272,
  loai: "chia_phong",
  tai_khoan_email: "op@daily.tw",
  tai_khoan_ten: "Lin",
  tep: { ten: "分房表.xlsx", url: linkKy, mime: "", co_chu: 12345 },
  ...p,
});

describe("chuanHoaGiayTo", () => {
  it("payload đúng → nhận, suy kiểu file từ đuôi khi cổng không khai", () => {
    const kq = chuanHoaGiayTo(hopLe(), CONG);
    expect(kq.ok).toBe(true);
    if (kq.ok) {
      expect(kq.data.crm_doan_id).toBe(1272);
      expect(kq.data.loai).toBe("chia_phong");
      expect(kq.data.tep.mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(kq.data.tep.ten).toBe("分房表.xlsx");
    }
  });
  it("hợp đồng cũng nhận", () => {
    const kq = chuanHoaGiayTo(hopLe({ loai: "hop_dong", tep: { ten: "合約.pdf", url: linkKy, co_chu: 9 } }), CONG);
    expect(kq.ok && kq.data.loai).toBe("hop_dong");
  });
  it("loại khác (danh sách khách, báo giá, tài liệu khác, rác) → chặn: đại lý chỉ tự tải được 2 loại", () => {
    for (const loai of ["danh_sach_khach", "bao_gia", "khac", "", null, "hop_dong; drop"]) {
      expect(chuanHoaGiayTo(hopLe({ loai }), CONG)).toEqual({ ok: false, loi: "Loại giấy tờ không hợp lệ" });
    }
  });
  it("thiếu đoàn hoặc đối tác → từ chối", () => {
    expect(chuanHoaGiayTo(hopLe({ crm_doan_id: null }), CONG).ok).toBe(false);
    expect(chuanHoaGiayTo(hopLe({ crm_agent_id: "x" }), CONG).ok).toBe(false);
    expect(chuanHoaGiayTo(hopLe({ crm_doan_id: 1.5 }), CONG).ok).toBe(false);
  });
  it("link không phải link ký của chính cổng → chặn (SSRF)", () => {
    const la = hopLe({ tep: { ten: "a.pdf", url: "https://evil.example.com/storage/v1/object/sign/x", co_chu: 1 } });
    expect(chuanHoaGiayTo(la, CONG)).toEqual({ ok: false, loi: "Link file không hợp lệ" });
    const congKhai = hopLe({ tep: { ten: "a.pdf", url: `${CONG}/storage/v1/object/public/yeu-cau/a.pdf`, co_chu: 1 } });
    expect(chuanHoaGiayTo(congKhai, CONG).ok).toBe(false);
  });
  it("file quá 10MB hoặc kiểu lạ → chặn", () => {
    expect(chuanHoaGiayTo(hopLe({ tep: { ten: "a.pdf", url: linkKy, co_chu: 11 * 1024 * 1024 } }), CONG).ok).toBe(false);
    expect(chuanHoaGiayTo(hopLe({ tep: { ten: "virus.exe", url: linkKy, co_chu: 10 } }), CONG).ok).toBe(false);
    expect(chuanHoaGiayTo(hopLe({ tep: { ten: "a.pdf", url: linkKy, mime: "text/html", co_chu: 10 } }), CONG).ok).toBe(false);
  });
  it("không có file → báo thiếu", () => {
    expect(chuanHoaGiayTo(hopLe({ tep: null }), CONG)).toEqual({ ok: false, loi: "Thiếu file" });
  });
});

describe("laLoaiDoiTacTai", () => {
  it("chỉ đúng hai loại", () => {
    expect(laLoaiDoiTacTai("chia_phong")).toBe(true);
    expect(laLoaiDoiTacTai("hop_dong")).toBe(true);
    expect(laLoaiDoiTacTai("danh_sach_khach")).toBe(false);
    expect(laLoaiDoiTacTai(undefined)).toBe(false);
  });
});

describe("duongDanGiayTo", () => {
  it("cùng khuôn với file OP tải ở tab Tài liệu", () => {
    expect(duongDanGiayTo(1272, "chia_phong", "分房表.XLSX", 1790000000000)).toBe("doan-1272/chia_phong/1790000000000.xlsx");
    expect(duongDanGiayTo(1272, "hop_dong", "合約.pdf", 5)).toBe("doan-1272/hop_dong/5.pdf");
  });
  it("tên không có đuôi → .bin", () => {
    expect(duongDanGiayTo(7, "chia_phong", "phan phong", 1)).toBe("doan-7/chia_phong/1.bin");
  });
});
