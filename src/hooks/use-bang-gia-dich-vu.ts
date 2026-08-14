import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { externalSupabase } from "@/lib/supabase-external";

export interface BangGiaDichVu {
  id: number;
  ten: string;
  loai: "hotel" | "nha_hang" | "xe" | "dich_vu";
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

/** UPDATE ... .select().single() mà không đụng được dòng nào thì PostgREST ném
 *  PGRST116 ("JSON object requested, multiple (or no) rows returned") — câu đó
 *  dán thẳng lên toast thì OP không hiểu gì. Hai nguyên nhân thật: RLS chặn ghi
 *  (tài khoản chỉ xem), hoặc dòng đã bị người khác bỏ khỏi bảng giá. */
function loiKhongDungDuocDong(e: { code?: string; message?: string }): Error {
  if (e?.code === "PGRST116") {
    return new Error("Không lưu được — dòng này có thể đã bị người khác bỏ khỏi bảng giá, hoặc tài khoản của bạn không có quyền sửa. Tải lại trang để xem bản mới nhất.");
  }
  return new Error(e?.message || "Không lưu được");
}

/** Sửa 1 dòng bảng giá (sửa tay inline). KHÔNG invalidate: query sắp theo
 *  loại+tên, refetch giữa lúc OP đang gõ sẽ làm dòng NHẢY CHỖ dưới con trỏ.
 *  Vá thẳng vào cache đúng dòng đó — thứ tự chỉ sắp lại ở lần tải trang sau. */
export function useUpdateBangGiaRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Omit<BangGiaDichVu, "id" | "created_at">> }) => {
      const { data, error } = await externalSupabase
        .from("bang_gia_dich_vu")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      // .select().single() sau UPDATE: RLS chặn thì trả 0 dòng → lỗi, KHÔNG im
      // lặng báo "đã lưu" trong khi DB không đổi gì.
      if (error) throw loiKhongDungDuocDong(error);
      return data as BangGiaDichVu;
    },
    onSuccess: (row) => {
      qc.setQueryData<BangGiaDichVu[]>(["bang_gia_dich_vu"], (cur) =>
        (cur ?? []).map((r) => (r.id === row.id ? row : r)));
    },
  });
}

/** Thêm 1 dòng bảng giá. Dòng mới chèn lên ĐẦU danh sách (không sắp lại) để OP
 *  thấy ngay chỗ vừa thêm mà điền, thay vì phải đi tìm nó giữa mấy trăm dòng. */
export function useAddBangGiaRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Pick<BangGiaDichVu, "ten" | "loai" | "gia" | "foc">) => {
      const { data, error } = await externalSupabase
        .from("bang_gia_dich_vu")
        .insert({ ...row, active: true })
        .select()
        .single();
      if (error) throw error;
      return data as BangGiaDichVu;
    },
    onSuccess: (row) => {
      qc.setQueryData<BangGiaDichVu[]>(["bang_gia_dich_vu"], (cur) => [row, ...(cur ?? [])]);
    },
  });
}

/** Bỏ 1 dòng khỏi bảng giá. XOÁ MỀM (active=false) — cùng cách import đang dùng,
 *  giữ lại dòng cũ để còn lần ra nếu bấm nhầm. */
export function useDeleteBangGiaRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await externalSupabase
        .from("bang_gia_dich_vu")
        .update({ active: false })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw loiKhongDungDuocDong(error);
      return (data as { id: number }).id;
    },
    onSuccess: (id) => {
      qc.setQueryData<BangGiaDichVu[]>(["bang_gia_dich_vu"], (cur) =>
        (cur ?? []).filter((r) => r.id !== id));
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
  // Xe phải check TRƯỚC nha_hang vì "nh" includes match rộng có thể nhầm.
  if (n === "xe" || n === "transport" || n.includes("vận chuyển") || n.includes("van chuyen") || n.includes("vehicle")) return "xe";
  if (n === "nh" || n.includes("nh") || n.includes("nha") || n.includes("nhà")) return "nha_hang";
  return "dich_vu";
}

