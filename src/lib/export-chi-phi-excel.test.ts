import { describe, it, expect } from "vitest";
import { getSoKhachText, groupKsRows } from "./export-chi-phi-excel";
import type { ExportDoan } from "./export-chi-phi-excel";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";

const doan = (p: Partial<ExportDoan>): ExportDoan => p;

// Tạo ChiPhiRow KS tối giản cho test grouping.
const ksRow = (p: Partial<ChiPhiRow> & { id: number }): ChiPhiRow => ({
  doan_id: 78, ngay_so: null, loai: "chi", danh_muc: "khach_san",
  ref_doan_ngay_item_id: null, ref_doan_ngay_id: null, mo_ta: "", don_gia: 0,
  so_luong: 0, thanh_tien: 0, trang_thai_thanh_toan: "unpaid", ngay_thanh_toan: null,
  created_at: "", tien_cong_ty: 0, tien_hdv: 0, nha_cung_cap_id: null,
  trang_thai_dntt: "chua_gui", de_nghi_tt_id: null, so_tien_da_dntt: 0, so_tien_da_tt: 0,
  thanh_tien_thuc_te: null, thanh_toan_dinh_ky: false, foc_khach_snapshot: null,
  foc_mien_snapshot: null, chiet_khau_phan_tram_snapshot: null, loai_row: "phong",
  foc_count: 0, is_overridden: false, tien_te_loai: null, ty_gia: null,
  chiet_khau_pct: null, don_gia_raw: null, vat_pct: null, trang_thai_hoa_don: null,
  ...p,
}) as ChiPhiRow;

describe("getSoKhachText", () => {
  it("ghép đủ breakdown NL · TE 50% · TE free · TL + tổng (khớp trang điều tour)", () => {
    // Ca thực tế đoàn SHI-PQC6D-260604: NL 42, TE 50% 5, TE free 1, TL 1 → tổng 49
    expect(
      getSoKhachText(
        doan({ so_khach_lon: 42, so_khach_em1: 5, so_khach_em2: 1, so_khach_tl: 1 })
      )
    ).toBe("49 khách (42 NL, 5 TE 50%, 1 TE free, 1 TL)");
  });

  it("bỏ qua category = 0 cho gọn", () => {
    expect(getSoKhachText(doan({ so_khach_lon: 30, so_khach_tl: 1 }))).toBe(
      "31 khách (30 NL, 1 TL)"
    );
  });

  it("không có breakdown chi tiết → fallback dùng so_khach tổng", () => {
    expect(getSoKhachText(doan({ so_khach: 20 }))).toBe("20 khách");
  });

  it("rỗng → 0 khách (không crash)", () => {
    expect(getSoKhachText(doan({}))).toBe("0 khách");
  });
});

describe("groupKsRows — tách day-use khỏi KS qua đêm (bug đoàn S8SAPA6D0529-FY)", () => {
  // Mô phỏng data thật: đêm 469 (01/06) & 470 (02/06) = The Watson (ks 30);
  // day-use item 12742 (01/06) + 9502 (02/06) cũng mang ref_doan_ngay_id 469/470.
  const dayUseItemMap = {
    12742: { khach_san_id: 99, ngay_date: "2026-06-01", canh_diem_ten: "Watson Day Use" },
    9502: { khach_san_id: 88, ngay_date: "2026-06-02", canh_diem_ten: "Sea Octopus Day Cruise" },
  };
  const rows: ChiPhiRow[] = [
    // overnight 01/06
    ksRow({ id: 2878, mo_ta: "7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 469, tien_cong_ty: 8_400_000 }),
    ksRow({ id: 3548, mo_ta: "phụ thu trẻ em", so_luong: 1, ref_doan_ngay_id: 469, tien_cong_ty: 200_000 }),
    // day-use 01/06 (CÓ cả ref_doan_ngay_id 469 lẫn item 12742)
    ksRow({ id: 2870, mo_ta: "Day Use 7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 469, ref_doan_ngay_item_id: 12742, tien_cong_ty: 8_400_000 }),
    // overnight 02/06
    ksRow({ id: 2880, mo_ta: "7 twn 1 trip", so_luong: 8, ref_doan_ngay_id: 470, tien_cong_ty: 8_400_000 }),
    // day-use 02/06 (Sea Octopus) — 2 row cùng item 9502
    ksRow({ id: 2883, mo_ta: "17 pax vé vịnh", so_luong: 17, ref_doan_ngay_id: 470, ref_doan_ngay_item_id: 9502, tien_cong_ty: 5_270_000 }),
    ksRow({ id: 2884, mo_ta: "1 trẻ em 10 tuổi", so_luong: 1, ref_doan_ngay_id: 470, ref_doan_ngay_item_id: 9502, tien_cong_ty: 540_000 }),
  ];

  it("day-use KHÔNG lọt vào KS qua đêm; gom riêng theo (ks|ngày)", () => {
    const g = groupKsRows(rows, dayUseItemMap);
    // Đêm 469/470 chỉ còn phòng overnight (KHÔNG có Day Use / vé vịnh)
    expect(g.ksCostByNgay.get(469)!.map((r) => r.id)).toEqual([2878, 3548]);
    expect(g.ksCostByNgay.get(470)!.map((r) => r.id)).toEqual([2880]);
    // Day-use tách thành 2 nhóm riêng
    expect(g.dayUseGroups.size).toBe(2);
    expect(g.dayUseGroups.get("99|2026-06-01")!.rows.map((r) => r.id)).toEqual([2870]);
    expect(g.dayUseGroups.get("88|2026-06-02")!.rows.map((r) => r.id)).toEqual([2883, 2884]);
  });

  it("tổng tiền cộng đủ MỌI row (day-use vẫn trong tổng KS — không lệch grand-total)", () => {
    const g = groupKsRows(rows, dayUseItemMap);
    expect(g.totalCtyKS).toBe(8_400_000 + 200_000 + 8_400_000 + 8_400_000 + 5_270_000 + 540_000);
  });

  it("không có dayUseItemMap → hành vi cũ (gom hết theo đêm)", () => {
    const g = groupKsRows(rows, {});
    expect(g.dayUseGroups.size).toBe(0);
    expect(g.ksCostByNgay.get(469)!.map((r) => r.id)).toEqual([2878, 3548, 2870]);
    expect(g.ksCostByNgay.get(470)!.map((r) => r.id)).toEqual([2880, 2883, 2884]);
  });
});
