import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import { useBaoGiaByLead, useCreateBaoGia } from "@/hooks/use-bao-gia";
import { useUpdateLeadStatus, type Lead, type LeadTrangThai } from "@/hooks/use-leads";
import { baoGiaCode, STATUS_INFO, liveKetQua, emptyBaoGiaKetQua, fmtVnd } from "@/components/bao-gia/detail/helpers";

interface Props {
  lead: Lead;
}

// Phễu lead: chỉ ĐẨY tới (không tụt) khi tạo báo giá. mat_khach/chot_deal/cho_chot
// đã ngang/qua da_bao_gia → giữ nguyên.
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
  const createBaoGia = useCreateBaoGia();
  const updateStatus = useUpdateLeadStatus();

  const handleCreate = async () => {
    const diemDen = (lead.diem_den ?? [])[0]?.diem_den ?? "";
    const tieuDe = `BG · ${lead.ho_ten}${diemDen ? " · " + diemDen : ""}`;
    const soNgay = lead.so_ngay || soNgayFromDates(lead.ngay_di_du_kien, lead.ngay_ve_du_kien);
    try {
      const { id } = await createBaoGia.mutateAsync({
        tieu_de: tieuDe,
        ket_qua: emptyBaoGiaKetQua(soNgay, tieuDe),
        exchange_rate: 26000,
        profit_usd: 15,
        trang_thai: "draft",
        lead_id: lead.id,
        ngay_di: lead.ngay_di_du_kien,
        ngay_ve: lead.ngay_ve_du_kien,
      });
      // Tự đẩy phễu sang "đã báo giá" (chỉ khi đang ở giai đoạn trước đó)
      if (ADVANCE_FROM.includes(lead.trang_thai)) {
        updateStatus.mutate({ id: lead.id, trang_thai_moi: "da_bao_gia", created_by: user?.user_id });
      }
      navigate(`/bao-gia/${id}`);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tạo báo giá");
    }
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Báo giá của lead</h3>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={handleCreate} disabled={createBaoGia.isPending}>
          <Plus className="h-3.5 w-3.5" /> Tạo báo giá
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải...</p>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Chưa có báo giá. Bấm "Tạo báo giá" để lập cho khách này.</p>
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
    </div>
  );
}
