import { describe, it, expect } from "vitest";
import { assignHDVs, getSuggestions, type TourInput } from "./use-xep-hdv";
import type { HDVRow } from "./use-hdv";

function hdv(id: number, extra: Partial<HDVRow> = {}): HDVRow {
  return {
    id,
    ten: `HDV ${id}`,
    ten_zh: null,
    gioi_tinh: null,
    nam_sinh: null,
    kinh_nghiem: null,
    chuyen_mon: null,
    agent_ids: [],
    ghi_chu: null,
    so_dien_thoai: null,
    so_tai_khoan: null,
    ngan_hang: null,
    active: true,
    dia_diem_ids: [],
    bac: 1,
    ...extra,
  };
}

function tour(ten: string, ngay_di: string, ngay_ve: string, extra: Partial<TourInput> = {}): TourInput {
  return {
    ten_doan: ten,
    ngay_di,
    ngay_ve,
    chuyen_bay_don: null,
    chuyen_bay_tien: null,
    agent_id: null,
    dia_diem_id: null,
    assigned_hdv_id: null,
    locked_hdv_id: null,
    locked_hdv_ids_phu: [],
    ...extra,
  };
}

describe("assignHDVs — đoàn nhiều HDV chặn lịch mọi người đi cùng", () => {
  it("đoàn 5 HDV: 4 người phụ/đi cùng không bị xếp vào đoàn khác trùng ngày", () => {
    const hdvs = [1, 2, 3, 4, 5, 6].map((id) => hdv(id));
    const doanDong = tour("Đoàn đông", "2026-10-01", "2026-10-05", {
      assigned_hdv_id: 1, locked_hdv_id: 1, _hard_locked: true,
      locked_hdv_ids_phu: [2, 3, 4, 5],
    });
    const doanKhac = tour("Đoàn khác", "2026-10-03", "2026-10-04");
    const out = assignHDVs([doanDong, doanKhac], hdvs);
    const khac = out.find((t) => t.ten_doan === "Đoàn khác")!;
    // Chỉ còn HDV 6 rảnh (1 là chính đoàn đông, 2–5 đi cùng)
    expect(khac.assigned_hdv_id).toBe(6);
  });

  it("hết người rảnh → đoàn trùng ngày để trống, không xếp đè người đang đi cùng", () => {
    const hdvs = [1, 2, 3].map((id) => hdv(id));
    const doanDong = tour("Đoàn đông", "2026-10-01", "2026-10-05", {
      assigned_hdv_id: 1, locked_hdv_id: 1, _hard_locked: true,
      locked_hdv_ids_phu: [2, 3],
    });
    const doanKhac = tour("Đoàn khác", "2026-10-02", "2026-10-02");
    const out = assignHDVs([doanDong, doanKhac], hdvs);
    expect(out.find((t) => t.ten_doan === "Đoàn khác")!.assigned_hdv_id).toBeNull();
  });

  it("không trùng ngày → người đi cùng vẫn nhận được đoàn khác", () => {
    const hdvs = [1, 2].map((id) => hdv(id));
    const doanDong = tour("Đoàn đông", "2026-10-01", "2026-10-03", {
      assigned_hdv_id: 1, locked_hdv_id: 1, _hard_locked: true,
      locked_hdv_ids_phu: [2],
    });
    const doanSau = tour("Đoàn sau", "2026-10-10", "2026-10-12");
    const out = assignHDVs([doanDong, doanSau], hdvs);
    expect(out.find((t) => t.ten_doan === "Đoàn sau")!.assigned_hdv_id).not.toBeNull();
  });

  it("xếp lại HDV chính cho đoàn nhiều HDV: không đôn người đi cùng lên làm chính của chính đoàn đó", () => {
    const hdvs = [2, 3, 7].map((id) => hdv(id));
    const doanDong = tour("Đoàn đông", "2026-10-01", "2026-10-05", {
      locked_hdv_ids_phu: [2, 3],
    });
    const out = assignHDVs([doanDong], hdvs);
    expect(out[0].assigned_hdv_id).toBe(7);
  });

  it("đoàn chưa khoá có HDV đi cùng vẫn chặn lịch đoàn khác", () => {
    const hdvs = [1, 2, 3].map((id) => hdv(id));
    const a = tour("A", "2026-10-01", "2026-10-05", { locked_hdv_ids_phu: [2, 3] });
    const b = tour("B", "2026-10-02", "2026-10-03");
    const out = assignHDVs([a, b], hdvs);
    // A đi trước nhận HDV 1 (2, 3 đang đi cùng chính đoàn A); B trùng ngày thì
    // không còn ai — KHÔNG được lấy 2 hay 3.
    expect(out.find((t) => t.ten_doan === "A")!.assigned_hdv_id).toBe(1);
    expect(out.find((t) => t.ten_doan === "B")!.assigned_hdv_id).toBeNull();
  });
});

describe("getSuggestions — gợi ý HDV bỏ người đang đi cùng đoàn trùng ngày", () => {
  it("người phụ/đi cùng của đoàn trùng ngày không lọt vào gợi ý", () => {
    const hdvs = [1, 2, 3, 4].map((id) => hdv(id));
    const doanDong = tour("Đoàn đông", "2026-10-01", "2026-10-05", {
      assigned_hdv_id: 1, locked_hdv_id: 1, locked_hdv_ids_phu: [2, 3],
    });
    const doanCanXep = tour("Cần xếp", "2026-10-04", "2026-10-06");
    const { primary, secondary } = getSuggestions(doanCanXep, [doanDong, doanCanXep], hdvs);
    expect([...primary, ...secondary].map((h) => h.id)).toEqual([4]);
  });

  it("không gợi ý người đang đi cùng chính đoàn đó làm HDV chính", () => {
    const hdvs = [2, 3, 7].map((id) => hdv(id));
    const doan = tour("Đoàn đông", "2026-10-01", "2026-10-05", { locked_hdv_ids_phu: [2, 3] });
    const { primary, secondary } = getSuggestions(doan, [doan], hdvs);
    expect([...primary, ...secondary].map((h) => h.id)).toEqual([7]);
  });
});