/** Trần giá hợp lệ cho 1 dòng bảng giá (10 tỷ VND/dòng — đủ cho mọi gói).
 *  Giá vượt threshold = parse error (vd cell chứa nhiều giá trị nối nhau,
 *  hoặc Excel scientific notation lỗi). Return null → bị filter ra. */
const MAX_GIA_VND = 10_000_000_000;

function parseGiaCell(raw: unknown): number | null {
  if (raw == null) return null;
  // Number type từ Excel — round (tránh float nhiễu) + giữ giá gốc.
  if (typeof raw === "number" && isFinite(raw)) {
    const v = Math.round(raw);
    return v > 0 && v <= MAX_GIA_VND ? v : null;
  }
  // String: chỉ giữ digit. Vietnamese format "14.472.000" → "14472000".
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  // Số quá dài (> 11 ký tự = > 10 tỷ) → cell có lẽ chứa nhiều giá trị
  // concat (vd "14472000" + "000002" do user merge cell). Reject.
  if (digits.length > 11) return null;
  const v = parseInt(digits, 10);
  return v > 0 && v <= MAX_GIA_VND ? v : null;
}

export interface ParsedBangGia {
  rows: Omit<BangGiaDichVu, "id" | "created_at">[];
  skippedBadPrice: number;  // dòng có tên nhưng giá > 10 tỷ / không hợp lệ
}

export function parseExcelFile(buffer: ArrayBuffer): ParsedBangGia {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const rows: Omit<BangGiaDichVu, "id" | "created_at">[] = [];
  let skippedBadPrice = 0;
  for (const row of rawRows.slice(1)) {
    const loaiRaw = String(row[0] ?? "").trim();
    const ten     = String(row[1] ?? "").trim();
    const foc     = parseFloat(String(row[2] ?? "0").replace(/[^0-9.]/g, "")) || 0;
    const gia     = parseGiaCell(row[3]);
    if (!ten) continue;
    if (gia == null) { skippedBadPrice++; continue; }
    rows.push({ ten, loai: detectLoai(loaiRaw), gia, foc, active: true });
  }
  return { rows, skippedBadPrice };
}

// ── Parser: Tab-separated pricing file ─────────────────────────────────────
// Format: Tên [TAB] FOC [TAB] Giá
// Hai section: phần đầu (nhà hàng/dịch vụ) → phần khách sạn sau header "Chọn khách sạn"
// Lưu ý: loai chỉ dùng để hiển thị UI, KHÔNG ảnh hưởng đến tính giá báo giá.
export function parsePricingFile(text: string): ParsedBangGia {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: Omit<BangGiaDichVu, "id" | "created_at">[] = [];
  let skippedBadPrice = 0;

  let isHotelSection = false;

  for (const line of lines) {
    const cols = line.split("\t").map((c) => c.trim());
    const ten = cols[0];

    if (!ten) continue;

    // Detect section header "Chọn khách sạn ..." → bật hotel section
    if (ten.toLowerCase().includes("ch") && ten.toLowerCase().includes("kh") && ten.toLowerCase().includes("s")) {
      if (cols.length >= 2 && (cols[1]?.includes("8") || cols[1]?.toLowerCase().includes("foc"))) {
        isHotelSection = true;
        continue;
      }
    }

    // Skip header rows (first row: "Dịch vụ / FOC / Giá")
    if (ten.toLowerCase().startsWith("d") && cols[1]?.toLowerCase().includes("foc")) continue;

    const focStr = (cols[1] ?? "").replace(/[^0-9.]/g, "");
    const foc = parseFloat(focStr) || 0;

    const gia = parseGiaCell(cols[2]);
    if (gia == null) { skippedBadPrice++; continue; }

    const loai: BangGiaDichVu["loai"] = isHotelSection ? "hotel" : "nha_hang";
    rows.push({ ten, loai, gia, foc, active: true });
  }

  return { rows, skippedBadPrice };
}
