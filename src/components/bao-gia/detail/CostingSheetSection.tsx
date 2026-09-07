import { useRef, useState } from "react";
import { Hotel, Utensils, Bus, Ticket, Plus, X, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { exportBaoGiaCostingExcel } from "@/lib/export-bao-gia-costing-excel";
import { GroupBlock } from "./CostingRows";
import {
  costingSheet, fmtVnd, fmtUsd, newBaoGiaItem, tierGuestsOf, baoGiaCode,
  isSapaTour, resolveHdvGiaNgay,
  type CostingGroup,
} from "./helpers";

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
  /** Pax dự kiến của lead → tô đậm cột bậc áp dụng. */
  leadPax?: number;
}

/** Ba khoản tiền cố định sửa được ngay trên dòng footer. */
type DinhMucTruong = "hdv_gia_ngay" | "bao_hiem_moi_khach" | "tip_doan";

const GROUP_META: Record<CostingGroup["key"], { icon: React.ReactNode; tint: string }> = {
  transport: { icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-700 bg-cyan-50" },
  hotel:     { icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-700 bg-indigo-50" },
  meal:      { icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-700 bg-orange-50" },
  ticket:    { icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-700 bg-rose-50" },
};

// Bảng chi phí bố cục Excel: gom theo nhóm Xe/KS/Ăn/Vé, song ngữ ZH+VI, đơn giá
// USD+VND, N (số đêm/lần), và NHIỀU cột số khách song song (mỗi cột: SL phòng/khách
// + thành tiền). Sửa inline đơn giá / N / FOC (thêm-xoá dòng vẫn ở "Chương trình tour").
export function CostingSheetSection({ draft, updateDraftKetQua, saveKetQua, leadPax }: Props) {
  const [newG, setNewG] = useState("");
  // Giá trị lúc bắt đầu sửa 3 ô định mức ở footer, để blur mà không đổi gì thì
  // KHÔNG ghi DB — saveKetQua không tự kiểm tra chuyện đó.
  // Phải khai TRƯỚC câu `return null` bên dưới: hook gọi sau một nhánh thoát sớm
  // là sai thứ tự hook giữa các lần vẽ.
  const truocKhiSua = useRef<Record<string, number | null>>({});
  const ket = draft.ket_qua;
  const sheet = costingSheet(draft);
  if (!ket || !sheet) return null;

  const items = ket.items ?? [];
  const nTier = sheet.configs.length;
  const guests = tierGuestsOf(ket);

  const setGuests = (next: number[]) => {
    const cleaned = [...new Set(next.filter((n) => n > 0).map((n) => Math.round(n)))].sort((a, b) => a - b);
    saveKetQua({ ...ket, tier_guests: cleaned.length ? cleaned : [16, 20] });
  };
  const addTier = () => {
    const n = Number(newG);
    if (!n || n <= 0) return;
    setGuests([...guests, n]);
    setNewG("");
  };
  const removeTier = (g: number) => {
    if (guests.length <= 1) return;
    setGuests(guests.filter((x) => x !== g));
  };
  // Công HDV: OP gõ số thì theo số đó, chưa gõ thì tự đặt theo tuyến (Sapa 700k).
  const sapa = isSapaTour(ket);
  const hdvGiaNgay = resolveHdvGiaNgay(ket);

  // Bậc áp dụng cho lead = ngưỡng cao nhất ≤ leadPax.
  const matchIdx = leadPax && leadPax > 0
    ? sheet.configs.reduce((acc, c, i) => (leadPax >= c.guests ? i : acc), -1)
    : -1;

  const ghiDinhMuc = (truong: DinhMucTruong, giaTri: number | null) =>
    updateDraftKetQua({ ...ket, [truong]: giaTri });

  // Live edit (onChange) → updateDraftKetQua; blur → saveKetQua persist.
  const liveItem = (idx: number, patch: Partial<BaoGiaItem>) => {
    updateDraftKetQua({ ...ket, items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };
  const commit = () => saveKetQua({ ...ket, items });

  // Thêm/xoá dòng dịch vụ — lưu THẲNG (không đợi blur): dòng mới rỗng, nếu chỉ
  // để ở draft mà OP F5 thì mất, còn dòng xoá mà không persist thì quay lại vẫn thấy.
  const addItem = (loai: BaoGiaItem["loai"], ngay_so: number, bua_an?: "trua" | "toi") => {
    saveKetQua({ ...ket, items: [...items, newBaoGiaItem(loai, ngay_so, bua_an)] });
  };
  const removeItem = (idx: number) => {
    const it = items[idx];
    if (!it) return;
    // Dòng đã có tiền mà lỡ tay xoá thì báo giá lệch âm thầm → hỏi lại.
    const ten = it.mo_ta?.trim() || "(chưa đặt tên)";
    if ((it.don_gia ?? 0) > 0 && !window.confirm(`Xoá "${ten}" (${fmtVnd(it.don_gia)} ₫) khỏi báo giá?`)) return;
    saveKetQua({ ...ket, items: items.filter((_, i) => i !== idx) });
  };

  const tierBg = (i: number) => (i === matchIdx ? "bg-emerald-50" : "");

  // Xuất Excel dùng CHÍNH `sheet` đang hiển thị → file luôn khớp số trên màn hình.
  const handleExportExcel = () => {
    try {
      exportBaoGiaCostingExcel(sheet, {
        tenChuongTrinh: ket.ten_chuong_trinh || draft.tieu_de || "",
        maBg: baoGiaCode(draft),
        soNgay: ket.so_ngay ?? 1,
        ngayDi: draft.ngay_di,
        ngayVe: draft.ngay_ve,
        profitUsd: draft.profit_usd,
        vcbRate: draft.vcb_rate,
      });
      toast.success("Đã xuất bảng tính giá ra Excel");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi xuất Excel");
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Bảng chi phí (theo nhóm · nhiều cỡ đoàn)
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Tỷ giá {fmtVnd(sheet.xr)} ₫/USD</span>
          {/* File này có khối THAM SỐ + công thức sống → người nhận bấm lại được
              giá vốn từng bậc khách. Nhãn phải nói rõ là bản nội bộ. */}
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            title="Tải bảng tính giá ra Excel — bản NỘI BỘ, có tham số giá vốn + lợi nhuận. KHÔNG gửi đối tác."
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất Excel (nội bộ)
          </Button>
        </div>
      </div>

      {leadPax && leadPax > 0 && matchIdx >= 0 && (
        <p className="text-[11px] text-emerald-700">
          Đoàn ~<b>{leadPax}</b> khách (lead) → cột <b>{sheet.configs[matchIdx].guests} khách</b> được tô đậm.
        </p>
      )}

      {/* Editor cỡ đoàn (mỗi bậc = 1 cột số khách) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500 mr-1">Cỡ đoàn:</span>
        {guests.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-xs">
            {g} khách
            <button
              type="button"
              onClick={() => removeTier(g)}
              disabled={guests.length <= 1}
              className="text-slate-400 hover:text-red-500 disabled:opacity-30"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <Input
            type="number" min={1} value={newG}
            onChange={(e) => setNewG(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTier()}
            placeholder="Số khách"
            className="h-7 w-24 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTier}>
            <Plus className="h-3 w-3" /> Thêm cỡ
          </Button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-[860px]">
          <thead>
            {/* Hàng 1: gộp cột theo bậc số khách */}
            <tr className="bg-[#E6F1FB]">
              <th className="sticky left-0 z-20 bg-[#E6F1FB] text-left py-1.5 px-2 font-semibold border border-slate-200" colSpan={2}>
                Hạng mục
              </th>
              <th className="py-1.5 px-2 font-semibold text-right border border-slate-200" title="Đơn giá USD">ĐG USD</th>
              <th className="py-1.5 px-2 font-semibold text-right border border-slate-200" title="Đơn giá VND">ĐG VND</th>
              <th className="py-1.5 px-2 font-semibold text-center border border-slate-200" title="Số đêm / số lần (次/N数)">N</th>
              <th className="py-1.5 px-2 font-semibold text-center border border-slate-200" title="FOC: số phòng/suất miễn phí">FOC</th>
              {sheet.configs.map((c, i) => (
                <th
                  key={c.guests} colSpan={2}
                  className={cn("py-1 px-2 font-semibold text-center border border-slate-200", tierBg(i))}
                  title={`Số phòng/pax hệ thống tự tính cho cỡ này (${c.guests} khách + 1 HDV, phòng đôi). Chỉ là SL mặc định — sửa được ở từng ô SL bên dưới.`}
                >
                  <div className="text-blue-800">{c.guests} khách</div>
                  <div className="text-[10px] font-normal text-slate-500">{c.rooms} phòng · {c.pax} pax</div>
                </th>
              ))}
            </tr>
            {/* Hàng 2: nhãn cột con */}
            <tr className="bg-[#F2F7FC] text-[10px] text-slate-500">
              <th className="sticky left-0 z-20 bg-[#F2F7FC] border border-slate-200" colSpan={6}></th>
              {sheet.configs.map((c, i) => (
                <th key={c.guests} className={cn("py-0.5 px-2 text-center border border-slate-200", tierBg(i))} colSpan={2}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="w-16 text-center">SL</span>
                    <span>Thành tiền</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.groups.map((g) => {
              const meta = GROUP_META[g.key];
              return (
                <GroupBlock
                  key={g.key}
                  group={g}
                  metaIcon={meta.icon}
                  metaTint={meta.tint}
                  nTier={nTier}
                  matchIdx={matchIdx}
                  soNgay={ket.so_ngay ?? 1}
                  onLive={liveItem}
                  onCommit={commit}
                  onAdd={addItem}
                  onRemove={removeItem}
                />
              );
            })}

            {/* Footer tổng hợp */}
            {sheet.footer.map((f) => {
              const isTotal = f.kind === "total";
              const isPrice = f.kind === "price";
              return (
                <tr
                  key={f.key}
                  className={cn(
                    "border-t",
                    isTotal && "border-t-2 border-slate-300 bg-slate-50",
                    isPrice && "bg-blue-50/60",
                  )}
                >
                  <td
                    colSpan={6}
                    className={cn(
                      "sticky left-0 z-10 py-1 px-2 text-right border border-slate-200",
                      isTotal && "bg-slate-50 font-bold",
                      isPrice && "bg-blue-50/60 font-bold text-blue-800",
                      !isTotal && !isPrice && "bg-white text-slate-600",
                    )}
                  >
                    {f.oNhap ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{f.oNhap.nhan}</span>
                        <Input
                          type="text" inputMode="numeric"
                          value={f.oNhap.donGia > 0 ? f.oNhap.donGia.toLocaleString("vi-VN") : ""}
                          onFocus={() => {
                            truocKhiSua.current[f.oNhap!.truong] = ket[f.oNhap!.truong] ?? null;
                          }}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^0-9]/g, "");
                            // Xoá trắng ô = trả về CHO hệ thống tự đặt, KHÔNG phải "0 đồng".
                            ghiDinhMuc(f.oNhap!.truong, digits ? parseInt(digits, 10) : null);
                          }}
                          onBlur={() => {
                            const moi = ket[f.oNhap!.truong] ?? null;
                            if (truocKhiSua.current[f.oNhap!.truong] === moi) return;
                            saveKetQua({ ...ket, [f.oNhap!.truong]: moi });
                          }}
                          placeholder="tự đặt"
                          className="h-6 w-24 text-xs text-right"
                        />
                        <span className="text-[11px] text-slate-400 w-12 text-left">{f.oNhap.donVi}</span>
                        {f.oNhap.tuDat ? (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap",
                              f.oNhap.ghiChuTuDat && f.oNhap.ghiChuTuDat !== "mức chung"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-500",
                            )}
                            title="Hệ thống tự đặt. Gõ số vào ô để ghi đè."
                          >
                            {f.oNhap.ghiChuTuDat ?? "mặc định"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => saveKetQua({ ...ket, [f.oNhap!.truong]: null })}
                            className="text-[10px] text-blue-600 hover:underline whitespace-nowrap"
                            title="Bỏ số đã gõ, để hệ thống tự đặt lại"
                          >
                            ↺ về tự đặt
                          </button>
                        )}
                      </div>
                    ) : f.label}
                  </td>
                  {f.values.map((v, ti) => (
                    <td
                      key={ti}
                      colSpan={2}
                      className={cn(
                        "py-1 px-2 text-right tabular-nums border border-slate-200",
                        tierBg(ti),
                        isTotal && "font-bold",
                        isPrice && "font-bold text-blue-800",
                        f.kind === "usd" && "text-slate-500",
                        f.kind === "pct" && "text-emerald-600",
                      )}
                    >
                      {f.kind === "usd" ? fmtUsd(v) : f.kind === "pct" ? `${v.toFixed(1)}%` : fmtVnd(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Cột <b>N</b> = số đêm (KS) / số lần (ăn, vé). <b>FOC</b> nhà hàng <b>tự tính</b> theo chính sách (vd 16免1)
        cho từng cỡ đoàn — để trống ô FOC = auto, nhập số = ghi đè.
        Ô <b>SL</b> trong mỗi cột cỡ đoàn cũng <b>sửa được</b>: để trống = tự tính (số phòng / số suất theo cỡ đoàn),
        gõ số = chốt đúng SL cho riêng cột đó (đoàn FIT, số phòng lẻ…) — ô sửa tay tô <b className="text-amber-700">vàng</b>,
        xoá trắng để về tự tính. Số nhỏ cạnh ô là phần <b>miễn</b> bị trừ (FOC).
        Xe & phụ thu sửa ở phần thông tin tour phía trên (hoặc trong màn “AI điền từ lịch trình”).
        <b>Thiếu mục</b>: bấm “＋ Thêm dòng…” ở cuối nhóm rồi điền tên + giá ngay trên dòng mới.
        <b>Thừa</b>: rê chuột vào dòng → biểu tượng thùng rác cạnh tên.
      </p>
    </section>
  );
}
