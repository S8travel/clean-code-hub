import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface BangGiaDichVu {
  id: number;
  ten: string;
  loai: "hotel" | "nha_hang" | "dich_vu";
  gia: number | null;
  foc: number;
  active: boolean;
  created_at: string;
}

export function useBangGiaDichVu() {
  return useQuery({
    queryKey: ["bang_gia_dich_vu"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("bang_gia_dich_vu")
        .select("*")
        .eq("active", true)
        .order("loai")
        .order("ten");
      if (error) throw error;
      return data as BangGiaDichVu[];
    },
  });
}

export function useImportBangGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<BangGiaDichVu, "id" | "created_at">[]) => {
      // Deactivate all existing rows first (soft replace)
      await externalSupabase
        .from("bang_gia_dich_vu")
        .update({ active: false })
        .eq("active", true);

      // Bulk insert new rows in batches of 200
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await externalSupabase.from("bang_gia_dich_vu").insert(batch);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bang_gia_dich_vu"] });
    },
  });
}

// ── Parser: Tab-separated pricing file ─────────────────────────────────────
// Format: Tên [TAB] FOC [TAB] Giá
// Two sections separated by "Chọn khách sạn" header line
export function parsePricingFile(text: string): Omit<BangGiaDichVu, "id" | "created_at">[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: Omit<BangGiaDichVu, "id" | "created_at">[] = [];

  let currentLoai: "hotel" | "nha_hang" | "dich_vu" = "nha_hang";

  for (const line of lines) {
    const cols = line.split("\t").map((c) => c.trim());
    const ten = cols[0];

    if (!ten) continue;

    // Detect section headers — skip them
    const lower = ten.toLowerCase();
    if (
      lower.startsWith("dịch vụ") ||
      lower.startsWith("d") && lower.includes("ch v") ||
      lower.startsWith("chọn khách sạn") ||
      lower.startsWith("ch") && lower.includes("n kh")
    ) {
      if (lower.includes("khách sạn") || lower.includes("kh") && lower.includes("ch s")) {
        currentLoai = "hotel";
      }
      continue;
    }

    // Hotel section detection by content patterns
    if (
      ten.toUpperCase() === ten && ten.length > 5 &&
      (ten.includes("HOTEL") || ten.includes("RESORT") || ten.includes("HOSTEL") ||
       ten.includes("TÀU") || ten.includes("MƯỜNG THANH") || ten.includes("HYATT") ||
       ten.includes("MARRIOTT") || ten.includes("PULLMAN") || ten.includes("NOVOTEL") ||
       ten.includes("WYNDHAM") || ten.includes("SHERATON") || ten.includes("CRUISE"))
    ) {
      currentLoai = "hotel";
    }

    // Parse FOC (col 1)
    const focStr = cols[1] ?? "";
    const foc = parseFloat(focStr.replace(/[^0-9.]/g, "")) || 0;

    // Parse Giá (col 2): "1,270,000 đ" → 1270000
    const giaStr = (cols[2] ?? "").replace(/[^0-9]/g, "");
    const gia = giaStr ? parseInt(giaStr, 10) : null;

    // Skip rows without a price (unless hotel section — some are placeholders)
    if (gia === null && currentLoai !== "hotel") continue;
    if (gia === null) {
      // For hotels without price, still store but skip
      continue;
    }

    // Determine loai: after section header, or by heuristics
    let loai = currentLoai;
    // Services section (bottom of file) — typically after hotels, short names
    if (
      ten.startsWith("BẢO TÀNG") || ten.startsWith("VÉ") || ten.startsWith("THAM QUAN") ||
      ten.startsWith("CÁP TREO") || ten.startsWith("TÀU LEO") || ten.startsWith("COMBO") ||
      ten.startsWith("TIỀN SIM") || ten.startsWith("TIỀN TIP") || ten.startsWith("MASSAGE") ||
      ten.startsWith("TRÀ CHIỀU") || ten.startsWith("PHỞ") || ten.startsWith("BÁNH MỲ") ||
      ten.endsWith("USD")
    ) {
      loai = currentLoai === "hotel" ? "dich_vu" : currentLoai;
    }

    rows.push({ ten, loai, gia, foc, active: true });
  }

  return rows;
}
