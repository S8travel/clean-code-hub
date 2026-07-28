import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Coins } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { AccessDenied } from "@/components/PermissionGate";
import { usePermission } from "@/hooks/use-permissions";
import { useDoanScope } from "@/hooks/use-doan-scope";
import { useDoanList } from "@/hooks/use-doan";
import { useChiPhiAgent, groupChiPhiAgent } from "@/hooks/use-chi-phi-agent";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface DoanOptionRow {
  id: number;
  ten_doan?: string | null;
  ngay_di?: string | null;
  agents?: { ten?: string | null } | null;
}

/**
 * Chi phí đoàn dưới góc nhìn AGENT — số đã cộng hệ số ở tầng DB.
 *
 * Trang này KHÔNG đọc `doan_chi_phi`: với tài khoản `che_gia_von` RLS đã chặn
 * bảng đó, và số hiển thị lấy từ RPC `get_chi_phi_agent_view`. Cố ý không hiện
 * hệ số, trạng thái thanh toán, ĐNTT hay nhà cung cấp.
 */
export default function ChiPhiAgentPage() {
  useTranslate();
  const canView = usePermission("chi_phi_agent", "view");
  const scope = useDoanScope();
  const { data: doanRows = [], isLoading: loadingDoan } = useDoanList(
    scope.phanLoaiTour,
    scope.vanPhongIds,
  );
  const [doanId, setDoanId] = useState<string>("");

  const options = useMemo(() => {
    const rows = doanRows as unknown as DoanOptionRow[];
    return rows
      .slice()
      .sort((a, b) => (b.ngay_di ?? "").localeCompare(a.ngay_di ?? ""))
      .map((d) => ({
        value: String(d.id),
        label: [
          d.ten_doan ?? `#${d.id}`,
          d.ngay_di ? format(new Date(d.ngay_di), "dd/MM/yyyy") : null,
          d.agents?.ten ?? null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
  }, [doanRows]);

  const selectedId = doanId ? Number(doanId) : null;
  const { data: rows = [], isLoading, isError } = useChiPhiAgent(selectedId);
  const { nhom, tongCong } = useMemo(() => groupChiPhiAgent(rows), [rows]);

  if (!canView) return <AccessDenied />;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-6 py-4 border-b bg-background">
        <Coins className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{t("Chi phí (bản agent)")}</h1>
      </div>

      <div className="shrink-0 px-6 py-3 border-b bg-muted/20 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("Đoàn")}</span>
        <SearchableSelect
          options={options}
          value={doanId}
          onChange={setDoanId}
          placeholder={loadingDoan ? t("Đang tải...") : t("Chọn đoàn")}
          searchPlaceholder={t("Gõ tên đoàn...")}
          emptyText={t("Không tìm thấy đoàn")}
          className="w-[340px]"
        />
        {selectedId != null && !isLoading && rows.length > 0 && (
          <span className="ml-auto text-sm font-semibold">
            {t("Tổng")}: {fmt(tongCong)} VND
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {selectedId == null ? (
          <p className="text-sm text-muted-foreground">{t("Chọn một đoàn để xem chi phí.")}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>
        ) : isError ? (
          <p className="text-sm text-red-600">{t("Không tải được chi phí.")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Đoàn này chưa có chi phí, hoặc agent của đoàn chưa được cấu hình.")}
          </p>
        ) : (
          <div className="space-y-4">
            {nhom.map((g) => (
              <div key={g.danh_muc} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-[#E6F1FB] px-3 py-1.5">
                  <span className="text-xs font-semibold">{t(g.label)}</span>
                  <span className="text-xs font-semibold">{fmt(g.tong)} VND</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground">
                      <th className="py-1.5 px-2 text-left w-14">{t("Ngày")}</th>
                      <th className="py-1.5 px-2 text-left">{t("Nội dung")}</th>
                      <th className="py-1.5 px-2 text-right w-20">{t("SL")}</th>
                      <th className="py-1.5 px-2 text-right w-32">{t("Đơn giá")}</th>
                      <th className="py-1.5 px-2 text-right w-36">{t("Thành tiền")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={`${g.danh_muc}-${i}`} className="border-b last:border-0">
                        <td className="py-1.5 px-2">{r.ngay_so ?? "—"}</td>
                        <td className="py-1.5 px-2">{r.mo_ta || "—"}</td>
                        <td className="py-1.5 px-2 text-right">{r.so_luong ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right">
                          {r.don_gia != null ? fmt(Number(r.don_gia)) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium">
                          {fmt(Number(r.thanh_tien) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold">{t("Tổng cộng")}</span>
              <span className="text-lg font-bold">{fmt(tongCong)} VND</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
