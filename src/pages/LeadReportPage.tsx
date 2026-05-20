import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { BarChart3, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useLeadFunnel, useLeadByNguon, useLeadBySales, useLeadLyDoMat,
  type LeadReportFilter,
} from "@/hooks/use-lead-reports";
import { LEAD_TRANG_THAI_OPTS, LEAD_NGUON_OPTS } from "@/hooks/use-leads";
import { useVanPhongList } from "@/hooks/use-van-phong";
import { useTemplateStats } from "@/hooks/use-lead-template";
import { t, useTranslate } from "@/lib/i18n";

const TPL_CHANNEL_LABEL: Record<string, string> = {
  email: "Email", zalo: "Zalo", call_script: "Kịch bản gọi",
};

const FUNNEL_ORDER = ["moi", "da_lien_he", "dang_tu_van", "da_bao_gia", "cho_chot", "chot_deal"];
const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

export default function LeadReportPage() {
  useTranslate();
  const nav = useNavigate();
  const { data: vps = [] } = useVanPhongList();

  // Default: tháng hiện tại
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to,   setTo]   = useState(format(endOfMonth(today),   "yyyy-MM-dd"));
  const [loaiTour, setLoaiTour] = useState("");
  const [vpId,     setVpId]     = useState("");

  const filter: LeadReportFilter = useMemo(() => ({
    from, to,
    loai_tour:    loaiTour || null,
    van_phong_id: vpId ? Number(vpId) : null,
  }), [from, to, loaiTour, vpId]);

  const { data: funnel = [] } = useLeadFunnel(filter);
  const { data: byNguon = [] } = useLeadByNguon(filter);
  const { data: bySales = [] } = useLeadBySales(filter);
  const { data: lyDoMat = [] } = useLeadLyDoMat(filter);
  const { data: tplStats = [] } = useTemplateStats();

  // Funnel chart data — order theo flow
  const funnelData = useMemo(() => {
    const map = new Map(funnel.map((f) => [f.trang_thai, f.cnt]));
    return FUNNEL_ORDER.map((s) => ({
      trang_thai: s,
      label: LEAD_TRANG_THAI_OPTS.find((o) => o.value === s)?.label ?? s,
      cnt:   map.get(s) ?? 0,
    }));
  }, [funnel]);

  // Conversion: số lead chuyển sang bước tiếp theo
  const conversions = useMemo(() => {
    const arr: { from: string; to: string; rate: number }[] = [];
    for (let i = 0; i < funnelData.length - 1; i++) {
      const a = funnelData[i].cnt;
      const b = funnelData[i + 1].cnt;
      arr.push({ from: funnelData[i].label, to: funnelData[i + 1].label, rate: a > 0 ? (b / a) * 100 : 0 });
    }
    return arr;
  }, [funnelData]);

  const nguonLabel = (v: string) => LEAD_NGUON_OPTS.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => nav("/leads")} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{t("Báo cáo Lead")}</h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 px-6 py-3 border-b bg-muted/20 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t("Từ ngày")}</Label>
          <DatePicker value={from} onChange={setFrom} className="h-8 w-[140px] text-xs" />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t("Đến ngày")}</Label>
          <DatePicker value={to} onChange={setTo} className="h-8 w-[140px] text-xs" />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t("Loại tour")}</Label>
          <Select value={loaiTour || "_all"} onValueChange={(v) => setLoaiTour(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all" className="text-xs">{t("Tất cả")}</SelectItem>
              <SelectItem value="outbound" className="text-xs">{t("Outbound")}</SelectItem>
              <SelectItem value="noi_dia" className="text-xs">{t("Nội địa")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t("Văn phòng")}</Label>
          <Select value={vpId || "_all"} onValueChange={(v) => setVpId(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all" className="text-xs">{t("Tất cả VP")}</SelectItem>
              {vps.map((vp) => (
                <SelectItem key={vp.id} value={String(vp.id)} className="text-xs">{vp.ten}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* A. Funnel */}
        <Section title={t("📊 Funnel theo trạng thái")}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="cnt" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">{t("Conversion")}</p>
              {conversions.map((c, i) => (
                <div key={i} className="text-xs flex items-center gap-2 p-2 rounded bg-muted/50">
                  <span className="flex-1 truncate">{c.from} → {c.to}</span>
                  <span className={`font-bold tabular-nums ${c.rate >= 50 ? "text-green-600" : c.rate >= 25 ? "text-amber-600" : "text-red-500"}`}>
                    {c.rate.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* B. Theo nguồn */}
        <Section title={t("📥 Theo nguồn")}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB]">
                <tr>
                  <th className="py-1.5 px-2 text-left">{t("Nguồn")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Tổng lead")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Chốt deal")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Conversion %")}</th>
                </tr>
              </thead>
              <tbody>
                {byNguon.map((r) => {
                  const conv = r.total_lead > 0 ? (r.chot_deal / r.total_lead) * 100 : 0;
                  return (
                    <tr key={r.nguon} className="border-b border-border/40">
                      <td className="py-1.5 px-2 font-medium">{t(nguonLabel(r.nguon))}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.total_lead}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-green-600 font-medium">{r.chot_deal}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${conv >= 30 ? "text-green-600" : conv >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {conv.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {byNguon.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">{t("Không có dữ liệu")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* C. Theo sales */}
        <Section title={t("👥 Hiệu quả sales")}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB]">
                <tr>
                  <th className="py-1.5 px-2 text-left">{t("Sales")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Lead nhận")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Đang xử lý")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Chốt deal")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Mất")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Conversion %")}</th>
                </tr>
              </thead>
              <tbody>
                {bySales.map((r) => {
                  const conv = r.total_lead > 0 ? (r.chot_deal / r.total_lead) * 100 : 0;
                  return (
                    <tr key={r.user_id} className="border-b border-border/40">
                      <td className="py-1.5 px-2 font-medium">{r.ho_ten ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.total_lead}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-blue-600">{r.dang_xu_ly}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-green-600 font-medium">{r.chot_deal}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-red-500">{r.mat_khach}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${conv >= 30 ? "text-green-600" : conv >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {conv.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {bySales.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">{t("Không có dữ liệu")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* D. Top lý do mất khách */}
        <Section title={t("🥶 Top lý do mất khách")}>
          {lyDoMat.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">{t("Chưa có lead mất khách trong khoảng thời gian này")}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={lyDoMat} dataKey="cnt" nameKey="ly_do" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.cnt}`}>
                      {lyDoMat.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {lyDoMat.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/40">
                    <span className="w-3 h-3 rounded shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 truncate">{r.ly_do}</span>
                    <span className="font-bold tabular-nums">{r.cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* E. Hiệu quả template */}
        <Section title={t("📨 Template đã dùng")}>
          <p className="text-[11px] text-muted-foreground -mt-1">
            {t("Xếp theo số lần dùng. Cột \"Conversion %\" sẽ có số khi tích luỹ đủ dữ liệu chốt deal từ template (hiện để \"—\").")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB]">
                <tr>
                  <th className="py-1.5 px-2 text-left">{t("Template")}</th>
                  <th className="py-1.5 px-2 text-left">{t("Kênh")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Số lần dùng")}</th>
                  <th className="py-1.5 px-2 text-right">{t("Conversion %")}</th>
                </tr>
              </thead>
              <tbody>
                {tplStats.map((tpl) => (
                  <tr key={tpl.id} className="border-b border-border/40">
                    <td className="py-1.5 px-2 font-medium">
                      {tpl.ten}
                      {!tpl.active && <span className="ml-1 text-[10px] text-muted-foreground">{t("(tắt)")}</span>}
                    </td>
                    <td className="py-1.5 px-2">{t(TPL_CHANNEL_LABEL[tpl.channel] ?? tpl.channel)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-medium">{tpl.used_count}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {tpl.conversion_rate != null ? `${Number(tpl.conversion_rate).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {tplStats.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">{t("Chưa có template")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4 space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}
