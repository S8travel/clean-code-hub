import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${date.toLocaleDateString("vi-VN")} (${WEEKDAYS[date.getDay()]})`;
}

function xeLabel(xe: any) {
  if (!xe) return "—";
  const nhaXe = xe.nha_xe?.ten ?? "";
  const socho = xe.so_cho ? `${xe.so_cho} chỗ` : "";
  const parts = [nhaXe, xe.ten_xe, socho].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

interface Props {
  doan: any;
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
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-b border-border">
        <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 bg-blue-50">🔗 Từ bảng doan · Chỉ đọc</Badge>
        <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">✏️ Tự điền</Badge>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Left: readonly + chuyến bay inline */}
        <div className="p-4 space-y-2 text-sm">
          <Row label="Code đoàn">
            <span className="font-bold" style={{ color: "#185FA5" }}>{doan.ten_doan}</span>
          </Row>
          <Row label="HDV">
            <span>{doan.huong_dan_vien?.ten ?? "—"}</span>
          </Row>
          <Row label="Xe">
            <span>{xeLabel(doan.xe)}</span>
          </Row>
          {/* Ngày đón + chuyến bay đón inline */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Ngày đón:</span>
            <span className="shrink-0">{formatDate(doan.ngay_di)}</span>
            <Input
              className="h-7 text-sm flex-1 min-w-0"
              value={chuyenBayDon}
              onChange={(e) => setChuyenBayDon(e.target.value)}
              placeholder="Chuyến bay đón..."
            />
          </div>
          {/* Ngày tiễn + chuyến bay tiễn inline */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Ngày tiễn:</span>
            <span className="shrink-0">{formatDate(doan.ngay_ve)}</span>
            <Input
              className="h-7 text-sm flex-1 min-w-0"
              value={chuyenBayTien}
              onChange={(e) => setChuyenBayTien(e.target.value)}
              placeholder="Chuyến bay tiễn..."
            />
          </div>
        </div>
        {/* Right: editable + compact guest count */}
        <div className="p-4 space-y-2 text-sm">
          <Row label="Bảng đón" editable>
            <Input className="h-7 text-sm" value={bangDon} onChange={(e) => setBangDon(e.target.value)} placeholder="Nhập bảng đón..." />
          </Row>
          <Row label="Shopping" editable>
            <Select value={shopping === null ? "" : shopping ? "yes" : "no"} onValueChange={(v) => setShopping(v === "yes" ? true : v === "no" ? false : null)}>
              <SelectTrigger className="h-7 text-sm w-28">
                <SelectValue placeholder="Chọn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">YES</SelectItem>
                <SelectItem value="no">NO</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="T/L" editable>
            <Input className="h-7 text-sm" value={truongDoan} onChange={(e) => setTruongDoan(e.target.value)} placeholder="Tên trưởng đoàn..." />
          </Row>
          <Row label="T/L ăn NH" editable>
            <div className="flex items-center gap-2">
              <Switch checked={coTinhSuatTLNhaHang} onCheckedChange={setCoTinhSuatTLNhaHang} />
              <span className="text-xs text-muted-foreground">
                {coTinhSuatTLNhaHang ? "Tính suất ăn T/L" : "Không tính"}
              </span>
            </div>
          </Row>
          {/* Compact guest count */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Số khách:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <GuestChip label="NL" value={soKhachLon} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="TE 6-10" value={soKhachEm1} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="TE &lt;6" value={soKhachEm2} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="T/L" value={soKhachTl} />
              <span className="text-muted-foreground/40 text-xs">·</span>
              <GuestChip label="Tổng" value={totalFromDoan} highlight />
            </div>
          </div>
          {/* Chú thích khách */}
          <div className="flex items-start gap-2 pt-0.5">
            <span className="text-muted-foreground w-24 shrink-0 pt-1.5">Chú thích:</span>
            <textarea
              value={chuThichKhach}
              onChange={(e) => setChuThichKhach(e.target.value)}
              placeholder="VD: Khách ăn chay, dị ứng, VIP..."
              rows={2}
              className="flex-1 text-sm resize-none rounded-md border border-input bg-background px-2 py-1.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children, editable }: { label: string; children: React.ReactNode; editable?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
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
