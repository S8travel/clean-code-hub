import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { t, useTranslate } from "@/lib/i18n";

// Edit FOC snapshot per-row (mỗi meal). Master không thay đổi.
// Tách verbatim từ ChiPhiNHSection.
export function NHFocEditor({
  doanId, rowId, focKhach, focMien,
}: {
  doanId: number;
  rowId: number;
  focKhach: number | null;
  focMien: number | null;
}) {
  useTranslate();
  const qc = useQueryClient();
  // Hiển thị "" cho cả null và 0 → giữ placeholder "—" thống nhất khi không có FOC.
  const display = (n: number | null) => (n != null && n > 0 ? String(n) : "");
  const [k, setK] = useState(display(focKhach));
  const [m, setM] = useState(display(focMien));

  useEffect(() => { setK(display(focKhach)); }, [focKhach]);
  useEffect(() => { setM(display(focMien)); }, [focMien]);

  const save = async () => {
    // User clear ô → lưu 0 (KHÔNG null) để resolveNHFoc trust snapshot, KHÔNG
    // fallback về master (master có thể còn FOC, gây -1 dù user đã clear).
    const parse = (s: string): number => {
      const tr = s.trim();
      if (tr === "") return 0;
      const n = Number(tr);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const nextK = parse(k);
    const nextM = parse(m);
    const curK = focKhach ?? 0;
    const curM = focMien ?? 0;
    if (nextK === curK && nextM === curM) return;
    const { error } = await externalSupabase
      .from("doan_chi_phi")
      .update({ foc_khach_snapshot: nextK, foc_mien_snapshot: nextM })
      .eq("id", rowId);
    if (error) return;
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
  };

  return (
    <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title={t("FOC: cứ X khách miễn Y suất (per tour)")}>
      <span>FOC</span>
      <input
        value={k}
        onChange={(e) => setK(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
      <span>免</span>
      <input
        value={m}
        onChange={(e) => setM(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
    </div>
  );
}
