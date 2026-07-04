import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { ResolveMaps } from "@/lib/bao-gia-ai-resolve";
import type { GiaPhongRow } from "@/lib/khach-san-gia-phong";

// Gom master cần cho resolve AI báo giá → ResolveMaps. Query trực tiếp đúng
// field cần (không phụ thuộc shape hook danh mục khác).
export function useBaoGiaResolveMaps(enabled = true) {
  return useQuery({
    queryKey: ["bao_gia_ai_maps"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ResolveMaps> => {
      const [cdRes, nhRes, smRes, ksRes, gpRes, xeRes] = await Promise.all([
        externalSupabase.from("canh_diem").select("id, ten, gia_mac_dinh"),
        externalSupabase.from("nha_hang").select("id, ten, foc_khach, foc_mien"),
        externalSupabase.from("nha_hang_set_menu").select("id, ten_set, gia, nha_hang_id"),
        externalSupabase.from("khach_san").select("id, ten"),
        externalSupabase.from("khach_san_gia_phong").select("*"),
        externalSupabase.from("nha_xe_loai_xe").select("id, ten_xe, gia"),
      ]);
      const err = cdRes.error || nhRes.error || smRes.error || ksRes.error || gpRes.error || xeRes.error;
      if (err) throw err;

      const canhDiem: ResolveMaps["canhDiem"] = new Map();
      for (const c of cdRes.data ?? []) {
        canhDiem.set(c.id as number, { ten: (c.ten as string) ?? "", gia: (c.gia_mac_dinh as number) ?? null });
      }

      const nhaHang: ResolveMaps["nhaHang"] = new Map();
      const nhaHangTen = new Map<number, string>();
      for (const n of nhRes.data ?? []) {
        nhaHang.set(n.id as number, {
          ten: (n.ten as string) ?? "",
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
        khachSan.set(k.id as number, { ten: (k.ten as string) ?? "" });
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
