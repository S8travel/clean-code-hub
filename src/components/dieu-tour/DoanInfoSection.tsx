import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, User, UserCheck, Bus, CalendarDays,
  ClipboardList, ShoppingBag, Users, Utensils, StickyNote,
} from "lucide-react";
import { t, useTranslate } from "@/lib/i18n";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${date.toLocaleDateString("vi-VN")} (${WEEKDAYS[date.getDay()]})`;
}

interface XeInfo {
  ten_xe?: string | null;
  so_cho?: number | null;
  nha_xe?: { ten?: string | null } | null;
}

interface HdvInfo {
  ten: string | null;
  so_dien_thoai?: string | null;
}

interface DoanInfo {
  ten_doan: string | null;
  huong_dan_vien?: HdvInfo | null;
  huong_dan_vien_2?: HdvInfo | null;
  xe?: XeInfo | null;
  xe_2?: XeInfo | null;
  ngay_di: string | null;
  ngay_ve: string | null;
}

function xeLabel(xe: XeInfo | null | undefined) {
  if (!xe) return "—";
  const nhaXe = xe.nha_xe?.ten ?? "";
  const socho = xe.so_cho ? `${xe.so_cho} ${t("chỗ")}` : "";
  const parts = [nhaXe, xe.ten_xe, socho].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function hdvLabel(hdv: HdvInfo | null | undefined): string {
  if (!hdv) return "";
  const ten = hdv.ten ?? "";
  const sdt = (hdv.so_dien_thoai ?? "").toString().trim();
  return sdt ? `${ten} — ${sdt}` : ten;
}

interface Props {
  doan: DoanInfo;
  bangDon: string;
  setBangDon: (v: string) => void;
  shopping: boolean | null;
  setShopping: (v: boolean | null) => void;
  truongDoan: string;
  setTruongDoan: (v: string) => void;
  chuyenBayDon: string;
  setChuyenBayDon: (v: string) => void;
  chuyenBayTien: string;
  setChuyenBayTien: (v: string) => void;
  soKhachLon: number;
  soKhachEm1: number;
  soKhachEm2: number;
  soKhachTl: number;
  totalFromDoan: number;
  chuThichKhach: string;
  setChuThichKhach: (v: string) => void;
  coTinhSuatTLNhaHang: boolean;
  setCoTinhSuatTLNhaHang: (v: boolean) => void;
}

export default function DoanInfoSection({
  doan, bangDon, setBangDon, shopping, setShopping,
  truongDoan, setTruongDoan, chuyenBayDon, setChuyenBayDon,
  chuyenBayTien, setChuyenBayTien,
  soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalFromDoan,
  chuThichKhach, setChuThichKhach,
  coTinhSuatTLNhaHang, setCoTinhSuatTLNhaHang,
}: Props) {
  useTranslate();
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">📋 {t("Thông tin đoàn")}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {/* Left: readonly + chuyến bay inline */}
        <div className="p-4 space-y-2 text-sm">
          <Row label={t("Code đoàn")} icon={ShieldCheck}>
            <span className="font-bold" style={{ color: "#185FA5" }}>{doan.ten_doan}</span>
          </Row>
          <Row label={t("HDV")} icon={User}>
            {(() => {
              const hdv1 = doan.huong_dan_vien;
              const hdv2 = doan.huong_dan_vien_2;
              if (!hdv1 && !hdv2) return <span>—</span>;
              const parts = [hdv1, hdv2].filter(Boolean).map(hdvLabel);
              return (
                <span className="break-words">
                  {parts.map((p, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-muted-foreground/60 mx-1.5">|</span>}
                      {p}
                    </span>
                  ))}
                </span>
              );
            })()}
          </Row>
          <Row label={t("Xe")} icon={Bus}>
            {(() => {
              const parts = [doan.xe, doan.xe_2].filter(Boolean).map(xeLabel);
              if (parts.length === 0) return <span>—</span>;
              return (
                <span className="break-words">
                  {parts.map((p, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-muted-foreground/60 mx-1.5">|</span>}
                      {p}
                    </span>
                  ))}
                </span>
              );
            })()}
          </Row>
          {/* Ngày đón + chuyến bay đón inline */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground w-24 shrink-0"><CalendarDays className="h-3.5 w-3.5 text-[#185FA5] shrink-0" />{t("Ngày đón")}:</span>
            <span className="shrink-0">{formatDate(doan.ngay_di)}</span>
            <Input
              className="h-7 text-sm flex-1 min-w-0"
              value={chuyenBayDon}
              onChange={(e) => setChuyenBayDon(e.target.value)}
              placeholder={t("Chuyến bay đón...")}
            />
          </div>
          {/* Ngày tiễn + chuyến bay tiễn inline */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground w-24 shrink-0"><CalendarDays className="h-3.5 w-3.5 text-[#185FA5] shrink-0" />{t("Ngày tiễn")}:</span>
            <span className="shrink-0">{formatDate(doan.ngay_ve)}</span>
            <Input
              className="h-7 text-sm flex-1 min-w-0"
              value={chuyenBayTien}
              onChange={(e) => setChuyenBayTien(e.target.value)}
              placeholder={t("Chuyến bay tiễn...")}
            />
          </div>
        </div>
        {/* Right: editable + compact guest count */}
        <div className="p-4 space-y-2 text-sm">
          <Row label={t("Bảng đón")} icon={ClipboardList} editable>
            <Input className="h-7 text-sm" value={bangDon} onChange={(e) => setBangDon(e.target.value)} placeholder={t("Nhập bảng đón...")} />
          </Row>
          <Row label="Shopping" icon={ShoppingBag} editable>
            <Select value={shopping === null ? "" : shopping ? "yes" : "no"} onValueChange={(v) => setShopping(v === "yes" ? true : v === "no" ? false : null)}>
              <SelectTrigger className="h-7 text-sm w-28">
                <span>{shopping === null ? t("Chọn") : shopping ? "YES" : "NO"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">YES</SelectItem>
                <SelectItem value="no">NO</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="T/L" icon={UserCheck} editable>
            <Input className="h-7 text-sm" value={truongDoan} onChange={(e) => setTruongDoan(e.target.value)} placeholder={t("Tên trưởng đoàn...")} />
          </Row>
          <Row label={t("T/L ăn NH")} icon={Utensils} editable>
            <div className="flex items-center gap-2">
              <Switch checked={coTinhSuatTLNhaHang} onCheckedChange={setCoTinhSuatTLNhaHang} />
              <span className="text-xs text-muted-foreground">
                {coTinhSuatTLNhaHang ? t("Tính suất ăn T/L") : t("Không tính")}
              </span>
            </div>
          </Row>
          {/* Compact guest count */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground w-24 shrink-0"><Users className="h-3.5 w-3.5 text-[#185FA5] shrink-0" />{t("Số khách")}:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <GuestChip label="NL" value={soKhachLon} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="TE 50%" value={soKhachEm1} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="TE free" value={soKhachEm2} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="T/L" value={soKhachTl} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label={t("Tổng")} value={totalFromDoan} highlight />
            </div>
          </div>
          {/* Chú thích khách */}
          <div className="flex items-start gap-2 pt-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground w-24 shrink-0 pt-1.5"><StickyNote className="h-3.5 w-3.5 text-[#185FA5] shrink-0" />{t("Chú thích")}:</span>
            <textarea
              value={chuThichKhach}
              onChange={(e) => setChuThichKhach(e.target.value)}
              placeholder={t("VD: Khách ăn chay, dị ứng, VIP...")}
              rows={2}
              className="flex-1 text-sm resize-none rounded-md border border-input bg-background px-2 py-1.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label, icon: Icon, children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  editable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground w-24 shrink-0">
        {Icon && <Icon className="h-3.5 w-3.5 text-[#185FA5] shrink-0" />}
        {label}:
      </span>
      {children}
    </div>
  );
}

function GuestChip({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={cn("text-xs font-bold tabular-nums", highlight ? "text-[#185FA5]" : "")}>
        {value}
      </span>
    </div>
  );
}
