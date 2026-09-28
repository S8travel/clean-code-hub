import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { CostingSheetSection } from "./CostingSheetSection";
import { emptyBaoGiaCase } from "./helpers";

// Bấm thử nhóm "Chi phí khác" trên CHÍNH bảng chi phí, với khung trạng thái giống
// trang chi tiết báo giá: gõ → chỉ đổi bản nháp, rời ô / bấm nút → ghi DB (onSave).

const bua = (mo_ta: string, ngay: number): BaoGiaItem =>
  ({ loai: "meal", mo_ta, don_gia: 150_000, ghi_chu: "", ngay_so: ngay });

// 5 ngày, 7 bữa, có Bà Nà → tuyến miền Trung.
const ITEMS_MIEN_TRUNG: BaoGiaItem[] = [
  { loai: "ticket", mo_ta: "Cáp treo Bà Nà", don_gia: 900_000, ghi_chu: "", ngay_so: 2 },
  bua("Trưa D1", 1), bua("Tối D1", 1), bua("Trưa D2", 2), bua("Tối D2", 2),
  bua("Trưa D3", 3), bua("Tối D3", 3), bua("Trưa D4", 4),
];

function makeDraft(ten: string, items: BaoGiaItem[]): BaoGiaRow {
  const ket: BaoGiaKetQua = {
    ten_chuong_trinh: ten, so_ngay: 5, items,
    case_16: emptyBaoGiaCase(16), case_20: emptyBaoGiaCase(20),
    gia_trung_binh_vnd: 0, gia_trung_binh_usd: 0, tier_guests: [16, 20],
  };
  return {
    id: 1, tieu_de: null, noi_dung_goc: null, ket_qua: ket,
    exchange_rate: 26000, profit_usd: 0, trang_thai: "draft",
    created_at: "", created_by: null, ngay_di: null, ngay_ve: null,
    ghi_chu: null, hieu_luc_ngay: null, ma_bg: null, lead_id: null,
    xe_ten: null, xe_gia: null, phu_thu: 0, vcb_rate: null,
    agent_id: null, bao_gia_goc_id: null, loai_tour: null, loai_bao_gia: "tu_tinh", lich_trinh_files: [],
    so_phien_ban_cuoi: 0, phien_ban_hien_hanh_id: null,
    link_token: null, link_het_han: null, link_thu_hoi: false,
    link_tao_luc: null, link_so_lan_mo: 0, link_mo_gan_nhat: null,
    portal_noi_dung: null, portal_enabled: false, portal_pushed_at: null, yeu_cau_id: null,
  };
}

function Harness({ initial, onSave }: { initial: BaoGiaRow; onSave: (k: BaoGiaKetQua) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <CostingSheetSection
      draft={draft}
      updateDraftKetQua={(next) => setDraft((d) => ({ ...d, ket_qua: next }))}
      saveKetQua={(next) => { setDraft((d) => ({ ...d, ket_qua: next })); onSave(next); }}
    />
  );
}

const dongCua = (ten: string) => screen.getByDisplayValue(ten).closest("tr")!;
const congNhom = () => screen.getByText("Cộng chi phí khác").closest("tr")!;
const lanGhiCuoi = (onSave: ReturnType<typeof vi.fn>) =>
  onSave.mock.calls[onSave.mock.calls.length - 1][0] as BaoGiaKetQua;

