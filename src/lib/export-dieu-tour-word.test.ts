import { describe, it, expect } from "vitest";
import { computeExportCells, type DieuTourExportData } from "./export-dieu-tour-word";
import type { CanhDiemItem, DayLocal } from "@/hooks/use-dieu-tour";

const canhDiem = (id: number, ten: string, ghi_chu: string | null = null) =>
  ({ id, ten, ghi_chu }) as unknown as CanhDiemItem;

const ngay = (items: DayLocal["items"]): DayLocal => ({
  ngay_so: 1, ngay_date: "2026-10-05", thu: "T2", thanh_pho: "PHÚ QUỐC",
  an_trua_nha_hang_id: null, an_toi_nha_hang_id: null, an_trua_set_menu_id: null, an_toi_set_menu_id: null,
  an_trua_ghi_chu: "", an_toi_ghi_chu: "", khach_san_id: null, ks_ma_code: "", ks_loai_phong: "", items,
});

const data = (days: DayLocal[]) => ({
  days,
  canhDiemList: [canhDiem(1, "Chợ đêm Phú Quốc"), canhDiem(2, "Cano ra đảo", "Ghi chú danh mục")],
  nhaHangList: [],
  khachSanList: [],
}) as unknown as DieuTourExportData;

describe("computeExportCells — cột Chương trình", () => {
  it("dòng ghi chú tự do in đúng chỗ giữa cảnh điểm, không gạch đầu dòng", () => {
    const [c] = computeExportCells(data([ngay([
      { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "Bay VN1823 HAN→PQC 07:00" },
      { canh_diem_id: 1, thu_tu: 1 },
      { canh_diem_id: 2, thu_tu: 2, ghi_chu: "Đón tại cảng" },
      { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "19:00 Gala dinner\nTại resort" },
    ])]));
    expect(c.chuongTrinh.split("\n")).toEqual([
      "PHÚ QUỐC",
      "Bay VN1823 HAN→PQC 07:00",
      "• Chợ đêm Phú Quốc",
      "• Cano ra đảo",
      "  Ghi chú danh mục",
      "  Đón tại cảng",
      "19:00 Gala dinner",
      "Tại resort",
    ]);
  });

  it("dòng ghi chú rỗng (đang gõ dở) và dòng trống chưa chọn cảnh điểm không in ra", () => {
    const [c] = computeExportCells(data([ngay([
      { canh_diem_id: 0, thu_tu: 0, dong_ghi_chu: "   " },
      { canh_diem_id: 0, thu_tu: 2, ghi_chu: "" },
      { canh_diem_id: 1, thu_tu: 1 },
    ])]));
    expect(c.chuongTrinh).toBe("PHÚ QUỐC\n• Chợ đêm Phú Quốc");
  });
});
