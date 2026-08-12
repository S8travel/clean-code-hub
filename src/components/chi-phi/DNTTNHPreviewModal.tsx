import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FileDown } from "lucide-react";
import {
  exportDNTTNHWordFromData, calcNHEntryTotal,
  type NHDocData, type NHDocEntry,
} from "@/lib/export-dntt-nh-word";
import { calcPrintDnttLech } from "@/lib/print-dntt-sync";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  open: boolean;
  data: NHDocData | null;
  onClose: () => void;
}

type EditableItem = {
  so_luong: number;
  don_gia: number;
  ghi_chu: string;
  /** CK% RIÊNG từng dòng — đây mới là thứ bản Word dùng (calcNHEntryTotal). */
  chiet_khau_phan_tram?: number;
};
type EditableEntry = Omit<NHDocEntry, "items"> & { items: EditableItem[] };

/** Tổng tiền entry — DÙNG ĐÚNG công thức của bản Word (CK riêng từng dòng) để số
 *  hiện trong modal khớp tuyệt đối với số in ra. */
function computeTotalSauCk(entry: EditableEntry): number {
  return calcNHEntryTotal(entry.items);
}

function computeCkAmount(entry: EditableEntry): number {
  const gross = entry.items.reduce((s, i) => s + i.so_luong * i.don_gia, 0);
  return gross - computeTotalSauCk(entry);
}

function computeConTT(entry: EditableEntry): number {
  const total = computeTotalSauCk(entry);
  return Math.max(0, total - entry.so_tien_coc - entry.can_tru - (entry.voucher_amount ?? 0));
}

