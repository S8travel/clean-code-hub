import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { BaoGomBuaAn, GiaPhongWriteback, ResolveMaps } from "@/lib/bao-gia-ai-resolve";
import type { GiaPhongRow } from "@/lib/khach-san-gia-phong";

const MAPS_QK = "bao_gia_ai_maps";

/** canh_diem.bao_gom_bua_an là text tự do ở tầng DB (CHECK constraint) → ép về
 *  union hợp lệ, giá trị lạ coi như không có combo. */
function toBaoGom(v: unknown): BaoGomBuaAn | null {
  return v === "trua" || v === "toi" || v === "ca_hai" ? v : null;
}

// Gom master cần cho resolve AI báo giá → ResolveMaps. Query trực tiếp đúng
// field cần (không phụ thuộc shape hook danh mục khác).
export function useBaoGiaResolveMaps(enabled = true) {
  return useQuery({
    queryKey: [MAPS_QK],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ResolveMaps> => {
      const [cdRes, nhRes, smRes, ksRes, gpRes, xeRes] = await Promise.all([
        externalSupabase.from("canh_diem").select("id, ten, gia_mac_dinh, bao_gom_bua_an, bao_gom_ghi_chu"),
        externalSupabase.from("nha_hang").select("id, ten, ten_zh, foc_khach, foc_mien"),
        externalSupabase.from("nha_hang_set_menu").select("id, ten_set, gia, nha_hang_id"),
        externalSupabase.from("khach_san").select("id, ten, ten_zh"),
        externalSupabase.from("khach_san_gia_phong").select("*"),
        externalSupabase.from("nha_xe_loai_xe").select("id, ten_xe, gia"),
      ]);
      const err = cdRes.error || nhRes.error || smRes.error || ksRes.error || gpRes.error || xeRes.error;
      if (err) throw err;

      const canhDiem: ResolveMaps["canhDiem"] = new Map();
      for (const c of cdRes.data ?? []) {
        canhDiem.set(c.id as number, {
          ten: (c.ten as string) ?? "",
          gia: (c.gia_mac_dinh as number) ?? null,
          bao_gom_bua_an: toBaoGom(c.bao_gom_bua_an),
          bao_gom_ghi_chu: (c.bao_gom_ghi_chu as string) ?? null,
        });
      }

      const nhaHang: ResolveMaps["nhaHang"] = new Map();
      const nhaHangTen = new Map<number, string>();
      for (const n of nhRes.data ?? []) {
        nhaHang.set(n.id as number, {
          ten: (n.ten as string) ?? "",
          ten_zh: (n.ten_zh as string) || null,
          foc_khach: (n.foc_khach as number) ?? null,
          foc_mien: (n.foc_mien as number) ?? null,
        });
        nhaHangTen.set(n.id as number, (n.ten as string) ?? "");
      }

      const setMenu: ResolveMaps["setMenu"] = new Map();
      for (const s of smRes.data ?? []) {
        setMenu.set(s.id as number, {
          ten: (s.ten_set as string) ?? "",
          gia: (s.gia as number) ?? null,
          nhaHangTen: nhaHangTen.get(s.nha_hang_id as number) ?? "",
          nhaHangId: (s.nha_hang_id as number) ?? 0,
        });
      }

      const khachSan: ResolveMaps["khachSan"] = new Map();
      for (const k of ksRes.data ?? []) {
        khachSan.set(k.id as number, {
          ten: (k.ten as string) ?? "",
          ten_zh: (k.ten_zh as string) || null,
        });
      }

      const khachSanGia: ResolveMaps["khachSanGia"] = new Map();
      for (const g of (gpRes.data ?? []) as GiaPhongRow[]) {
        const arr = khachSanGia.get(g.khach_san_id);
        if (arr) arr.push(g);
        else khachSanGia.set(g.khach_san_id, [g]);
      }

      const xe: ResolveMaps["xe"] = new Map();
      for (const x of xeRes.data ?? []) {
        xe.set(x.id as number, { ten: (x.ten_xe as string) ?? "", gia: (x.gia as number) ?? null });
      }

      return { canhDiem, setMenu, nhaHang, khachSan, khachSanGia, xe };
    },
  });
}

/** Đánh dấu 1 cảnh điểm là combo đã bao gồm bữa ăn — ghi thẳng vào DANH MỤC từ
 *  màn review báo giá, để lần sau mọi báo giá tự trừ, khỏi phát hiện lại bằng mắt.
 *  RLS chặn UPDATE thì PostgREST trả 0 dòng mà KHÔNG báo lỗi → phải check length,
 *  nếu không sẽ hiện toast "đã lưu" giả. */
/** Ghi NGƯỢC giá phòng OP nhập tay ở review AI vào master khach_san_gia_phong —
 *  CHỈ cho KS chưa có dòng giá nào (giaPhongWritebacks đã lọc), ghi_chu đánh dấu
 *  nguồn "báo giá" để phân biệt với giá hợp đồng / median chi phí. Lần báo giá
 *  sau KS này tự có giá điền sẵn, master giàu dần theo mỗi lần báo giá. */
export function useWriteGiaPhongFromBaoGia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, baoGiaId }: { items: GiaPhongWriteback[]; baoGiaId: number }) => {
      if (items.length === 0) return 0;
      const { data, error } = await externalSupabase
        .from("khach_san_gia_phong")
        .insert(items.map((it) => ({
          khach_san_id: it.khach_san_id,
          ten_giai_doan: "Mặc định",
          loai_phong: "TWN/DBL",
          gia: it.gia,
          ghi_chu: `Từ báo giá #${baoGiaId} — OP nhập tay khi review AI (tham khảo)`,
        })))
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (n) => {
      if (!n) return;
      qc.invalidateQueries({ queryKey: [MAPS_QK] });
      qc.invalidateQueries({ queryKey: ["khach_san_gia_phong"] });
    },
  });
}

export function useMarkCanhDiemCombo() {
  const qc = useQueryClient();
  return useMutation({
    // xoaGhiChu: đổi bữa (hoặc bỏ cờ) thì mô tả bữa CŨ thành sai — xoá luôn, kẻo
    // danh mục đọng cặp mâu thuẫn kiểu 'toi' + "buffet trưa trên đỉnh".
    mutationFn: async ({ id, bua, xoaGhiChu }: { id: number; bua: BaoGomBuaAn | null; xoaGhiChu?: boolean }) => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .update(xoaGhiChu === false
          ? { bao_gom_bua_an: bua }
          : { bao_gom_bua_an: bua, bao_gom_ghi_chu: null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Không ghi được vào danh mục (thiếu quyền sửa danh mục cảnh điểm).");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MAPS_QK] });
      qc.invalidateQueries({ queryKey: ["canh_diem_list"] });
    },
  });
}
