import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-dntt";
import type { CongNoRow } from "@/hooks/use-cong-no";
import type { NHMealRow } from "@/hooks/use-chi-phi-nh";
import { fmt, STATUS_LABEL, parseNHMoTa } from "./nh-section-shared";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  meals: NHMealRow[];
  chiPhiRows: ChiPhiRow[];
  dnttList: DNTTRow[];
  congNoList: CongNoRow[];
}

// Các dòng NH đã bị gỡ khỏi điều tour nhưng vẫn còn chi phí / DNTT.
// Tách verbatim từ ChiPhiNHSection.
export default function NHOrphanRows({ meals, chiPhiRows, dnttList, congNoList }: Props) {
  useTranslate();
  const currentNgayIds = new Set(meals.map((m) => m.doan_ngay_id));
  const orphanedCps = chiPhiRows.filter((cp) => {
    if (cp.danh_muc !== "nha_hang") return false;
    if (cp.ref_doan_ngay_id == null) return false;
    if (currentNgayIds.has(cp.ref_doan_ngay_id)) return false;
    if (cp.mo_ta?.startsWith("[trua] ") || cp.mo_ta?.startsWith("[toi] ")) return false;
    const cpDntts = dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id);
    if (cpDntts.length === 0) return false;
    // Ẩn nếu tất cả DNTT đã bị hủy sau khi paid (đang auto-xóa)
    return !cpDntts.every(
      (d) => d.trang_thai_duyet === "da_huy" && (d.paid_amount || 0) > 0,
    );
  });
  if (orphanedCps.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={11} className="px-3 py-1 text-[11px] text-muted-foreground bg-muted/40 border-t border-border">
          {t("Không còn trong lịch trình điều tour")}
        </td>
      </tr>
      {orphanedCps.map((cp) => {
        const { name: cpNhName, bua: cpBua, buaIcon: cpBuaIcon } = parseNHMoTa(cp.mo_ta);
        const cpTotal = cp.so_luong * cp.don_gia;
        const cpDntts = dnttList.filter(
          (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id,
        );
        const cpActiveDntts = cpDntts.filter(
          (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
        );
        const cpDnttIds = cpDntts.map((d) => d.id);
        const cpCongNo = congNoList
          .filter((c) => c.dntt_goc_id != null && cpDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
          .reduce((s, c) => s + c.so_tien_con_lai, 0);
        const cpHoanTien = congNoList
          .filter((c) => c.dntt_goc_id != null && cpDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
          .reduce((s, c) => s + c.so_tien_goc, 0);
        const cpPending = cpActiveDntts.find((d) => d.payment_status !== "paid");
        const cpPendingInfo = cpPending ? STATUS_LABEL[cpPending.trang_thai_duyet] : null;
        const cpDaTT = cpActiveDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
        const cpIsDaTT = cpTotal > 0 && cpDaTT >= cpTotal;
        return (
          <tr key={`orphan-${cp.id}`} className="border-t border-border bg-muted/10 opacity-80">
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5 text-center text-muted-foreground text-[11px]">
              N{cp.ngay_so}
            </td>
            <td className="px-2 py-1.5 font-medium text-muted-foreground max-w-0">
              <div className="truncate">{cpNhName}</div>
            </td>
            <td className="px-2 py-1.5 text-center text-muted-foreground">
              {cpBuaIcon} {cpBua}
            </td>
            <td className="px-2 py-1.5 text-center text-muted-foreground">{cp.so_luong}</td>
            <td className="px-2 py-1.5 text-center text-muted-foreground">{fmt(cp.don_gia)}</td>
            <td className="px-2 py-1.5 text-right font-semibold text-muted-foreground">
              {fmt(cpTotal)}
            </td>
            {/* Trạng thái ĐNTT - orphaned */}
            <td className="px-2 py-1.5 align-top">
              {cpActiveDntts.length === 0 ? (
                <span className="text-[10px] text-muted-foreground">—</span>
              ) : (
                <div className="space-y-1">
                  {cpActiveDntts.map(d => {
                    const si = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                    return (
                      <span key={d.id} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${si.cls}`}>
                        {t(si.textKey)} · {fmt(d.so_tien)}
                      </span>
                    );
                  })}
                </div>
              )}
            </td>
            {/* Trạng thái TT - orphaned */}
            <td className="px-2 py-1.5 align-top">
              <div className="space-y-1">
                {cpActiveDntts.map(d => (
                  <div key={d.id}>
                    {d.payment_status === "paid" ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">{t("Đã TT")}</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">{t("Chờ UNC")}</span>
                    )}
                  </div>
                ))}
                {cpCongNo > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">CN: {fmt(cpCongNo)}</span>
                )}
                {cpHoanTien > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">HT: {fmt(cpHoanTien)}</span>
                )}
                {cpActiveDntts.length === 0 && cpCongNo === 0 && cpHoanTien === 0 && (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>
            </td>
            <td />
          </tr>
        );
      })}
    </>
  );
}
