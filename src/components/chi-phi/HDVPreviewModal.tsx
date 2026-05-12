import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { HDVSectionData } from "@/hooks/use-chi-phi-hdv";
import { exportHDVStatsExcel } from "@/lib/export-hdv-stats-excel";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const DNTT_STATUS_LABEL: Record<string, string> = {
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  tu_choi: "Từ chối",
  da_huy: "Đã hủy",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Chưa TT",
  partial: "TT 1 phần",
  paid: "Đã TT",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  doan: any;
  data: HDVSectionData | null;
  hdvPhaiThuVND: number;
}

export default function HDVPreviewModal({ open, onClose, doan, data, hdvPhaiThuVND }: Props) {
  if (!data) return null;

  const soKhach =
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) +
    (doan?.so_khach_tl ?? 0) || doan?.so_khach || 0;

  const handleExport = () => {
    exportHDVStatsExcel({ doan, data, hdvPhaiThuVND });
  };

  // Loại rows hdv_ho_tro khỏi list "HDV ứng tiền" — đã có section "Hướng dẫn viên" riêng,
  // tránh hiển thị trùng cùng 1 chi phí (vd Sim tặng khách).
  const chiPhiUngRows = data.chiPhiItems.filter((r) => r.danh_muc !== "hdv_ho_tro");
  const totalChiPhi = chiPhiUngRows.reduce((s, r) => s + r.tien_hdv, 0);
  const totalHoTro = data.hoTroItems.reduce((s, r) => s + r.tien_hdv + r.tien_cong_ty, 0);
  const netConPhaiTra = data.soConPhaiTra - hdvPhaiThuVND;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Thống kê chi phí HDV — {doan?.ten_doan ?? "—"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* HDV + tour info */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted/30 border">
            <Info label="HDV" value={data.hdv?.ten ?? "Chưa chỉ định"} />
            <Info
              label="Ngày tour"
              value={
                doan?.ngay_di && doan?.ngay_ve
                  ? `${fmtDate(doan.ngay_di)} - ${fmtDate(doan.ngay_ve)}`
                  : "—"
              }
            />
            <Info label="Số khách" value={soKhach} />
            <Info
              label="Tài khoản"
              value={
                [data.hdv?.so_tai_khoan, data.hdv?.ngan_hang].filter(Boolean).join(" — ") || "—"
              }
            />
          </div>

          {/* Tóm tắt */}
          <div className="grid grid-cols-4 gap-3">
            <SummaryCard label="Tổng HDV chi" value={data.tongHdvChi} />
            <SummaryCard label="Đã tạm ứng" value={data.tamUngDaTT} />
            <SummaryCard label="Phải thu HDV" value={hdvPhaiThuVND} color="text-orange-600" />
            <SummaryCard
              label={netConPhaiTra > 0 ? "Công ty còn phải trả" : netConPhaiTra < 0 ? "HDV phải trả lại" : "Đã đủ"}
              value={Math.abs(netConPhaiTra)}
              color={netConPhaiTra > 0 ? "text-orange-600" : netConPhaiTra < 0 ? "text-blue-600" : "text-emerald-600"}
            />
          </div>

          {/* Chi phí HDV ứng */}
          {chiPhiUngRows.length > 0 && (
            <Section title="Chi phí HDV ứng tiền">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    <Th className="text-left">Mô tả</Th>
                    <Th className="text-center">SL</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">Thành tiền</Th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {chiPhiUngRows.map((r) => (
                    <tr key={r.id}>
                      <Td className="text-left">{r.mo_ta || "—"}</Td>
                      <Td className="text-center">{r.so_luong}</Td>
                      <Td className="text-right">{fmt(r.don_gia)}</Td>
                      <Td className="text-right font-medium">{fmt(r.tien_hdv)} ₫</Td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-medium">
                    <Td colSpan={3} className="text-right">Cộng</Td>
                    <Td className="text-right text-primary">{fmt(totalChiPhi)} ₫</Td>
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          {/* Hỗ trợ HDV (Section UI) */}
          {data.hoTroItems.length > 0 && (
            <Section title="Chi phí 'Hướng dẫn viên' (section UI)">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    <Th className="text-left">Loại</Th>
                    <Th className="text-center">SL</Th>
                    <Th className="text-right">Đơn giá</Th>
                    <Th className="text-right">Thành tiền</Th>
                    <Th className="text-center">Ai trả</Th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.hoTroItems.map((r) => {
                    const ai = r.tien_hdv > 0 ? "HDV" : r.tien_cong_ty > 0 ? "Công ty" : "—";
                    const total = r.tien_hdv + r.tien_cong_ty;
                    return (
                      <tr key={r.id}>
                        <Td className="text-left">{r.mo_ta || "—"}</Td>
                        <Td className="text-center">{r.so_luong}</Td>
                        <Td className="text-right">{fmt(r.don_gia)}</Td>
                        <Td className="text-right font-medium">{fmt(total)} ₫</Td>
                        <Td className="text-center">
                          <span
                            className={
                              ai === "HDV"
                                ? "px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-600 border border-amber-200"
                                : ai === "Công ty"
                                ? "px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200"
                                : "text-muted-foreground"
                            }
                          >
                            {ai}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/30 font-medium">
                    <Td colSpan={3} className="text-right">Cộng</Td>
                    <Td className="text-right text-primary">{fmt(totalHoTro)} ₫</Td>
                    <Td />
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          {/* Tạm ứng */}
          {data.tamUngList.length > 0 && (
            <Section title="Tạm ứng">
              <DNTTTable rows={data.tamUngList} />
            </Section>
          )}

          {/* Quyết toán */}
          {data.quyetToanList.length > 0 && (
            <Section title="Quyết toán">
              <DNTTTable rows={data.quyetToanList} />
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button onClick={handleExport}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Tải Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-2 rounded-md border bg-card">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${color ?? ""}`}>{fmt(value)} ₫</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {title}
      </h3>
      <div className="border rounded-md overflow-hidden">{children}</div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-1.5 text-[11px] font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={`px-3 py-1.5 ${className}`} colSpan={colSpan}>{children}</td>;
}

function DNTTTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-muted/40 text-muted-foreground">
          <Th className="text-left">Ngày tạo</Th>
          <Th className="text-left">Mô tả</Th>
          <Th className="text-right">Số tiền</Th>
          <Th className="text-right">Đã TT</Th>
          <Th className="text-center">Duyệt</Th>
          <Th className="text-center">TT</Th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((d) => (
          <tr key={d.id}>
            <Td className="text-left">{fmtDate(d.created_at)}</Td>
            <Td className="text-left">{d.mo_ta || "—"}</Td>
            <Td className="text-right font-medium">{fmt(d.so_tien)} ₫</Td>
            <Td className="text-right">{fmt(d.paid_amount ?? 0)} ₫</Td>
            <Td className="text-center">{DNTT_STATUS_LABEL[d.trang_thai_duyet] ?? d.trang_thai_duyet}</Td>
            <Td className="text-center">{PAYMENT_STATUS_LABEL[d.payment_status ?? "unpaid"] ?? d.payment_status}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
