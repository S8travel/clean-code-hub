import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";

// ── KS FOC editor ────────────────────────────────────────────
// Edit FOC snapshot per-tour. Blur-save → update tất cả chi_phi rows của KS này
// trong đoàn hiện tại. Master không thay đổi.
export default function KSFocEditor({
  doanId, ksId, rowIds, focKhach, focMien,
}: {
  doanId: number;
  ksId: number;
  rowIds: number[];
  focKhach: number | null;
  focMien: number | null;
}) {
  const qc = useQueryClient();
  const [k, setK] = useState(focKhach != null ? String(focKhach) : "");
  const [m, setM] = useState(focMien != null ? String(focMien) : "");

  // Sync khi prop đổi (load lần đầu)
  useEffect(() => { setK(focKhach != null ? String(focKhach) : ""); }, [focKhach]);
  useEffect(() => { setM(focMien != null ? String(focMien) : ""); }, [focMien]);

  const save = async () => {
    // Parse: chuỗi rỗng → null; số hợp lệ (kể cả 0) → number
    const parseNum = (s: string): number | null => {
      const t = s.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const nextK = parseNum(k);
    const nextM = parseNum(m);
    if (nextK === focKhach && nextM === focMien) return;
    if (rowIds.length === 0) {
      toast.error("Chưa có chi phí nào để lưu FOC. Nhập giá phòng + blur trước.");
      return;
    }

    const { error } = await externalSupabase
      .from("doan_chi_phi")
      .update({ foc_khach_snapshot: nextK, foc_mien_snapshot: nextM })
      .in("id", rowIds);
    if (error) {
      toast.error("Lỗi lưu FOC: " + error.message);
      return;
    }
    toast.success("Đã lưu FOC cho khách sạn này");
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
  };
  void ksId; // ksId reserved cho future filter (multi-KS update qua join)

  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="FOC: cứ X phòng/đêm miễn Y phòng (per tour)">
      FOC
      <input
        value={k}
        onChange={(e) => setK(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        step="any"
        placeholder="—"
        className="w-9 h-6 px-1 text-xs text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
      <span>免</span>
      <input
        value={m}
        onChange={(e) => setM(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        step="any"
        placeholder="—"
        className="w-9 h-6 px-1 text-xs text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
    </span>
  );
}
