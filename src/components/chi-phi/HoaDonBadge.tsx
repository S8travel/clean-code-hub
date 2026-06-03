import { cn } from "@/lib/utils";
import { useUpdateDocStatus, type TrangThaiDoc } from "@/hooks/use-hoa-don-unc";
import { useUpdateChiPhiHoaDon } from "@/hooks/use-chi-phi";
import { t } from "@/lib/i18n";

// Badge trạng thái hóa đơn — bấm để xoay vòng 3 trạng thái: Chưa có → Đã có → Không cần.
// 2 nguồn lưu:
//  - Dòng công ty trả (có ĐNTT): de_nghi_thanh_toan.trang_thai_hoa_don (đồng bộ trang Hóa đơn UNC).
//  - Dòng HDV trả (không có ĐNTT): doan_chi_phi.trang_thai_hoa_don (kế toán bấm tay).
const NEXT: Record<TrangThaiDoc, TrangThaiDoc> = {
  chua_co: "da_co",
  da_co: "khong_can",
  khong_can: "chua_co",
};

const LABEL: Record<TrangThaiDoc, { textKey: string; cls: string }> = {
  chua_co: { textKey: "Chưa có HĐ", cls: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
  da_co: { textKey: "Đã có HĐ", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  khong_can: { textKey: "Không cần HĐ", cls: "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200" },
};

// Nút badge dùng chung — chỉ trình bày, không biết lưu ở đâu.
function BadgeButton({
  trangThai, pending, onCycle,
}: {
  trangThai: TrangThaiDoc;
  pending: boolean;
  onCycle: (next: TrangThaiDoc) => void;
}) {
  const info = LABEL[trangThai] ?? LABEL.chua_co;
  return (
    <button
      type="button"
      disabled={pending}
      title={t("Bấm để đổi trạng thái hóa đơn")}
      onClick={() => onCycle(NEXT[trangThai] ?? "da_co")}
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-colors whitespace-nowrap disabled:opacity-60",
        info.cls,
      )}
    >
      {t(info.textKey)}
    </button>
  );
}

// Badge cho ĐNTT (dòng công ty trả).
export function HoaDonBadge({ dnttId, trangThai }: { dnttId: number; trangThai: TrangThaiDoc }) {
  const mut = useUpdateDocStatus();
  return (
    <BadgeButton
      trangThai={trangThai}
      pending={mut.isPending}
      onCycle={(next) => mut.mutate({ id: dnttId, field: "trang_thai_hoa_don", value: next })}
    />
  );
}

// Badge cho dòng chi phí HDV trả (không có ĐNTT) — lưu trên doan_chi_phi.
export function HoaDonChiPhiBadge({ chiPhiId, trangThai }: { chiPhiId: number; trangThai: TrangThaiDoc }) {
  const mut = useUpdateChiPhiHoaDon();
  return (
    <BadgeButton
      trangThai={trangThai}
      pending={mut.isPending}
      onCycle={(next) => mut.mutate({ id: chiPhiId, value: next })}
    />
  );
}

interface CellProps {
  // ĐNTT đang hiệu lực của dòng (đã lọc bỏ da_huy/tu_choi ở section).
  dntts: { id: number; trang_thai_hoa_don: string }[];
}

// Ô "Hóa đơn" trong bảng chi phí — 1 badge / ĐNTT. Không có ĐNTT → "—".
export function HoaDonCell({ dntts }: CellProps) {
  if (dntts.length === 0) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 items-center">
      {dntts.map((d) => (
        <HoaDonBadge key={d.id} dnttId={d.id} trangThai={(d.trang_thai_hoa_don ?? "chua_co") as TrangThaiDoc} />
      ))}
    </div>
  );
}