describe("Bảng chi phí — nhóm Chi phí khác (bấm thử)", () => {
  beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(true); });

  it("đoàn miền Trung: tự hiện đủ mẫu + tổng, rời ô mà không sửa thì KHÔNG ghi gì", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    for (const ten of ["Nón lá", "Ảnh kỷ niệm", "Bia / nước ngọt", "Nước suối", "Công tác phí tài xế"]) {
      expect(screen.getByDisplayValue(ten)).toBeInTheDocument();
    }
    expect(screen.getByText("tự đặt theo tuyến miền Trung")).toBeInTheDocument();
    expect(congNhom()).toHaveTextContent("4.023.000");
    expect(congNhom()).toHaveTextContent("4.499.000");

    // Chạm vào ô rồi đi ra — ghi lúc này là lặng lẽ chốt mẫu vào báo giá.
    const ten = screen.getByDisplayValue("Nón lá");
    fireEvent.focus(ten);
    fireEvent.blur(ten);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sửa giá một dòng → số nhảy ngay, rời ô mới lưu, và chốt CẢ danh sách", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    const gia = within(dongCua("Nón lá")).getByDisplayValue("20.000");
    fireEvent.change(gia, { target: { value: "25000" } });
    expect(onSave).not.toHaveBeenCalled();
    expect(congNhom()).toHaveTextContent("4.108.000"); // + 5.000 × 17 suất

    fireEvent.blur(gia);
    expect(onSave).toHaveBeenCalledTimes(1);
    const ds = lanGhiCuoi(onSave).chi_phi_khac!;
    expect(ds).toHaveLength(7);
    expect(ds[0]).toMatchObject({ ten: "Nón lá", don_gia: 25_000 });
    expect(ds[3]).toMatchObject({ ten: "Nước suối", n_theo: "ngay" }); // dòng khác giữ nguyên luật tự tính
    expect(screen.queryByText("tự đặt theo tuyến miền Trung")).not.toBeInTheDocument();
    expect(screen.getByText("↺ về tự đặt theo tuyến")).toBeInTheDocument();
  });

  it("N tự tính: ô trống kèm gợi ý số bữa; gõ đè thì chốt số đó", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    const n = within(dongCua("Bia / nước ngọt")).getByPlaceholderText("7");
    expect(n).toHaveValue(null);
    fireEvent.change(n, { target: { value: "5" } });
    fireEvent.blur(n);
    expect(lanGhiCuoi(onSave).chi_phi_khac![2]).toMatchObject({ n_theo: "bua", so_lan: 5 });
  });

  it("đổi cách tính '/đoàn × ngày' → '/đoàn': lưu ngay, GIỮ N = 5 cho tiền khỏi nhảy", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    const chon = within(dongCua("Nước suối")).getByRole("combobox");
    expect(chon).toHaveValue("doan_ngay");
    fireEvent.change(chon, { target: { value: "doan" } });
    const nuoc = lanGhiCuoi(onSave).chi_phi_khac![3];
    expect(nuoc.n_theo).toBeUndefined();
    expect(nuoc.so_lan).toBe(5);
  });

  it("xoá một dòng rồi nạp lại mẫu: chỉ thêm đúng dòng thiếu", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    fireEvent.click(within(dongCua("Nón lá")).getByTitle("Xoá dòng này khỏi báo giá"));
    expect(lanGhiCuoi(onSave).chi_phi_khac!.map((r) => r.ten)).not.toContain("Nón lá");
    expect(lanGhiCuoi(onSave).chi_phi_khac).toHaveLength(6);

    fireEvent.click(screen.getByText("Nạp mẫu miền Trung (1 dòng)"));
    const ds = lanGhiCuoi(onSave).chi_phi_khac!;
    expect(ds).toHaveLength(7);
    expect(ds.filter((r) => r.ten === "Nón lá")).toHaveLength(1);
  });

  it("↺ về tự đặt theo tuyến → bỏ danh sách đã chốt (null), mẫu quay lại", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Đà Nẵng – Hội An", ITEMS_MIEN_TRUNG)} onSave={onSave} />);
    fireEvent.click(within(dongCua("Dừa")).getByTitle("Xoá dòng này khỏi báo giá"));
    fireEvent.click(screen.getByText("↺ về tự đặt theo tuyến"));
    expect(lanGhiCuoi(onSave).chi_phi_khac).toBeNull();
    expect(screen.getByDisplayValue("Dừa")).toBeInTheDocument();
    expect(screen.getByText("tự đặt theo tuyến miền Trung")).toBeInTheDocument();
  });

  it("đoàn miền Nam (Sài Gòn): tự hiện mẫu miền Nam, phòng tài xế + HDV gợi ý 4 đêm", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Sài Gòn – Mỹ Tho", [bua("Trưa D1", 1)])} onSave={onSave} />);
    expect(screen.getByText("tự đặt theo tuyến miền Nam")).toBeInTheDocument();
    const phong = dongCua("Phòng tài xế + HDV");
    expect(within(phong).getByDisplayValue("300.000")).toBeInTheDocument();
    expect(within(phong).getByPlaceholderText("4")).toHaveValue(null);
    expect(within(phong).getByText("số đêm")).toBeInTheDocument();
    expect(within(dongCua("Công tác phí tài xế")).getByDisplayValue("200.000")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dừa")).not.toBeInTheDocument();
    // Đủ mẫu rồi → không mời nạp thêm, kể cả mẫu vùng khác.
    expect(screen.queryByText(/Nạp mẫu/)).not.toBeInTheDocument();
  });

  it("tour tuyến khác: không tự có dòng nào, nhưng nạp mẫu / thêm dòng tay được", () => {
    const onSave = vi.fn();
    render(<Harness initial={makeDraft("Hà Nội – Hạ Long", [bua("Trưa D1", 1)])} onSave={onSave} />);
    expect(screen.queryByDisplayValue("Nón lá")).not.toBeInTheDocument();
    expect(congNhom()).toHaveTextContent("0");
    // Dò không ra vùng → mời đủ các vùng.
    expect(screen.getByText("Nạp mẫu miền Nam (6 dòng)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Thêm dòng chi phí khác"));
    expect(lanGhiCuoi(onSave).chi_phi_khac).toEqual([{ ten: "", ten_zh: "", don_gia: 0, tinh_theo: "khach" }]);

    fireEvent.click(screen.getByText("Nạp mẫu miền Trung (7 dòng)"));
    expect(lanGhiCuoi(onSave).chi_phi_khac).toHaveLength(8);
  });
});
