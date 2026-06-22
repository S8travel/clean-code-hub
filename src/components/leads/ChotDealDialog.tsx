import { useState, useEffect, useMemo } from "react";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { PlusCircle, Link2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DoanDrawer } from "@/components/DoanDrawer";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList } from "@/hooks/use-doan";
import type { DoanInsert } from "@/hooks/use-doan";
import { useConvertLeadToDoan, useAttachLeadToDoan, type Lead } from "@/hooks/use-leads";

interface Props {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi tạo/ghép xong với id đoàn đích. */
  onDone: (doanId: number) => void;
}

type DoanPickRow = {
  id: number;
  ten_doan: string | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  trang_thai: string | null;
};

function fmtD(s: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return d && m ? `${d}/${m}` : s;
}

export function ChotDealDialog({ lead, open, onClose, onDone }: Props) {
  const { user } = useAuth();
  const convertLead = useConvertLeadToDoan();
  const attachLead = useAttachLeadToDoan();
  const { data: doanListRaw = [] } = useDoanList();

  const [mode, setMode] = useState<"choice" | "create" | "attach">("choice");
  const [attachId, setAttachId] = useState("");

  useEffect(() => {
    if (open) {
      setMode("choice");
      setAttachId("");
    }
  }, [open]);

  // Điền sẵn form tạo đoàn từ lead (vẫn sửa được trên DoanDrawer).
  const prefill = useMemo<Partial<DoanInsert>>(() => {
    if (!lead) return {};
    const firstDiemDen = (lead.diem_den ?? [])[0]?.diem_den ?? "";
    return {
      ten_doan: `Đoàn ${lead.ho_ten}${firstDiemDen ? " - " + firstDiemDen : ""}`,
      loai_tour: (lead.loai_tour ?? null) as DoanInsert["loai_tour"],
      so_khach_lon: lead.so_nguoi_lon ?? 0,
      so_khach_em1: lead.so_nguoi_em ?? 0,
      ngay_di: lead.ngay_di_du_kien ?? "",
      ngay_ve: lead.ngay_ve_du_kien ?? "",
      assigned_to: lead.assigned_to ?? null,
      van_phong_id: user?.van_phong_id ?? null,
      ghi_chu: `Tạo từ lead #${lead.id}.${lead.yeu_cau_dac_biet ? " " + lead.yeu_cau_dac_biet : ""}`,
    };
  }, [lead, user?.van_phong_id]);

  // Picker: chỉ đoàn đang chạy, kèm ngày để phân biệt.
  const doanOptions = useMemo(() => {
    const rows = (doanListRaw as DoanPickRow[]).filter((d) => d.trang_thai === "dang_chay");
    return rows.map((d) => {
      const range = d.ngay_di ? `${fmtD(d.ngay_di)}→${fmtD(d.ngay_ve)}` : "";
      return { value: String(d.id), label: `${d.ten_doan ?? `Đoàn #${d.id}`}${range ? ` · ${range}` : ""}` };
    });
  }, [doanListRaw]);

  const handleCreate = async (doanData: DoanInsert) => {
    if (!lead) return;
    try {
      const newDoan = await convertLead.mutateAsync({
        leadId: lead.id,
        doanData: { ...doanData, khach_hang_id: lead.khach_hang_id ?? null },
        currentUserId: user?.user_id ?? null,
      });
      toast.success(`🎉 Đã tạo đoàn #${newDoan.id}`);
      onDone(newDoan.id);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi khi tạo đoàn");
    }
  };

  const handleAttach = async () => {
    if (!lead || !attachId) return;
    try {
      const doanId = parseInt(attachId);
      await attachLead.mutateAsync({
        leadId: lead.id,
        doanId,
        khachHangId: lead.khach_hang_id ?? null,
        currentUserId: user?.user_id ?? null,
      });
      toast.success(`🔗 Đã ghép vào đoàn #${doanId}`);
      onDone(doanId);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi khi ghép đoàn");
    }
  };

  if (!lead) return null;

  return (
    <>
      {/* Bước 1: chọn cách chốt deal */}
      <Dialog open={open && mode === "choice"} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🏆 Chốt deal — {lead.ho_ten}</DialogTitle>
            <DialogDescription>Tạo đoàn mới từ lead, hoặc ghép khách vào một đoàn đang chạy.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              onClick={() => setMode("create")}
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <PlusCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Tạo đoàn mới</span>
                <span className="block text-xs text-muted-foreground">
                  Nhập thông tin đoàn (agent, địa điểm, ngày, số khách, lịch trình…). Điền sẵn từ lead.
                </span>
              </span>
            </button>
            <button
              onClick={() => setMode("attach")}
              disabled={doanOptions.length === 0}
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Link2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Ghép vào đoàn có sẵn</span>
                <span className="block text-xs text-muted-foreground">
                  {doanOptions.length === 0
                    ? "Chưa có đoàn đang chạy để ghép."
                    : "Gắn khách vào một đoàn đang chạy. Số khách/chi phí của đoàn tự điều chỉnh sau."}
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bước 2a: ghép vào đoàn có sẵn */}
      <Dialog open={open && mode === "attach"} onOpenChange={(o) => !o && setMode("choice")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ghép vào đoàn có sẵn</DialogTitle>
            <DialogDescription>Chọn đoàn đang chạy để gắn lead/khách này vào.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <SearchableSelect
              options={doanOptions}
              value={attachId}
              onChange={setAttachId}
              placeholder="Chọn đoàn..."
            />
            <p className="text-xs text-amber-600">
              Lưu ý: số khách & chi phí của đoàn KHÔNG tự cộng — vào đoàn chỉnh tay nếu cần.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode("choice")}>Quay lại</Button>
            <Button onClick={handleAttach} disabled={!attachId || attachLead.isPending}>
              {attachLead.isPending ? "Đang ghép..." : "Ghép đoàn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bước 2b: tạo đoàn mới — tái dùng DoanDrawer */}
      <DoanDrawer
        open={open && mode === "create"}
        doan={null}
        prefill={prefill}
        isSaving={convertLead.isPending}
        onClose={() => setMode("choice")}
        onSave={handleCreate}
      />
    </>
  );
}
