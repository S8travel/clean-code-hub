import { useEffect, useState } from "react";
import { Plus, Check, X, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { externalSupabase } from "@/lib/supabase-external";
import {
  useDoanNhomList, useCreateDoanNhom, useUpdateDoanNhom, useDeleteDoanNhom,
} from "@/hooks/use-doan-nhom";
import { useChiPhiLocked } from "@/hooks/use-chi-phi-lock";
import { useQueryClient } from "@tanstack/react-query";
import { t, useTranslate } from "@/lib/i18n";

interface NhomDraft {
  /** Có id = nhóm hiện có; null = nhóm mới chưa lưu */
  id: number | null;
  ten_nhom: string;
  so_khach_lon: number;
  so_khach_em1: number;
  so_khach_em2: number;
  so_khach_tl: number;
  thu_tu: number;
}

interface Props {
  doanId: number;
  /** Mở modal cho 3 use case:
   *  - "split": đang 1 nhóm, tách thành nhiều — pre-populate thêm 1 nhóm mới rỗng
   *  - "add": có nhiều nhóm rồi, add thêm 1 — pre-populate thêm 1 nhóm mới rỗng
   *  - "redistribute": chia lại số khách giữa các nhóm hiện có */
  mode: "split" | "add" | "redistribute";
  /** Tổng số khách đoàn (target — phải match) */
  doanTotal: number;
  doanSoKhachLon: number;
  doanSoKhachEm1: number;
  doanSoKhachEm2: number;
  doanSoKhachTl: number;
  onClose: () => void;
  /** Callback sau khi save xong, vd switch sang nhóm mới */
  onSaved?: (createdNhomIds: number[]) => void;
}

const sumNhom = (n: { so_khach_lon: number; so_khach_em1: number; so_khach_em2: number; so_khach_tl: number }) =>
  n.so_khach_lon + n.so_khach_em1 + n.so_khach_em2 + n.so_khach_tl;

export default function SplitNhomModal({
  doanId, mode, doanTotal,
  doanSoKhachLon, doanSoKhachEm1, doanSoKhachEm2, doanSoKhachTl,
  onClose, onSaved,
}: Props) {
  useTranslate();
  const qc = useQueryClient();
  // Đoàn đã quyết toán → chia/gộp nhóm sẽ ghi lại so_luong chi phí → khóa (trừ admin).
  const locked = useChiPhiLocked(doanId);
  const { data: nhomList = [] } = useDoanNhomList(doanId);
  const createMut = useCreateDoanNhom();
  const updateMut = useUpdateDoanNhom();
  const deleteMut = useDeleteDoanNhom();
  const [submitting, setSubmitting] = useState(false);

  const [drafts, setDrafts] = useState<NhomDraft[]>([]);

  // Init drafts khi mở modal
  useEffect(() => {
    const existing: NhomDraft[] = nhomList.map((n) => ({
      id: n.id,
      ten_nhom: n.ten_nhom,
      so_khach_lon: n.so_khach_lon ?? 0,
      so_khach_em1: n.so_khach_em1 ?? 0,
      so_khach_em2: n.so_khach_em2 ?? 0,
      so_khach_tl: n.so_khach_tl ?? 0,
      thu_tu: n.thu_tu,
    }));

    if (mode === "split" || mode === "add") {
      // Thêm 1 nhóm mới rỗng
      const nextThuTu = (existing[existing.length - 1]?.thu_tu ?? 0) + 1;
      existing.push({
        id: null,
        ten_nhom: `Nhóm ${nextThuTu}`,
        so_khach_lon: 0,
        so_khach_em1: 0,
        so_khach_em2: 0,
        so_khach_tl: 0,
        thu_tu: nextThuTu,
      });
    }
    setDrafts(existing);
  }, [mode, nhomList]);

  const tongNhap = drafts.reduce((s, d) => s + sumNhom(d), 0);
  const tongLon = drafts.reduce((s, d) => s + d.so_khach_lon, 0);
  const tongEm1 = drafts.reduce((s, d) => s + d.so_khach_em1, 0);
  const tongEm2 = drafts.reduce((s, d) => s + d.so_khach_em2, 0);
  const tongTl = drafts.reduce((s, d) => s + d.so_khach_tl, 0);

  // Match theo từng category (lớn / em1 / em2 / tl) — đảm bảo phân loại đúng
  const matchLon = tongLon === doanSoKhachLon;
  const matchEm1 = tongEm1 === doanSoKhachEm1;
  const matchEm2 = tongEm2 === doanSoKhachEm2;
  const matchTl = tongTl === doanSoKhachTl;
  const allMatch = matchLon && matchEm1 && matchEm2 && matchTl;

  const updateDraft = <K extends keyof NhomDraft>(idx: number, field: K, value: NhomDraft[K]) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (locked) {
      toast.error(t("Đoàn đã quyết toán — chi phí đã khóa. Chỉ admin mới sửa được."));
      return;
    }
    if (!allMatch) {
      toast.error(t("Tổng số khách các nhóm phải bằng tổng đoàn"));
      return;
    }
    if (drafts.length === 0) {
      toast.error(t("Phải có ít nhất 1 nhóm"));
      return;
    }
    // Validate tên không trống
    for (const d of drafts) {
      if (!d.ten_nhom.trim()) {
        toast.error(t("Tên nhóm không được trống"));
        return;
      }
    }
    setSubmitting(true);
    try {
      // 1. Xóa các nhóm hiện có không còn trong drafts
      const draftIds = new Set(drafts.filter((d) => d.id != null).map((d) => d.id!));
      for (const existing of nhomList) {
        if (!draftIds.has(existing.id)) {
          await deleteMut.mutateAsync({ id: existing.id, doanId });
        }
      }
      // 2. Update nhóm cũ + create nhóm mới
      const createdIds: number[] = [];
      for (const d of drafts) {
        if (d.id != null) {
          await updateMut.mutateAsync({
            id: d.id,
            doanId,
            updates: {
              ten_nhom: d.ten_nhom.trim(),
              so_khach_lon: d.so_khach_lon,
              so_khach_em1: d.so_khach_em1,
              so_khach_em2: d.so_khach_em2,
              so_khach_tl: d.so_khach_tl,
            },
          });
        } else {
          const created = await createMut.mutateAsync({
            doanId,
            tenNhom: d.ten_nhom.trim(),
            soKhachLon: d.so_khach_lon,
            soKhachEm1: d.so_khach_em1,
            soKhachEm2: d.so_khach_em2,
            soKhachTl: d.so_khach_tl,
          });
          createdIds.push(created.id);
        }
      }
      // 3. Sync doan_ngay_item.so_luong cho mỗi nhóm theo tổng khách mới.
      //    Nếu không sync, chi phí cảnh điểm hiển thị so_luong cũ (vd nhóm 1
      //    chia còn 75 khách nhưng item vẫn so_luong=100). Save Điều Tour bình
      //    thường cũng làm, nhưng làm ở đây để chi phí cập nhật ngay sau split.
      //    Đồng thời re-aggregate doan_chi_phi cảnh điểm (Approach A merge).
      for (const d of drafts) {
        if (d.id == null) continue;
        const tongKhach = d.so_khach_lon + d.so_khach_em1 + d.so_khach_em2 + d.so_khach_tl;
        const { data: ngayRows } = await externalSupabase
          .from("doan_ngay")
          .select("id")
          .eq("doan_nhom_id", d.id);
        const ngayIds = (ngayRows ?? []).map((r) => r.id);
        if (ngayIds.length > 0) {
          await externalSupabase
            .from("doan_ngay_item")
            .update({ so_luong: tongKhach })
            .in("doan_ngay_id", ngayIds);
        }
      }

      // 4. Re-aggregate doan_chi_phi cảnh điểm: so_luong = SUM cross-nhóm
      //    cho cùng (mo_ta cảnh điểm, ngay_so).
      //    Skip is_overridden (OP tự quản) + paid/partial_paid (đã cọc/đã trả —
      //    ghi đè sẽ mất dấu cam kết → ĐNTT khoản còn lại tính sai). Giống cascade
      //    rebooking ở use-doan.ts. ĐNTT cho_duyet/da_duyet vẫn cascade nhưng đếm
      //    lại để cảnh báo OP (số tiền ĐNTT cũ không còn khớp số khách mới).
      let committedDnttAffected = 0;
      const idsToRecalc: number[] = [];
      const { data: cpCanhDiem } = await externalSupabase
        .from("doan_chi_phi")
        .select("id, mo_ta, ngay_so, so_luong, don_gia, is_overridden, tien_hdv, tien_cong_ty, trang_thai_thanh_toan, trang_thai_dntt")
        .eq("doan_id", doanId)
        .eq("danh_muc", "canh_diem");
      for (const cp of cpCanhDiem ?? []) {
        if (cp.is_overridden) continue;
        const tt = cp.trang_thai_thanh_toan;
        if (tt === "paid" || tt === "partial_paid") continue;
        if (!cp.mo_ta || cp.ngay_so == null) continue;
        const { data: ngayMatch } = await externalSupabase
          .from("doan_ngay")
          .select("id")
          .eq("doan_id", doanId)
          .eq("ngay_so", cp.ngay_so);
        const ngayMatchIds = (ngayMatch ?? []).map((r) => r.id);
        if (ngayMatchIds.length === 0) continue;
        const { data: itemRows } = await externalSupabase
          .from("doan_ngay_item")
          .select("so_luong, canh_diem:canh_diem_id(ten)")
          .in("doan_ngay_id", ngayMatchIds);
        const matchedItems = (itemRows ?? []).filter((it) => {
          const cd = it.canh_diem as { ten: string | null } | { ten: string | null }[] | null;
          const cdTen = Array.isArray(cd) ? cd[0]?.ten : cd?.ten;
          return cdTen === cp.mo_ta;
        });
        if (matchedItems.length === 0) continue;
        const newSoLuong = matchedItems.reduce((s, it) => s + (Number(it.so_luong) || 0), 0);
        if (Number(cp.so_luong) === newSoLuong) continue; // không đổi → khỏi update
        const newTotal = (cp.don_gia ?? 0) * newSoLuong;
        const isHdv = (cp.tien_hdv ?? 0) > 0 && (cp.tien_cong_ty ?? 0) === 0;
        const td = cp.trang_thai_dntt;
        if (td === "cho_duyet" || td === "da_duyet") committedDnttAffected++;
        await externalSupabase
          .from("doan_chi_phi")
          .update({
            so_luong: newSoLuong,
            tien_cong_ty: isHdv ? 0 : newTotal,
            tien_hdv: isHdv ? newTotal : 0,
            thanh_tien_thuc_te: null,
          })
          .eq("id", cp.id);
        idsToRecalc.push(cp.id);
      }
      // Recalc trạng thái thanh toán cho các row vừa đổi (dùng SUM payments, giống use-doan.ts)
      if (idsToRecalc.length > 0) {
        await externalSupabase.rpc("recalc_chi_phi_payment_status", { p_chi_phi_ids: idsToRecalc });
      }

      // 5. Invalidate cascade queries
      qc.invalidateQueries({ queryKey: ["doan_nhom", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_ks_data", doanId] });

      // Sanity check tổng doan vs sum nhóm — nếu khác, sync vào doan
      // (KHÔNG bao giờ nên xảy ra vì validate ở UI; defense)
      if (tongLon !== doanSoKhachLon || tongEm1 !== doanSoKhachEm1
          || tongEm2 !== doanSoKhachEm2 || tongTl !== doanSoKhachTl) {
        await externalSupabase
          .from("doan")
          .update({
            so_khach_lon: tongLon,
            so_khach_em1: tongEm1,
            so_khach_em2: tongEm2,
            so_khach_tl: tongTl,
          })
          .eq("id", doanId);
        qc.invalidateQueries({ queryKey: ["doan"] });
      }

      toast.success(t("Đã lưu phân chia nhóm"));
      if (committedDnttAffected > 0) {
        toast.warning(
          `${committedDnttAffected} ${t("chi phí cảnh điểm đang gắn ĐNTT bị đổi số khách — kiểm tra lại số tiền ĐNTT.")}`,
          { duration: 6000 },
        );
      }
      onSaved?.(createdIds);
      onClose();
    } catch (e: unknown) {
      toast.error(t("Lỗi lưu nhóm: ") + (errMsg(e) || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "split" ? t("Tách đoàn thành nhiều nhóm")
              : mode === "add"   ? t("Thêm nhóm mới")
              :                    t("Chia lại số khách giữa các nhóm");

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Target totals */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
          <div className="font-semibold">{t("Tổng đoàn (từ DoanDrawer)")}:</div>
          <div className="grid grid-cols-5 gap-2 text-muted-foreground">
            <div>{t("NL")}: <b className="text-foreground">{doanSoKhachLon}</b></div>
            <div>{t("TE 50%")}: <b className="text-foreground">{doanSoKhachEm1}</b></div>
            <div>{t("TE free")}: <b className="text-foreground">{doanSoKhachEm2}</b></div>
            <div>{t("T/L")}: <b className="text-foreground">{doanSoKhachTl}</b></div>
            <div>{t("Tổng")}: <b className="text-foreground">{doanTotal}</b></div>
          </div>
        </div>

        {/* Drafts table */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {drafts.map((d, idx) => {
            const sum = sumNhom(d);
            return (
              <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={d.ten_nhom}
                    onChange={(e) => updateDraft(idx, "ten_nhom", e.target.value)}
                    placeholder={t("Tên nhóm (vd: Tham quan 75 khách)")}
                    className="h-8 text-sm flex-1"
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {t("Tổng nhóm")}: <b className="text-foreground">{sum}</b>
                  </span>
                  {drafts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => removeDraft(idx)}
                      title={t("Xóa nhóm")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <NumberInput label={t("NL (Người lớn)")} value={d.so_khach_lon}
                    onChange={(v) => updateDraft(idx, "so_khach_lon", v)} />
                  <NumberInput label={t("TE 50% (Em 1)")} value={d.so_khach_em1}
                    onChange={(v) => updateDraft(idx, "so_khach_em1", v)} />
                  <NumberInput label={t("TE free (Em 2)")} value={d.so_khach_em2}
                    onChange={(v) => updateDraft(idx, "so_khach_em2", v)} />
                  <NumberInput label={t("T/L (Trưởng đoàn)")} value={d.so_khach_tl}
                    onChange={(v) => updateDraft(idx, "so_khach_tl", v)} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Sum validation */}
        <div className={cn(
          "rounded-lg border px-3 py-2 text-xs space-y-1",
          allMatch ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
        )}>
          <div className="flex items-center gap-1.5">
            {allMatch ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-red-600" />
            )}
            <span className={cn("font-semibold", allMatch ? "text-emerald-700" : "text-red-700")}>
              {allMatch
                ? t("Tổng các nhóm khớp với đoàn — sẵn sàng lưu")
                : t("Tổng các nhóm CHƯA khớp với đoàn — không thể lưu")}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-muted-foreground">
            <CategoryCheck label={t("NL")} sum={tongLon} target={doanSoKhachLon} />
            <CategoryCheck label={t("TE 50%")} sum={tongEm1} target={doanSoKhachEm1} />
            <CategoryCheck label={t("TE free")} sum={tongEm2} target={doanSoKhachEm2} />
            <CategoryCheck label={t("T/L")} sum={tongTl} target={doanSoKhachTl} />
            <CategoryCheck label={t("Tổng")} sum={tongNhap} target={doanTotal} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 mr-auto"
            onClick={() => {
              const nextThuTu = (drafts[drafts.length - 1]?.thu_tu ?? 0) + 1;
              setDrafts((prev) => [...prev, {
                id: null,
                ten_nhom: `Nhóm ${nextThuTu}`,
                so_khach_lon: 0,
                so_khach_em1: 0,
                so_khach_em2: 0,
                so_khach_tl: 0,
                thu_tu: nextThuTu,
              }]);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Thêm nhóm")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            <X className="h-3.5 w-3.5 mr-1" /> {t("Hủy")}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!allMatch || submitting}>
            <Check className="h-3.5 w-3.5 mr-1" /> {t("Lưu")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberInput({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(Number.isFinite(v) && v >= 0 ? v : 0);
        }}
        placeholder="0"
        className="h-8 text-sm text-right"
      />
    </div>
  );
}

function CategoryCheck({ label, sum, target }: { label: string; sum: number; target: number }) {
  const match = sum === target;
  return (
    <div className="flex items-center gap-1">
      <span>{label}:</span>
      <b className={match ? "text-emerald-700" : "text-red-700"}>
        {sum}
        {!match && <span className="ml-0.5">/{target}</span>}
      </b>
    </div>
  );
}
