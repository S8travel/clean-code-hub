import { useState, useEffect, useRef } from "react";
import { Ban, Trash2, Printer, Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HDVHoTroItem } from "@/hooks/use-chi-phi-hdv";
import { STATUS_LABEL, type DnttLite, type CongNoLite, type KhacCancelTarget } from "./hdv-shared";
import { resolveHoTroNguoiTt, TIP_LAI_XE_REF, TIP_LAI_XE_NOTES } from "./hdv-shared";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Row hỗ trợ HDV — local state với ref mirror.
// Lift state vào row giúp keystroke không re-render bảng. Ref mirror đảm bảo
// triggerSave (gọi qua setTimeout từ DecimalInput.onBlur) đọc value mới nhất,
// không bị stale closure khi user blur xong chuyển tab.
export function HDVHoTroRow({
  item, isTipLaiXe, pending, onSave, onDelete,
  dnttList, congNoList, canTruByDnttId, rowDnttIds,
  isSelectable, isSelected, onToggleSelect,
  editingId, editAmount, updatePending,
  onOpenModal, onStartEdit, onCancelEdit, onEditAmountChange, onSaveEdit, onOpenCancel, onPrintDntt,
  locked = false,
}: {
  item: HDVHoTroItem;
  isTipLaiXe: boolean;
  pending: boolean;
  onSave: (
    id: number,
    payload: { mo_ta: string; so_luong: number; don_gia: number; nguoi_tt: "cong_ty" | "hdv" },
  ) => void;
  onDelete: (id: number) => void;
  dnttList: DnttLite[];
  congNoList: CongNoLite[];
  canTruByDnttId: Record<number, number>;
  rowDnttIds: number[];
  isSelectable: boolean;
  isSelected: boolean;
  onToggleSelect: (checked: boolean) => void;
  editingId: number | null;
  editAmount: string;
  updatePending: boolean;
  onOpenModal: () => void;
  onStartEdit: (id: number, soTien: number) => void;
  onCancelEdit: () => void;
  onEditAmountChange: (v: string) => void;
  onSaveEdit: (id: number) => void;
  onOpenCancel: (target: KhacCancelTarget) => void;
  onPrintDntt: (dnttId: number) => void;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}) {
  const [moTa, setMoTaState] = useState(item.mo_ta ?? "");
  const [soLuong, setSoLuongState] = useState(item.so_luong);
  const [donGia, setDonGiaState] = useState(item.don_gia);
  const [nguoiTt, setNguoiTtState] = useState<"cong_ty" | "hdv">(resolveHoTroNguoiTt(item));

  // Ref mirror — sync update để triggerSave luôn đọc giá trị mới nhất.
  const stateRef = useRef({ moTa, soLuong, donGia, nguoiTt });

  const setMoTa = (v: string) => { stateRef.current.moTa = v; setMoTaState(v); };
  const setSoLuong = (v: number) => { stateRef.current.soLuong = v; setSoLuongState(v); };
  const setDonGia = (v: number) => { stateRef.current.donGia = v; setDonGiaState(v); };
  const setNguoiTt = (v: "cong_ty" | "hdv") => { stateRef.current.nguoiTt = v; setNguoiTtState(v); };

  // Re-sync khi item.id đổi (row bị thay) hoặc external update từ refetch.
  // Dùng JSON.stringify để chỉ sync khi data thực sự khác — tránh đè edit chưa save.
  const externalKey = `${item.id}|${item.mo_ta ?? ""}|${item.so_luong}|${item.don_gia}|${item.tien_cong_ty}|${item.tien_hdv}`;
  const lastSyncedKeyRef = useRef(externalKey);
  useEffect(() => {
    if (lastSyncedKeyRef.current !== externalKey) {
      lastSyncedKeyRef.current = externalKey;
      const newNguoi = resolveHoTroNguoiTt(item);
      stateRef.current = {
        moTa: item.mo_ta ?? "",
        soLuong: item.so_luong,
        donGia: item.don_gia,
        nguoiTt: newNguoi,
      };
      setMoTaState(item.mo_ta ?? "");
      setSoLuongState(item.so_luong);
      setDonGiaState(item.don_gia);
      setNguoiTtState(newNguoi);
    }
  }, [externalKey, item]);

  const triggerSave = () => {
    const s = stateRef.current;
    onSave(item.id, { mo_ta: s.moTa, so_luong: s.soLuong, don_gia: s.donGia, nguoi_tt: s.nguoiTt });
  };

  const handleToggleNguoiTt = () => {
    const next: "cong_ty" | "hdv" = stateRef.current.nguoiTt === "hdv" ? "cong_ty" : "hdv";
    setNguoiTt(next);
    triggerSave();
  };

  const itemMoTa = item.mo_ta ?? "";
  const curNguoiTt = resolveHoTroNguoiTt(item);
  const isDirty =
    soLuong !== item.so_luong ||
    donGia !== item.don_gia ||
    moTa !== itemMoTa ||
    nguoiTt !== curNguoiTt;
  const thanhTien = soLuong * donGia;

  // ── DNTT derived (chỉ tính cho row nguoi_tt = cong_ty) ───────────────────
  // Lookup theo allocations map (rowDnttIds) — bao gồm cả ĐNTT gộp có ref_id
  // trỏ về row khác trong nhóm.
  const allDntts = dnttList.filter((d) => rowDnttIds.includes(d.id));
  const activeDntts = allDntts.filter(
    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
  const rejectedDntts = allDntts.filter((d) => d.trang_thai_duyet === "tu_choi");
  const paidDntts = activeDntts.filter((d) => d.payment_status === "paid");
  const pendingDntts = activeDntts.filter((d) => d.payment_status !== "paid");
  const dnttIds = allDntts.map((d) => d.id);
  const congNoAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
    .reduce((s, c) => s + c.so_tien_con_lai, 0);
  const hoanTienAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
    .reduce((s, c) => s + c.so_tien_goc, 0);
  const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
  const canCancel = activeDntt && (
    activeDntt.trang_thai_duyet === "cho_duyet" ||
    activeDntt.trang_thai_duyet === "da_duyet" ||
    activeDntt.payment_status === "paid"
  );
  const shownDntts = [...activeDntts, ...rejectedDntts];

  return (
    <tr className={cn("hover:bg-muted/20", isSelected && "bg-sky-50/60")}>
      <td className="px-2 py-2 text-center align-middle">
        <Checkbox
          checked={isSelected}
          disabled={!isSelectable}
          onCheckedChange={(v) => onToggleSelect(!!v)}
          className="h-3.5 w-3.5"
        />
      </td>
      <td className="px-3 py-2">
        {isTipLaiXe ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-semibold underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 cursor-help">
                {t("Tip lái xe")}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="p-0">
              <div className="text-[11px]">
                <div className="px-2 py-1 font-semibold border-b bg-muted/40">
                  {t("Tip lái xe tham khảo (VND)")}
                </div>
                <table className="text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="px-2 py-0.5 text-left font-medium" />
                      <th className="px-2 py-0.5 text-right font-medium">MT</th>
                      <th className="px-2 py-0.5 text-right font-medium">PQ</th>
                      <th className="px-2 py-0.5 text-right font-medium">MN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TIP_LAI_XE_REF.map((r) => (
                      <tr key={r.seats}>
                        <td className="px-2 py-0.5 text-left font-medium">{r.seats}</td>
                        <td className="px-2 py-0.5 text-right tabular-nums">{fmt(r.mt)}</td>
                        <td className="px-2 py-0.5 text-right tabular-nums">{fmt(r.pq)}</td>
                        <td className="px-2 py-0.5 text-right tabular-nums">{fmt(r.mn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 py-1 border-t space-y-0.5">
                  {TIP_LAI_XE_NOTES.map((note) => (
                    <p key={note} className="text-[10px] leading-tight">{t(note)}</p>
                  ))}
                </div>
                <div className="px-2 py-1 text-[10px] text-muted-foreground border-t">
                  {t("MT: miền Trung · PQ: Phú Quốc · MN: miền Nam · 16C/35C/45C: số chỗ xe")}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Input
            type="text"
            value={moTa}
            disabled={locked}
            onChange={(e) => setMoTa(e.target.value)}
            onBlur={triggerSave}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
            placeholder={t("VD: Công tác phí, Tiền ngủ, ...")}
            className="h-7 text-xs"
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <Input
          type="number"
          value={soLuong || ""}
          disabled={locked}
          onChange={(e) => setSoLuong(Number(e.target.value) || 0)}
          onBlur={triggerSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs px-1.5 py-0 text-center w-16 ml-auto"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <DecimalInput
          value={donGia}
          onChange={setDonGia}
          onBlur={triggerSave}
          disabled={locked}
          className="h-6 text-xs px-1.5 py-0 text-right w-28 ml-auto"
        />
      </td>
      <td className="px-4 py-2.5 text-right font-medium">
        {fmt(thanhTien)} ₫
        {isDirty && <span className="ml-1 text-[10px] text-amber-600">*</span>}
      </td>
      <td className="px-2 py-2 text-center">
        <button
          onClick={handleToggleNguoiTt}
          disabled={pending || locked}
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
            nguoiTt === "cong_ty"
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
              : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200",
          )}
        >
          {nguoiTt === "cong_ty" ? t("Công ty") : "HDV"}
        </button>
      </td>

      {/* TT ĐNTT */}
      <td className="px-3 py-2 align-top">
        {nguoiTt === "hdv" ? (
          <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
        ) : shownDntts.length === 0 ? (
          <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
        ) : (
          <div className="space-y-1.5 flex flex-col items-center">
            {shownDntts.map((d) => {
              const isRejected = d.trang_thai_duyet === "tu_choi";
              const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
              return (
                <div key={d.id} className="flex items-center gap-1.5 flex-wrap justify-center">
                  {isRejected ? (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.cls}`}>
                      {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                    </span>
                  ) : editingId === d.id ? (
                    <>
                      <Input autoFocus type="number" value={editAmount}
                        onChange={(e) => onEditAmountChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveEdit(d.id);
                          if (e.key === "Escape") onCancelEdit();
                        }}
                        className="h-6 w-20 text-xs px-2 py-0" />
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600"
                        disabled={updatePending}
                        onClick={() => onSaveEdit(d.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground"
                        onClick={onCancelEdit}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const ct = canTruByDnttId[d.id] || 0;
                        const thucTT = Math.max(0, d.so_tien - ct);
                        return (
                          <div className="inline-flex flex-col items-start gap-0.5">
                            <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
                              {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                              {d.la_coc && <span className="ml-1 opacity-70">·{t("Cọc")}</span>}
                            </span>
                            {ct > 0 && (
                              <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">
                                CT {fmt(ct)} → TT {fmt(thucTT)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {d.trang_thai_duyet === "cho_duyet" && (
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500"
                          title={t("Sửa số tiền")}
                          onClick={() => onStartEdit(d.id, d.so_tien)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600 hover:text-emerald-700"
                        title={t("In Giấy đề nghị hoàn ứng (Word)")}
                        onClick={() => onPrintDntt(d.id)}>
                        <Printer className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </td>

      {/* TT Thanh toán */}
      <td className="px-3 py-2 align-top">
        {nguoiTt === "hdv" ? (
          <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
        ) : (
          <div className="space-y-1.5 flex flex-col items-center">
            {activeDntts.map((d) => (
              <div key={d.id}>
                {d.payment_status === "paid" ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                    {t("Đã TT")}
                    {d.thanh_toan_luc ? ` ${new Date(d.thanh_toan_luc).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}` : ""}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                    {t("Chờ UNC")} · {fmt(d.so_tien - (d.paid_amount || 0))}
                  </span>
                )}
              </div>
            ))}
            {congNoAmount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap">
                CN: {fmt(congNoAmount)}
              </span>
            )}
            {hoanTienAmount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                HT: {fmt(hoanTienAmount)}
              </span>
            )}
            {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1 justify-end">
          {nguoiTt === "cong_ty" && canCancel && activeDntt && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              title={t("Hủy ĐNTT")}
              onClick={() => onOpenCancel({ dnttId: activeDntt.id, isPaid: activeDntt.payment_status === "paid" })}>
              <Ban className="h-3 w-3" />
            </Button>
          )}
          {nguoiTt === "cong_ty" && activeDntts.length === 0 && thanhTien > 0 && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
              onClick={onOpenModal}>
              {t("ĐNTT")}
            </Button>
          )}
          {!isTipLaiXe && (
            <Button
              size="icon" variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item.id)}
              disabled={pending || locked}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
