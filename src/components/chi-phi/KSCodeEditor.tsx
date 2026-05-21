import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";

// Code NCC editor — OP nhập tay, save vào doan_ngay.ks_ma_code cho tất cả ngày của KS này
// trong đoàn. Dùng cho cột CODE KS khi in ĐNTT + nội dung thanh toán ngân hàng.
export default function KSCodeEditor({
  doanId, ksId, currentCode,
}: {
  doanId: number;
  ksId: number;
  currentCode: string;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState(currentCode);

  useEffect(() => { setCode(currentCode); }, [currentCode]);

  const save = async () => {
    const next = code.trim();
    if (next === (currentCode || "")) return;
    const { error } = await externalSupabase
      .from("doan_ngay")
      .update({ ks_ma_code: next || null })
      .eq("doan_id", doanId)
      .eq("khach_san_id", ksId);
    if (error) {
      toast.error("Lỗi lưu code NCC: " + error.message);
      return;
    }
    toast.success("Đã lưu code NCC");
    qc.invalidateQueries({ queryKey: ["chi_phi_ks_data", doanId] });
    qc.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
    qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
  };

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Code NCC — dùng cho ĐNTT + nội dung thanh toán">
      Code
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onBlur={save}
        placeholder="—"
        className="w-24 h-6 px-1.5 text-xs border rounded bg-background"
      />
    </span>
  );
}