export default function DNTTNHPreviewModal({ open, data, onClose }: Props) {
  useTranslate();
  const [editEntries, setEditEntries] = useState<EditableEntry[]>([]);
  const [nguoiDeNghi, setNguoiDeNghi] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && data) {
      setEditEntries(
        data.entries.map((e) => ({
          ...e,
          items: e.items.map((i) => ({ ...i, ghi_chu: i.ghi_chu ?? "" })),
        }))
      );
      setNguoiDeNghi(data.nguoiDeNghi ?? "");
    }
  }, [open, data]);

  const updateEntry = (i: number, patch: Partial<EditableEntry>) => {
    setEditEntries((prev) =>
      prev.map((e, idx) => {
        if (idx !== i) return e;
        const updated = { ...e, ...patch };
        // auto-recalc so_tien_con_tt when items/coc/can_tru/CK change
        if ("items" in patch || "so_tien_coc" in patch || "can_tru" in patch || "chiet_khau_phan_tram" in patch) {
          updated.so_tien_con_tt = computeConTT(updated);
        }
        return updated;
      })
    );
  };

  const updateItem = (entryIdx: number, itemIdx: number, patch: Partial<EditableItem>) => {
    setEditEntries((prev) =>
      prev.map((e, i) => {
        if (i !== entryIdx) return e;
        const items = e.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it));
        const updated = { ...e, items };
        updated.so_tien_con_tt = computeConTT(updated);
        return updated;
      })
    );
  };

  // CK% suất chính: phải ghi vào items[0].chiet_khau_phan_tram — bản Word chỉ đọc
  // CK per-dòng (calcNHEntryTotal). Field entry.chiet_khau_phan_tram là legacy,
  // giữ đồng bộ để các chỗ hiển thị cũ không lệch.
  const updateMainCk = (entryIdx: number, pct: number) => {
    setEditEntries((prev) =>
      prev.map((e, i) => {
        if (i !== entryIdx) return e;
        const items = e.items.map((it, j) => (j === 0 ? { ...it, chiet_khau_phan_tram: pct } : it));
        const updated = { ...e, items, chiet_khau_phan_tram: pct };
        updated.so_tien_con_tt = computeConTT(updated);
        return updated;
      })
    );
  };

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportDNTTNHWordFromData({
        doan: data.doan,
        entries: editEntries,
        nguoiDeNghi,
      });
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm">{t("Xem trước ĐNTT — có thể chỉnh sửa trước khi xuất")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 space-y-5">
          {editEntries.map((entry, i) => {
            const ckAmount = computeCkAmount(entry);
            const totalSauCk = computeTotalSauCk(entry);
            // Tổng dòng vs số tiền ĐNTT đang in — 2 nguồn khác nhau, lệch = tờ
            // giấy tự mâu thuẫn (Tổng − Cấn trừ ≠ Còn TT). Xem lib/print-dntt-sync.
            const lechDntt = calcPrintDnttLech({
              itemsTotal: totalSauCk,
              dnttSoTien: entry.dntt_so_tien ?? null,
              soTienCoc: entry.so_tien_coc,
              ngoaiDntt: entry.dntt_ngoai_dntt ?? 0,
              boQua: entry.dntt_lech_bo_qua,
            });
            return (
              <div key={i} className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700">{entry.ten_nh}</p>

                {/* Basic info row */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Tên NH / Dịch vụ")}</label>
                    <Input value={entry.ten_nh} onChange={(e) => updateEntry(i, { ten_nh: e.target.value })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Ngày")}</label>
                    <Input value={entry.ngay_date} onChange={(e) => updateEntry(i, { ngay_date: e.target.value })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Số khách")}</label>
                    <Input type="number" min={0} value={entry.so_khach} onChange={(e) => updateEntry(i, { so_khach: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("FOC (mỗi X miễn Y)")}</label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={0} value={entry.foc_khach ?? ""} onChange={(e) => updateEntry(i, { foc_khach: e.target.value === "" ? null : parseInt(e.target.value) || 0 })} className="text-xs h-8" placeholder="—" />
                      <span className="text-xs text-muted-foreground">免</span>
                      <Input type="number" min={0} value={entry.foc ?? ""} onChange={(e) => updateEntry(i, { foc: e.target.value === "" ? null : parseInt(e.target.value) || 0 })} className="text-xs h-8" placeholder="—" />
                    </div>
                  </div>
                </div>

                {/* Items table — cột CK% áp main row */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">{t("Bảng chi tiết")}</label>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          {[t("Số lượng"), t("Đơn giá"), t("CK %"), t("Thành tiền"), t("Ghi chú")].map((h) => (
                            <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entry.items.map((item, j) => {
                          const gross = item.so_luong * item.don_gia;
                          // CK RIÊNG từng dòng, làm tròn ĐÚNG như bản Word
                          // (applyChietKhau làm tròn phần CÒN LẠI, không làm tròn
                          // phần chiết khấu) → tổng cột này khớp "Tổng (đã trừ CK)".
                          const net = applyChietKhau(gross, item.chiet_khau_phan_tram ?? 0);
                          return (
                            <tr key={j}>
                              <td className="border border-gray-300 p-0.5 w-20">
                                <Input type="number" min={0} value={item.so_luong} onChange={(e) => updateItem(i, j, { so_luong: parseInt(e.target.value) || 0 })} className="h-7 text-xs border-0 px-1 text-center" />
                              </td>
                              <td className="border border-gray-300 p-0.5 w-32">
                                <DecimalInput value={item.don_gia} onChange={(v) => updateItem(i, j, { don_gia: v })} className="h-7 text-xs border-0 px-1 text-right" />
                              </td>
                              <td className="border border-gray-300 p-0.5 w-20">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  value={item.chiet_khau_phan_tram ?? 0}
                                  onChange={(e) => {
                                    const pct = parseFloat(e.target.value) || 0;
                                    if (j === 0) updateMainCk(i, pct);
                                    else updateItem(i, j, { chiet_khau_phan_tram: pct });
                                  }}
                                  className="h-7 text-xs border-0 px-1 text-center"
                                  placeholder="0"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-1 text-right font-medium whitespace-nowrap w-32">
                                {fmt(net)}
                              </td>
                              <td className="border border-gray-300 p-0.5">
                                <Input value={item.ghi_chu} onChange={(e) => updateItem(i, j, { ghi_chu: e.target.value })} className="h-7 text-xs border-0 px-1" placeholder={t("Ghi chú...")} />
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-gray-50 font-semibold">
                          <td colSpan={3} className="border border-gray-300 px-2 py-1 text-right text-[11px]">{t("Tổng (đã trừ CK)")}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-[11px]">{fmt(totalSauCk)}</td>
                          <td className="border border-gray-300" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bản in vs ĐNTT: lệch = ĐNTT tạo trước khi sửa giá (hoặc quên tạo
                    lại). In ra sẽ có Tổng tiền không khớp Số tiền còn thanh toán. */}
                {lechDntt.canhBao && (
                  <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {t("Tổng dòng lệch số tiền ĐNTT")}: {lechDntt.lech > 0 ? "+" : "−"}
                        <span className="tabular-nums">{fmt(Math.abs(lechDntt.lech))} ₫</span>
                      </div>
                      <div className="tabular-nums">
                        {t("Tổng (đã trừ CK)")} {fmt(totalSauCk)} ₫
                        {entry.so_tien_coc > 0 ? <> − {t("đã trả trước")} {fmt(entry.so_tien_coc)} ₫</> : null}
                        {(entry.dntt_ngoai_dntt ?? 0) > 0 ? <> − {t("phần ngoài ĐNTT (voucher tặng / HDV trả)")} {fmt(entry.dntt_ngoai_dntt ?? 0)} ₫</> : null}
                        {" ≠ "}
                        {t("ĐNTT")} #{entry.dntt_id} {fmt(entry.dntt_so_tien ?? 0)} ₫
                      </div>
                      <div>{t("ĐNTT được tạo trước khi sửa giá — sửa dòng cho khớp, hoặc hủy ĐNTT và tạo lại rồi in.")}</div>
                    </div>
                  </div>
                )}

                {/* Voucher (phần suất chính trả bằng voucher) — read-only, đã trừ vào "còn TT" */}
                {(entry.voucher_amount ?? 0) > 0 && (
                  <div className="text-xs text-purple-700 bg-purple-50 rounded px-2 py-1">
                    🎟 {t("Trả bằng voucher")}: <span className="font-semibold tabular-nums">{fmt(entry.voucher_amount ?? 0)} ₫</span> — {t("đã cộng vào Cấn trừ khi in")}
                  </div>
                )}
                {/* Cọc / cấn trừ / còn TT */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Tiền cọc đã TT")}</label>
                    <Input type="number" min={0} value={entry.so_tien_coc} onChange={(e) => updateEntry(i, { so_tien_coc: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Cấn trừ")}</label>
                    <Input type="number" min={0} value={entry.can_tru} onChange={(e) => updateEntry(i, { can_tru: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">{t("Còn lại phải TT")}</label>
                    <Input type="number" min={0} value={entry.so_tien_con_tt} onChange={(e) => updateEntry(i, { so_tien_con_tt: parseInt(e.target.value) || 0 })} className="text-xs h-8 font-semibold text-red-700" />
                  </div>
                </div>

                {/* Tài khoản thanh toán */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">{t("Tài khoản thanh toán")}</label>
                  <Textarea
                    value={entry.tai_khoan_thanh_toan ?? ""}
                    onChange={(e) => updateEntry(i, { tai_khoan_thanh_toan: e.target.value || null })}
                    rows={2}
                    className="text-xs resize-none"
                    placeholder={t("Tên, số TK, ngân hàng...")}
                  />
                </div>
              </div>
            );
          })}

          {/* Người đề nghị */}
          <div className="space-y-1 pb-1">
            <label className="text-[11px] text-muted-foreground">{t("Người đề nghị")}</label>
            <Input value={nguoiDeNghi} onChange={(e) => setNguoiDeNghi(e.target.value)} className="text-xs h-8 max-w-xs" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 shrink-0 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>{t("Hủy")}</Button>
          <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? t("Đang xuất...") : t("Xuất Word")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
