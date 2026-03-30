import { useState } from "react";
import { format } from "date-fns";
import { Check, Pencil, X, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useChiPhiList, useDNTTList, useInsertDNTT, type DNTTRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT } from "@/hooks/use-dntt";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { text: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

interface CocTarget { chiPhiId: number; thanhTien: number; moTa: string; nccId: number | null }
interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  doanId: number;
  tenDoan?: string;
}

export default function ChiPhiDVSection({ doanId, tenDoan }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const cancelMut = useCancelDNTT();

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Cọc dialog
  const [cocTarget, setCocTarget] = useState<CocTarget | null>(null);
  const [cocMode, setCocMode] = useState<"percent" | "amount">("percent");
  const [cocValue, setCocValue] = useState(30);

  // Resend dialog (rejected)
  const [resendTarget, setResendTarget] = useState<DNTTRow | null>(null);
  const [resendMode, setResendMode] = useState<"full" | "partial">("full");
  const [resendAmount, setResendAmount] = useState(0);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  const dvRows = chiPhiRows.filter(
    (r) => r.danh_muc === "canh_diem" && r.tien_cong_ty > 0,
  );

  if (dvRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        🎫 Chưa có dịch vụ nào (có phí, công ty trả) trong chương trình.
        <br />
        <span className="text-xs">Vào mục Điều Tour → thêm dịch vụ có phí vào chương trình ngày.</span>
      </div>
    );
  }

  const total = dvRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  // Nhóm theo ngày
  const byDay = new Map<number, typeof dvRows>();
  for (const row of dvRows) {
    const day = row.ngay_so ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSendDNTT = (
    chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null,
    laCoc: boolean, soTien: number, tyleCoc?: number,
  ) => {
    insertDNTT.mutate({
      doan_id: doanId,
      loai: "dich_vu",
      mo_ta: moTa || tenDoan || "Dịch vụ",
      nha_cung_cap_id: nccId,
      so_tien: soTien,
      la_coc: laCoc,
      ty_le_coc: tyleCoc ?? null,
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      ref_loai: "doan_chi_phi",
      ref_id: chiPhiId,
      so_tien_con_lai: laCoc ? thanhTien - soTien : 0,
    } as any, {
      onSuccess: () => toast.success("Đã gửi ĐNTT"),
    });
  };

  const handleCocSubmit = () => {
    if (!cocTarget) return;
    const { chiPhiId, thanhTien, moTa, nccId } = cocTarget;
    const soTien = cocMode === "percent"
      ? Math.round(thanhTien * cocValue / 100)
      : cocValue;
    if (soTien <= 0 || soTien >= thanhTien) {
      toast.error("Số tiền cọc không hợp lệ");
      return;
    }
    handleSendDNTT(chiPhiId, thanhTien, moTa, nccId, true, soTien, cocMode === "percent" ? cocValue : undefined);
    setCocTarget(null);
  };

  const handleResendSubmit = () => {
    if (!resendTarget) return;
    const soTien = resendMode === "full" ? resendTarget.so_tien : resendAmount;
    if (soTien <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({
      id: resendTarget.id,
      doanId,
      so_tien: soTien,
      trang_thai_duyet: "cho_duyet",
      trang_thai_thanh_toan: "chua_tt",
      so_tien_con_lai: 0,
      duyet_boi: null,
      duyet_luc: null,
      ghi_chu: null,
    } as any, {
      onSuccess: () => { toast.success("Đã gửi lại ĐNTT"); setResendTarget(null); },
    });
  };

  const handleEditSave = (id: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!v || v <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({ id, doanId, so_tien: v } as any, {
      onSuccess: () => { toast.success("Đã cập nhật"); setEditingId(null); },
    });
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => { toast.success("Đã hủy"); setCancelTarget(null); },
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy"),
      },
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold">🎫 Dịch vụ</p>
        <span className="text-xs text-muted-foreground">Tổng: {fmt(total)} ₫</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "40px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "120px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-3 py-2">Ngày</th>
              <th className="text-left px-3 py-2">Dịch vụ</th>
              <th className="text-center px-2 py-2">SL</th>
              <th className="text-right px-3 py-2">Đơn giá</th>
              <th className="text-right px-3 py-2">Thành tiền</th>
              <th className="text-center px-2 py-2">TT ĐNTT</th>
              <th className="text-center px-2 py-2">TT Thanh toán</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedDays.map(([day, rows]) =>
              rows.map((row, i) => {
                const allDntts = dnttList.filter(
                  d => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
                );
                const activeDntts = allDntts.filter(
                  d => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                );
                const rejectedDntts = allDntts.filter(d => d.trang_thai_duyet === "tu_choi");
                const paidDntts = activeDntts.filter(d => d.trang_thai_thanh_toan === "da_tt");
                const pendingDntts = activeDntts.filter(d => d.trang_thai_thanh_toan !== "da_tt");
                const daTT = paidDntts.reduce((s, d) => s + d.so_tien, 0);
                const daDeNghi = pendingDntts.reduce((s, d) => s + d.so_tien, 0);
                const thanhTien = row.tien_cong_ty;
                const isDaTT = thanhTien > 0 && daTT >= thanhTien;
                const conLai = Math.max(0, thanhTien - daTT);
                const congNoAmount = allDntts.filter(
                  d => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no",
                ).reduce((s, d) => s + d.so_tien, 0);
                const hoanTienAmount = allDntts.filter(
                  d => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien",
                ).reduce((s, d) => s + d.so_tien, 0);
                const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
                const canCancel = activeDntt && (
                  activeDntt.trang_thai_duyet === "cho_duyet" ||
                  activeDntt.trang_thai_duyet === "da_duyet" ||
                  activeDntt.trang_thai_thanh_toan === "da_tt"
                );
                const shownDntts = [...activeDntts, ...rejectedDntts];

                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    {/* Ngày */}
                    {i === 0 && (
                      <td className="px-3 py-2 text-muted-foreground align-top" rowSpan={rows.length}>
                        {day > 0 ? `Ngày ${day}` : "—"}
                      </td>
                    )}

                    {/* Dịch vụ */}
                    <td className="px-3 py-2 font-medium">{row.mo_ta || "—"}</td>

                    {/* SL */}
                    <td className="px-2 py-2 text-center text-muted-foreground">{row.so_luong}</td>

                    {/* Đơn giá */}
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.don_gia)} ₫</td>

                    {/* Thành tiền */}
                    <td className="px-3 py-2 text-right font-semibold text-primary">{fmt(thanhTien)} ₫</td>

                    {/* TT ĐNTT */}
                    <td className="px-2 py-2 align-top">
                      {shownDntts.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1 flex flex-col items-center">
                          {shownDntts.map(d => {
                            const isRejected = d.trang_thai_duyet === "tu_choi";
                            const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                            return (
                              <div key={d.id} className="flex items-center gap-1 flex-wrap justify-center">
                                {isRejected ? (
                                  <>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.cls}`}>
                                      {statusInfo.text} · {fmt(d.so_tien)}
                                    </span>
                                    <Button variant="outline" size="sm" className="h-5 text-[10px] px-1.5"
                                      onClick={() => { setResendTarget(d); setResendMode("full"); setResendAmount(d.so_tien); }}>
                                      Gửi lại
                                    </Button>
                                  </>
                                ) : editingId === d.id ? (
                                  <>
                                    <Input autoFocus type="number" value={editAmount}
                                      onChange={e => setEditAmount(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleEditSave(d.id);
                                        if (e.key === "Escape") setEditingId(null);
                                      }}
                                      className="h-6 w-20 text-xs px-2 py-0" />
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600"
                                      disabled={updateDNTT.isPending}
                                      onClick={() => handleEditSave(d.id)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground"
                                      onClick={() => setEditingId(null)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.cls}`}>
                                      {statusInfo.text} · {fmt(d.so_tien)}
                                    </span>
                                    {d.la_coc && <span className="text-[9px] text-muted-foreground">(Cọc)</span>}
                                    {d.trang_thai_duyet === "cho_duyet" && (
                                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500"
                                        onClick={() => { setEditingId(d.id); setEditAmount(String(d.so_tien)); }}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* TT Thanh toán */}
                    <td className="px-2 py-2 align-top">
                      <div className="space-y-1 flex flex-col items-center">
                        {activeDntts.map(d => (
                          <div key={d.id}>
                            {d.trang_thai_thanh_toan === "da_tt" ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                Đã TT{d.ngay_thanh_toan ? ` ${format(new Date(d.ngay_thanh_toan), "dd/MM")}` : ""}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                                Chờ UNC · {fmt(d.so_tien)}
                              </span>
                            )}
                          </div>
                        ))}
                        {congNoAmount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                            CN: {fmt(congNoAmount)}
                          </span>
                        )}
                        {hoanTienAmount > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                            HT: {fmt(hoanTienAmount)}
                          </span>
                        )}
                        {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        {canCancel && activeDntt && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            title="Hủy ĐNTT"
                            onClick={() => {
                              setCancelMode("hoan_tien");
                              setCancelTarget({ dnttId: activeDntt.id, isPaid: activeDntt.trang_thai_thanh_toan === "da_tt" });
                            }}>
                            <Ban className="h-3 w-3" />
                          </Button>
                        )}
                        {activeDntts.length === 0 && thanhTien > 0 && (
                          <>
                            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                              disabled={insertDNTT.isPending}
                              onClick={() => handleSendDNTT(row.id!, thanhTien, row.mo_ta || "", row.nha_cung_cap_id, false, thanhTien)}>
                              ĐNTT
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                              disabled={insertDNTT.isPending}
                              onClick={() => { setCocMode("percent"); setCocValue(30); setCocTarget({ chiPhiId: row.id!, thanhTien, moTa: row.mo_ta || "", nccId: row.nha_cung_cap_id }); }}>
                              Cọc
                            </Button>
                          </>
                        )}
                        {activeDntts.length > 0 && daDeNghi === 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                            disabled={insertDNTT.isPending}
                            onClick={() => handleSendDNTT(row.id!, thanhTien, row.mo_ta || "", row.nha_cung_cap_id, false, conLai > 0 ? conLai : thanhTien)}>
                            {conLai > 0 ? "ĐNTT còn lại" : "ĐNTT bổ sung"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      {/* Cọc Dialog */}
      <Dialog open={!!cocTarget} onOpenChange={v => { if (!v) setCocTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-sm">Gửi cọc</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Thành tiền: {fmt(cocTarget?.thanhTien ?? 0)} VND</p>
            <RadioGroup value={cocMode} onValueChange={v => setCocMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="percent" id="dv-coc-pct" />
                <Label htmlFor="dv-coc-pct" className="text-xs">% cọc</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="amount" id="dv-coc-amt" />
                <Label htmlFor="dv-coc-amt" className="text-xs">Số tiền</Label>
              </div>
            </RadioGroup>
            <Input type="number" value={cocValue || ""}
              onChange={e => setCocValue(Number(e.target.value) || 0)}
              placeholder={cocMode === "percent" ? "VD: 30" : "VD: 5000000"}
              className="h-8 text-xs" />
            {cocMode === "percent" && cocValue > 0 && cocTarget && (
              <p className="text-xs text-muted-foreground">
                = {fmt(Math.round(cocTarget.thanhTien * cocValue / 100))} VND
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCocTarget(null)}>Hủy</Button>
            <Button size="sm" onClick={handleCocSubmit} disabled={insertDNTT.isPending}>Gửi cọc</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Dialog */}
      <Dialog open={!!resendTarget} onOpenChange={v => { if (!v) setResendTarget(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader><DialogTitle className="text-sm">Gửi lại ĐNTT</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Số tiền gốc: {fmt(resendTarget?.so_tien ?? 0)} VND</p>
            <RadioGroup value={resendMode} onValueChange={v => setResendMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="dv-resend-full" />
                <Label htmlFor="dv-resend-full" className="text-xs">Toàn bộ</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="partial" id="dv-resend-partial" />
                <Label htmlFor="dv-resend-partial" className="text-xs">1 phần</Label>
              </div>
            </RadioGroup>
            {resendMode === "partial" && (
              <Input type="number" value={resendAmount || ""}
                onChange={e => setResendAmount(Number(e.target.value) || 0)}
                placeholder="Nhập số tiền" className="h-8 text-xs" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResendTarget(null)}>Hủy</Button>
            <Button size="sm" onClick={handleResendSubmit} disabled={updateDNTT.isPending}>Gửi lại</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={v => { if (!v) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader><DialogTitle className="text-sm">Hủy đề nghị thanh toán</DialogTitle></DialogHeader>
          {cancelTarget?.isPaid && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Đã thanh toán — chọn cách xử lý:</p>
              <RadioGroup value={cancelMode} onValueChange={v => setCancelMode(v as any)} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="hoan_tien" id="dv-cancel-ht" />
                  <Label htmlFor="dv-cancel-ht" className="text-xs">Hoàn tiền</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="dv-cancel-cn" />
                  <Label htmlFor="dv-cancel-cn" className="text-xs">Ghi công nợ</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)}>Đóng</Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelMut.isPending}>Xác nhận hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
