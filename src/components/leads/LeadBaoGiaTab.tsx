import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus, FileText, ChevronRight, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import { useBaoGiaByLead, useBaoGiaList, useCloneBaoGia } from "@/hooks/use-bao-gia";
import { useUpdateLeadStatus, type Lead, type LeadTrangThai } from "@/hooks/use-leads";
import { baoGiaCode, STATUS_INFO, liveKetQua, fmtVnd } from "@/components/bao-gia/detail/helpers";
import { BaoGiaCreateModal, type BaoGiaCreatePrefill } from "@/components/bao-gia/BaoGiaCreateModal";

interface Props {
  lead: Lead;
}

// Phễu lead: chỉ ĐẨY tới (không tụt) khi tạo/dùng lại báo giá.
const ADVANCE_FROM: LeadTrangThai[] = ["moi", "da_lien_he", "dang_tu_van"];

function soNgayFromDates(di: string | null, ve: string | null): number {
  if (!di || !ve) return 1;
  const d1 = new Date(di + "T00:00:00");
  const d2 = new Date(ve + "T00:00:00");
  const n = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  return n > 0 ? n : 1;
}

export function LeadBaoGiaTab({ lead }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: list = [], isLoading } = useBaoGiaByLead(lead.id);
  const cloneBaoGia = useCloneBaoGia();
  const updateStatus = useUpdateLeadStatus();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Sau khi tạo/nhân bản báo giá cho lead → đẩy phễu + mở editor.
  const afterQuote = (newId: number) => {
    if (ADVANCE_FROM.includes(lead.trang_thai)) {
      updateStatus.mutate({ id: lead.id, trang_thai_moi: "da_bao_gia", created_by: user?.user_id });
    }
    navigate(`/bao-gia/${newId}`);
  };

  // Memo hóa: prop prefill phải ổn định reference, nếu không modal sẽ reset
  // field mỗi lần tab re-render trong lúc đang mở (useEffect phụ thuộc prefill).
  const createPrefill: BaoGiaCreatePrefill = useMemo(() => {
    const diemDen = (lead.diem_den ?? [])[0]?.diem_den ?? "";
    return {
      leadId: lead.id,
      tenChuongTrinh: `BG · ${lead.ho_ten}${diemDen ? " · " + diemDen : ""}`,
      soNgay: lead.so_ngay || soNgayFromDates(lead.ngay_di_du_kien, lead.ngay_ve_du_kien),
      ngayDi: lead.ngay_di_du_kien,
      ngayVe: lead.ngay_ve_du_kien,
    };
  }, [lead.id, lead.ho_ten, lead.diem_den, lead.so_ngay, lead.ngay_di_du_kien, lead.ngay_ve_du_kien]);

  const handlePick = async (bgId: number) => {
    try {
      const { id } = await cloneBaoGia.mutateAsync({ id: bgId, leadId: lead.id });
      setPickerOpen(false);
      toast.success("Đã nhân bản báo giá cho khách này");
      afterQuote(id);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi nhân bản báo giá");
    }
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Báo giá của lead</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { setPickerSearch(""); setPickerOpen(true); }}>
            <Copy className="h-3.5 w-3.5" /> Dùng lại báo giá
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Tạo báo giá
          </Button>
        </div>
      </div>

      <BaoGiaCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={afterQuote}
        prefill={createPrefill}
      />

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải...</p>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Chưa có báo giá. "Tạo báo giá" mới hoặc "Dùng lại báo giá" cũ cho khách này.</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {list.map((bg) => {
            const ket = liveKetQua(bg) ?? bg.ket_qua;
            const st = STATUS_INFO[bg.trang_thai] ?? STATUS_INFO.draft;
            const giaTb = ket?.gia_trung_binh_vnd ?? 0;
            return (
              <button
                key={bg.id}
                onClick={() => navigate(`/bao-gia/${bg.id}`)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40 transition-colors"
              >
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{baoGiaCode(bg)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{ket?.ten_chuong_trinh || bg.tieu_de || "(chưa đặt tên)"}</span>
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dotCls}`} /> {st.label}
                    </span>
                    {bg.created_at && <span>{format(new Date(bg.created_at), "dd/MM/yy")}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{giaTb > 0 ? fmtVnd(giaTb) + " ₫" : "—"}</span>
                  <span className="block text-[10px] text-muted-foreground">/ khách</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <BaoGiaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        search={pickerSearch}
        setSearch={setPickerSearch}
        onPick={handlePick}
        picking={cloneBaoGia.isPending}
      />
    </div>
  );
}

// Picker chọn 1 báo giá cũ (tất cả báo giá + tìm theo tên/mã) để nhân bản.
function BaoGiaPicker({
  open, onClose, search, setSearch, onPick, picking,
}: {
  open: boolean;
  onClose: () => void;
  search: string;
  setSearch: (s: string) => void;
  onPick: (id: number) => void;
  picking: boolean;
}) {
  const { data: all = [], isLoading } = useBaoGiaList();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((bg) => {
      const ten = bg.ket_qua?.ten_chuong_trinh ?? "";
      return (
        ten.toLowerCase().includes(q) ||
        (bg.tieu_de ?? "").toLowerCase().includes(q) ||
        baoGiaCode(bg).toLowerCase().includes(q)
      );
    });
  }, [all, search]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dùng lại báo giá cũ</DialogTitle>
          <DialogDescription>Chọn 1 báo giá để nhân bản cho khách này — bản sao gắn vào lead, sửa/gửi không ảnh hưởng báo giá gốc.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên chương trình / mã..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs pl-7"
            autoFocus
          />
        </div>
        <ScrollArea className="max-h-[50vh]">
          {isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Không tìm thấy báo giá.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((bg) => {
                const ket = liveKetQua(bg) ?? bg.ket_qua;
                const giaTb = ket?.gia_trung_binh_vnd ?? 0;
                return (
                  <button
                    key={bg.id}
                    onClick={() => onPick(bg.id)}
                    disabled={picking}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left text-xs hover:bg-muted/40 disabled:opacity-50"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">{baoGiaCode(bg)}</span>
                    <span className="flex-1 min-w-0 truncate font-medium">{ket?.ten_chuong_trinh || bg.tieu_de || "(chưa đặt tên)"}</span>
                    <span className="shrink-0 tabular-nums font-semibold">{giaTb > 0 ? fmtVnd(giaTb) + " ₫" : "—"}</span>
                    <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
