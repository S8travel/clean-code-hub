import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { externalSupabase } from "@/lib/supabase-external";
import { useChiPhiList } from "@/hooks/use-chi-phi";
import { useKhachSanList } from "@/hooks/use-khach-san";
import {
  useDoiKsPhiHuy, fetchKsHuyResolvePending, type KsPhiHuyPending,
} from "@/hooks/use-doi-ks-phi-huy";
import DoiKsPhiHuyModal, { type DoiKsConfirmArgs } from "@/components/dieu-tour/DoiKsPhiHuyModal";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  doanId: number;
  /** Đoàn đã quyết toán → khóa nút Xử lý ngay (trừ admin, lock ở tầng hook). */
  locked?: boolean;
}

// Dải "Đã hủy" (Tầng 2) — booking KS bị hủy hiển thị đàng hoàng, GẬP mặc định.
// Rule: chỉ nổi khi cần hành động — booking "Để sau" (phi_huy NULL) → amber + tự bung
// + nút "Xử lý ngay"; đã chốt phí hủy → 1 dòng mờ. Nguồn sự thật = dòng ks_huy
// (group theo khach_san_id), booking row cấp metadata (phi_huy/ly_do/huy_luc/cong_no).
export default function KSDaHuyStrip({ doanId, locked = false }: Props) {
  useTranslate();
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: ksList = [] } = useKhachSanList();
  const doiKsMut = useDoiKsPhiHuy();
  const [resolvePending, setResolvePending] = useState<KsPhiHuyPending | null>(null);
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);

  const huyRows = chiPhiRows.filter((r) => r.danh_muc === "khach_san" && r.ks_huy);
  const ksIds = [...new Set(
    huyRows.map((r) => r.khach_san_id).filter((x): x is number => x != null),
  )];

  const { data: bookings = [] } = useQuery({
    queryKey: ["ks_da_huy", doanId],
    enabled: !!doanId && ksIds.length > 0,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_booking_ks")
        .select("id, khach_san_id, trang_thai, phi_huy, ly_do_huy, huy_luc, cong_no_id")
        .eq("doan_id", doanId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const congNoIds = bookings
    .map((b) => b.cong_no_id)
    .filter((x): x is number => x != null);
  const { data: congNos = [] } = useQuery({
    queryKey: ["ks_da_huy_cong_no", doanId, congNoIds.join(",")],
    enabled: congNoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("cong_no_with_status")
        .select("id, so_tien_goc, so_tien_con_lai, trang_thai")
        .in("id", congNoIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (ksIds.length === 0) return null;

  const entries = ksIds.map((ksId) => {
    const bk = bookings.find((b) => b.khach_san_id === ksId);
    const rows = huyRows.filter((r) => r.khach_san_id === ksId);
    const daTT = rows.reduce((s, r) => s + Number(r.so_tien_da_tt || 0), 0);
    const congNo = congNos.find((c) => c.id === bk?.cong_no_id);
    return {
      ksId,
      ten: ksList.find((k) => k.id === ksId)?.ten ?? `KS #${ksId}`,
      rows,
      daTT,
      phiHuy: bk?.phi_huy != null ? Number(bk.phi_huy) : null,
      lyDo: bk?.ly_do_huy ?? null,
      huyLuc: bk?.huy_luc ?? null,
      congNoConLai: congNo != null ? Number(congNo.so_tien_con_lai || 0) : null,
      chuaXuLy: bk?.phi_huy == null,
      // KS từng hủy nay quay lại tour (sync reactivate) — cụm cũ vẫn là lịch sử tiền,
      // hiện badge để OP biết; resolve vẫn dùng được (không đụng trang_thai booking).
      reactivated: bk?.trang_thai === "active",
    };
  });
  const anyChuaXuLy = entries.some((e) => e.chuaXuLy);
  // Gập mặc định — trừ khi có mục chưa xử lý (cần hành động) hoặc user tự mở.
  const expanded = manualToggle ?? anyChuaXuLy;

  const handleResolve = async (ksId: number) => {
    try {
      const p = await fetchKsHuyResolvePending({ doanId, ksId });
      if (!p) {
        toast.error(t("Không tìm thấy ĐNTT đã trả cho khách sạn này"));
        return;
      }
      setResolvePending(p);
    } catch (e: unknown) {
      toast.error("Lỗi: " + (errMsg(e) || ""));
    }
  };

  // variant='resolve' không có khối booking (pending.booking = null) → bỏ qua sendHuyMail.
  const handleResolveConfirm = async ({ phiHuy, lyDo }: DoiKsConfirmArgs) => {
    if (!resolvePending) return;
    try {
      const r = await doiKsMut.mutateAsync({
        doanId, pending: resolvePending, phiHuyInput: phiHuy,
        lyDo: lyDo || null, mode: "resolve",
      });
      toast.success(
        `${t("Đã chốt phí hủy")} ${fmt(r.phiHuy)} ₫` +
        (r.refund > 0 ? ` · ${t("công nợ thu hồi")} ${fmt(r.refund)} ₫` : ""),
        { duration: 8000 },
      );
      setResolvePending(null);
    } catch (e: unknown) {
      toast.error("Lỗi: " + (errMsg(e) || ""));
    }
  };

  return (
    <div className={`rounded-md border p-2 space-y-1 ${
      anyChuaXuLy ? "border-amber-300 bg-amber-50/50" : "border-border/60 bg-muted/20"
    }`}>
      <button
        className="w-full flex items-center gap-2 text-xs"
        onClick={() => setManualToggle(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Ban className={`h-3.5 w-3.5 ${anyChuaXuLy ? "text-amber-600" : "text-muted-foreground"}`} />
        <span className={`font-semibold ${anyChuaXuLy ? "text-amber-800" : "text-muted-foreground"}`}>
          {t("Đã hủy")} ({entries.length})
        </span>
        {anyChuaXuLy && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
            ⚠ {t("chưa xử lý phí hủy")}
          </span>
        )}
        {!expanded && !anyChuaXuLy && (
          <span className="text-[11px] text-muted-foreground truncate">
            {entries.map((e) => `${e.ten}${e.phiHuy != null ? ` — ${t("phí hủy")} ${fmt(e.phiHuy)} ₫` : ""}`).join(" · ")}
          </span>
        )}
      </button>

      {expanded && entries.map((e) => (
        <div key={e.ksId}
          className={`rounded border px-2.5 py-1.5 text-xs space-y-1 ${
            e.chuaXuLy ? "border-amber-300 bg-white" : "border-border/50 bg-white/60"
          }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{e.ten}</span>
            {e.huyLuc && (
              <span className="text-muted-foreground">
                {t("hủy")} {format(new Date(e.huyLuc), "dd/MM/yyyy")}
              </span>
            )}
            {e.reactivated && (
              <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-medium"
                title={t("KS này đã được xếp lại vào lịch trình — cụm dưới là lịch sử lần hủy trước")}>
                {t("đã quay lại tour")}
              </span>
            )}
            {e.chuaXuLy ? (
              <>
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                  {t("CHƯA nhập phí hủy")}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {t("đã thanh toán")} <span className="font-medium text-orange-700">{fmt(e.daTT)} ₫</span>
                </span>
                {!locked && (
                  <Button size="sm"
                    className="h-6 px-2 text-[11px] ml-auto bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={doiKsMut.isPending}
                    onClick={() => handleResolve(e.ksId)}>
                    {t("Xử lý ngay")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="tabular-nums text-muted-foreground">
                  {t("phí hủy")} <span className="font-medium text-orange-700">{fmt(e.phiHuy!)} ₫</span>
                </span>
                {e.congNoConLai != null && (
                  <span className="tabular-nums text-muted-foreground">
                    · {t("công nợ thu hồi")}{" "}
                    {e.congNoConLai > 0
                      ? <span className="font-medium text-purple-700">{t("còn")} {fmt(e.congNoConLai)} ₫</span>
                      : <span className="font-medium text-emerald-700">✓ {t("đã cấn trừ hết")}</span>}
                  </span>
                )}
              </>
            )}
          </div>
          {e.lyDo && (
            <p className="text-[11px] text-muted-foreground italic">{e.lyDo}</p>
          )}
          {e.rows.length > 0 && (
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {e.rows.map((r) => (
                <div key={r.id} className="flex justify-between gap-2">
                  <span className="truncate">{r.mo_ta}</span>
                  <span className="tabular-nums shrink-0">
                    {fmt(Number(r.thanh_tien_thuc_te ?? r.tien_cong_ty ?? 0))} ₫
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Hoàn tất phí hủy cho booking đã "Để sau" */}
      <DoiKsPhiHuyModal
        pending={resolvePending}
        submitting={doiKsMut.isPending}
        variant="resolve"
        onConfirm={handleResolveConfirm}
        onCancel={() => setResolvePending(null)}
      />
    </div>
  );
}
