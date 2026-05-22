import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
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

// ── Parser: Excel file ──────────────────────────────────────────────────────
// Format: 1 sheet, hàng 1 là header, cột: Loại | Tên | FOC | Giá
function detectLoai(raw: string): BangGiaDichVu["loai"] {
  const n = raw.toLowerCase().trim();
  if (n === "ks" || n.includes("hotel") || n.startsWith("kh")) return "hotel";
  if (n === "nh" || n.includes("nh") || n.includes("nha") || n.includes("nhà")) return "nha_hang";
  return "dich_vu";
}

export function parseExcelFile(buffer: ArrayBuffer): Omit<BangGiaDichVu, "id" | "created_at">[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  return rows
    .slice(1)
    .map((row): Omit<BangGiaDichVu, "id" | "created_at"> | null => {
      const loaiRaw = String(row[0] ?? "").trim();
      const ten     = String(row[1] ?? "").trim();
      const foc     = parseFloat(String(row[2] ?? "0").replace(/[^0-9.]/g, "")) || 0;
      const giaStr  = String(row[3] ?? "").replace(/[^0-9]/g, "");
      const gia     = giaStr ? parseInt(giaStr, 10) : null;
      if (!ten || !gia) return null;
      return { ten, loai: detectLoai(loaiRaw), gia, foc, active: true };
    })
    .filter((r): r is Omit<BangGiaDichVu, "id" | "created_at"> => r !== null);
}

// ── Parser: Tab-separated pricing file ─────────────────────────────────────
// Format: Tên [TAB] FOC [TAB] Giá
// Hai section: phần đầu (nhà hàng/dịch vụ) → phần khách sạn sau header "Chọn khách sạn"
// Lưu ý: loai chỉ dùng để hiển thị UI, KHÔNG ảnh hưởng đến tính giá báo giá.
export function parsePricingFile(text: string): Omit<BangGiaDichVu, "id" | "created_at">[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: Omit<BangGiaDichVu, "id" | "created_at">[] = [];

  let isHotelSection = false;

  for (const line of lines) {
    const cols = line.split("\t").map((c) => c.trim());
    const ten = cols[0];

    if (!ten) continue;

    // Detect section header "Chọn khách sạn ..." → bật hotel section
    // Dùng includes để không phụ thuộc vào encoding chính xác
    if (ten.toLowerCase().includes("ch") && ten.toLowerCase().includes("kh") && ten.toLowerCase().includes("s")) {
      // "Chọn khách sạn" header
      if (cols.length >= 2 && (cols[1]?.includes("8") || cols[1]?.toLowerCase().includes("foc"))) {
        isHotelSection = true;
        continue;
      }
    }

    // Skip header rows (first row: "Dịch vụ / FOC / Giá")
    if (ten.toLowerCase().startsWith("d") && cols[1]?.toLowerCase().includes("foc")) continue;

    // Parse FOC: col 1
    const focStr = (cols[1] ?? "").replace(/[^0-9.]/g, "");
    const foc = parseFloat(focStr) || 0;

    // Parse Giá: col 2 — remove everything except digits
    const giaStr = (cols[2] ?? "").replace(/[^0-9]/g, "");
    const gia = giaStr ? parseInt(giaStr, 10) : null;

    // Bỏ qua dòng không có giá
    if (!gia) continue;

    const loai: BangGiaDichVu["loai"] = isHotelSection ? "hotel" : "nha_hang";

    rows.push({ ten, loai, gia, foc, active: true });
  }

  return rows;
}
