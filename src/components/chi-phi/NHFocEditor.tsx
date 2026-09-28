import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import { calcSoKhachThucTe } from "@/lib/foc-calc";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { buildChiPhiChangeList } from "@/lib/chi-phi-diff";
import { CHI_PHI_MUTATION_KEY } from "@/lib/chi-phi-writes";
import { markChiPhiSavedLocally } from "@/lib/chi-phi-sync-bus";
import { errMsg } from "@/lib/error";
import type { FocCap } from "@/lib/nh-foc-dong-bo";
import { useAuditLogger } from "@/hooks/use-activity-log";
import { t, useTranslate } from "@/lib/i18n";

// Edit FOC snapshot per-row (mỗi meal). Master không thay đổi.
// Tách verbatim từ ChiPhiNHSection.
export function NHFocEditor({
  doanId, rowId, focKhach, focMien, disabled = false, onDangLuu, onLuuXong,
}: {
  doanId: number;
  rowId: number;
  focKhach: number | null;
  focMien: number | null;
  disabled?: boolean;
  /** Gọi NGAY trước khi ghi DB — bảng làm việc NH nhận số mới, kẻo lần lưu dòng
   *  kế tiếp ghi FOC cũ đè lên (lib/nh-foc-dong-bo.ts). */
  onDangLuu?: (foc: FocCap) => void;
  onLuuXong?: (foc: FocCap, ok: boolean) => void;
}) {
  useTranslate();
  const qc = useQueryClient();
  const auditLog = useAuditLogger();
  // Hiển thị "" cho cả null và 0 → giữ placeholder "—" thống nhất khi không có FOC.
  const display = (n: number | null) => (n != null && n > 0 ? String(n) : "");
  const [k, setK] = useState(display(focKhach));
  const [m, setM] = useState(display(focMien));

  useEffect(() => { setK(display(focKhach)); }, [focKhach]);
  useEffect(() => { setM(display(focMien)); }, [focMien]);

  const ghiFoc = useMutation({
    mutationKey: CHI_PHI_MUTATION_KEY, // bản in / xuất Excel chờ lượt ghi này (waitForChiPhiWrites)
    mutationFn: async ({ nextK, nextM }: { nextK: number; nextM: number }) => {
      // FOC đổi → số khách thực tế đổi → PHẢI tính lại tien_cong_ty/tien_hdv.
      // Trước đây chỉ lưu snapshot, để tien_* cũ (chưa trừ FOC) → "Thành tiền" +
      // ĐNTT (tính động trừ FOC) lệch với tien_cong_ty thô → badge "DNTT lệch" ảo.
      const { data: cp } = await externalSupabase
        .from("doan_chi_phi")
        .select("mo_ta, so_luong, don_gia, chiet_khau_phan_tram_snapshot, tien_cong_ty, tien_hdv, foc_khach_snapshot, foc_mien_snapshot, thanh_tien_thuc_te")
        .eq("id", rowId)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        foc_khach_snapshot: nextK,
        foc_mien_snapshot: nextM,
      };
      if (cp) {
        const soKhachThucTe = calcSoKhachThucTe(Number(cp.so_luong ?? 0), nextK, nextM);
        const thanhTien = applyChietKhau(
          soKhachThucTe * Number(cp.don_gia ?? 0),
          cp.chiet_khau_phan_tram_snapshot,
        );
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
      if (error) throw error;
      return { cp, payload };
    },
  });

  const save = async () => {
    if (disabled) return; // đoàn đã quyết toán → khóa (trừ admin)
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
    const foc: FocCap = { foc_khach_snapshot: nextK, foc_mien_snapshot: nextM };
    onDangLuu?.(foc);

    // mutateAsync gọi ĐỒNG BỘ ngay trong blur (không await nào trước nó) → lệnh ghi đã
    // "đang bay" trước khi handler nút In / Xuất Excel kịp hỏi waitForChiPhiWrites.
    let kq: Awaited<ReturnType<typeof ghiFoc.mutateAsync>>;
    try {
      kq = await ghiFoc.mutateAsync({ nextK, nextM });
    } catch (error) {
      // Trước đây nuốt lỗi im lặng: ô vẫn hiện số vừa gõ trong khi DB giữ số cũ.
      onLuuXong?.(foc, false);
      toast.error(errMsg(error));
      setK(display(focKhach));
      setM(display(focMien));
      return;
    }
    onLuuXong?.(foc, true);
    markChiPhiSavedLocally(doanId); // bỏ qua realtime "echo" của chính máy này
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
    qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", doanId] });
    // FOC đổi tien_hdv của dòng HDV trả → quyết toán HDV tải lại (như useUpsertChiPhi).
    qc.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });
    const { cp, payload } = kq;
    // Ô FOC không đi qua useUpsertChiPhi → tự ghi nhật ký, kẻo mất dấu ai đổi FOC.
    const changes = buildChiPhiChangeList(cp, payload);
    if (changes.length > 0) {
      auditLog({
        doan_id: doanId, action: "sua", table_name: "doan_chi_phi", record_id: rowId,
        mo_ta: `Cập nhật chi phí nhà hàng${cp?.mo_ta ? ": " + cp.mo_ta : ""} (${changes.join(", ")})`,
      });
    }
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
