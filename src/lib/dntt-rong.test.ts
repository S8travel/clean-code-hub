import { describe, it, expect } from "vitest";
import { isDnttRong } from "./dntt-rong";

const base = { ref_loai: "doan_chi_phi", alloc_count: 0, trang_thai_duyet: "cho_duyet" };

describe("isDnttRong", () => {
  it("ĐNTT nhà hàng/dịch vụ không allocation → rỗng (đúng ca 2380/2381/2382)", () => {
    expect(isDnttRong(base)).toBe(true);
  });

  it("ĐNTT khách sạn không allocation → rỗng", () => {
    expect(isDnttRong({ ...base, ref_loai: "khach_san" })).toBe(true);
  });

  it("có allocation → không rỗng", () => {
    expect(isDnttRong({ ...base, alloc_count: 1 })).toBe(false);
  });

  it("hoàn ứng / HDV vốn không allocation → KHÔNG coi là rỗng", () => {
    expect(isDnttRong({ ...base, ref_loai: null })).toBe(false);
    expect(isDnttRong({ ...base, ref_loai: "ngoai_tour_ks" })).toBe(false);
  });

  // Phiếu gộp định kỳ CÓ allocate vào doan_chi_phi (useCreateBatchDNTT) — bản đầu
  // xếp nhầm nó vào nhóm "không cần allocation" nên phiếu rỗng định kỳ duyệt & chi
  // được, mà chi phí vẫn báo chưa đề nghị → kỳ sau đề nghị lại = trả hai lần.
  it("ĐNTT gộp định kỳ không allocation → RỖNG", () => {
    expect(isDnttRong({ ...base, ref_loai: "dinh_ky" })).toBe(true);
  });

  it("ĐNTT gộp định kỳ có allocation → bình thường", () => {
    expect(isDnttRong({ ...base, ref_loai: "dinh_ky", alloc_count: 3 })).toBe(false);
  });

  it("đã hủy / từ chối → không cảnh báo nữa (rác đã dọn)", () => {
    expect(isDnttRong({ ...base, trang_thai_duyet: "da_huy" })).toBe(false);
    expect(isDnttRong({ ...base, trang_thai_duyet: "tu_choi" })).toBe(false);
  });

  it("alloc_count thiếu (view cũ chưa có cột) → coi như 0, vẫn cảnh báo", () => {
    expect(isDnttRong({ ref_loai: "doan_chi_phi", trang_thai_duyet: "cho_duyet" })).toBe(true);
    expect(isDnttRong({ ...base, alloc_count: null })).toBe(true);
  });

  it("ĐNTT đã duyệt mà rỗng → vẫn cảnh báo (dữ liệu cũ trước trigger)", () => {
    expect(isDnttRong({ ...base, trang_thai_duyet: "da_duyet" })).toBe(true);
  });
});
