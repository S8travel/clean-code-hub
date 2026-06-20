import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { calcSoKhachThucTe } from "@/lib/foc-calc";
import { t, useTranslate } from "@/lib/i18n";

// Edit FOC snapshot per-row cho 1 dịch vụ (cảnh điểm). Master canh_diem KHÔNG đổi.
// Mirror NHFocEditor nhưng KHÔNG có chiết khấu (DV không áp CK). Sửa FOC → tính
// lại tien_cong_ty/tien_hdv NGAY (số khách thực tế đổi) để Thành tiền + ĐNTT khớp.
export function DVFocEditor({
  doanId, rowId, focKhach, focMien, disabled = false,
}: {
  doanId: number;
  rowId: number;
  focKhach: number | null;
  focMien: number | null;
  disabled?: boolean;
}) {
  useTranslate();
  const qc = useQueryClient();
  // Hiển thị "" cho cả null và 0 → placeholder "—" thống nhất khi không có FOC.
  const display = (n: number | null) => (n != null && n > 0 ? String(n) : "");
  const [k, setK] = useState(display(focKhach));
  const [m, setM] = useState(display(focMien));

  useEffect(() => { setK(display(focKhach)); }, [focKhach]);
  useEffect(() => { setM(display(focMien)); }, [focMien]);

  const save = async () => {
    if (disabled) return; // đoàn đã quyết toán → khóa (trừ admin)
    // User clear ô → lưu 0 (KHÔNG null) để resolveDVFoc trust snapshot, KHÔNG
    // fallback master (master có thể còn FOC, gây -1 dù user đã clear).
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

    const { data: cp } = await externalSupabase
      .from("doan_chi_phi")
      .select("so_luong, don_gia, tien_hdv")
      .eq("id", rowId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      foc_khach_snapshot: nextK,
      foc_mien_snapshot: nextM,
    };
    if (cp) {
      const billed = calcSoKhachThucTe(Number(cp.so_luong ?? 0), nextK, nextM);
      const thanhTien = billed * Number(cp.don_gia ?? 0);
      const isHdv = Number(cp.tien_hdv ?? 0) > 0;
      payload.tien_cong_ty = isHdv ? 0 : thanhTien;
      payload.tien_hdv = isHdv ? thanhTien : 0;
      // Giá trị mới CHÍNH là thực tế → xóa override thực tế cũ (nếu có).
      payload.thanh_tien_thuc_te = null;
    }

    const { error } = await externalSupabase
      .from("doan_chi_phi")
      .update(payload)
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
        disabled={disabled}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <span>免</span>
      <input
        value={m}
        onChange={(e) => setM(e.target.value)}
        onBlur={save}
        disabled={disabled}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}
