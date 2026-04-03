import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

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
}

export default function DoanInfoSection({ doan, bangDon, setBangDon, shopping, setShopping, truongDoan, setTruongDoan, chuyenBayDon, setChuyenBayDon, chuyenBayTien, setChuyenBayTien }: Props) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-b border-border">
        <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 bg-blue-50">🔗 Từ bảng doan · Chỉ đọc</Badge>
        <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">✏️ Tự điền</Badge>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Left: readonly */}
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
          <Row label="Ngày đón">
            <span>{formatDate(doan.ngay_di)}</span>
          </Row>
          <Row label="Ngày tiễn">
            <span>{formatDate(doan.ngay_ve)}</span>
          </Row>
        </div>
        {/* Right: editable */}
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
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Chuyến bay:</span>
            <div className="flex items-center gap-2 flex-1">
              <Input className="h-7 text-sm flex-1" value={chuyenBayDon} onChange={(e) => setChuyenBayDon(e.target.value)} placeholder="Đón..." />
              <span className="text-muted-foreground text-xs">→</span>
              <Input className="h-7 text-sm flex-1" value={chuyenBayTien} onChange={(e) => setChuyenBayTien(e.target.value)} placeholder="Tiễn..." />
            </div>
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
