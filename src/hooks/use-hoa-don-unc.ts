import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export type TrangThaiDoc = "chua_co" | "da_co" | "khong_can";

export interface HoaDonUNCRow {
  id: number;
  doan_id: number | null;
  ten_doan: string | null;
  loai: string;
  mo_ta: string | null;
  so_tien: number;
  la_coc: boolean;
  ref_id: number | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  ngay_can_thanh_toan: string | null;
  thanh_toan_luc: string | null;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  trang_thai_hoa_don: TrangThaiDoc;
  trang_thai_unc: TrangThaiDoc;
  hoa_don_url: string | null;
  unc_url: string | null;
  ref_loai: string | null;
  code_ncc: string | null;  // KS: ks_ma_code from doan_ngay; khác: null
  ghi_chu: string | null;
  hoa_don_so_tien: number | null; // số tiền hóa đơn nhập tay (thay upload)
  tao_boi: string | null;         // OP tạo DNTT — nhận cảnh báo lệch hóa đơn
}

export interface HoaDonUNCFilters {
  doanId?: number | null;
  loai?: string | null;
  trangThaiTT?: "chua_tt" | "da_tt" | "all";
  trangThaiHoaDon?: TrangThaiDoc | "all";
  trangThaiUNC?: TrangThaiDoc | "all";
}

export function useHoaDonUNCList(filters: HoaDonUNCFilters = {}) {
  return useQuery({
    queryKey: ["hoa-don-unc", filters],
    queryFn: async (): Promise<HoaDonUNCRow[]> => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select(
          "id, doan_id, loai, mo_ta, so_tien, la_coc, ref_id, nha_cung_cap_id, ten_nha_cung_cap, ngay_can_thanh_toan, thanh_toan_luc, payment_status, paid_amount, trang_thai_hoa_don, trang_thai_unc, hoa_don_url, unc_url, ref_loai, ghi_chu, hoa_don_so_tien, tao_boi, doan:doan_id(ten_doan)"
        )
        .eq("trang_thai_duyet", "da_duyet")
        .order("ngay_can_thanh_toan", { ascending: true, nullsFirst: false });

      if (filters.doanId) q = q.eq("doan_id", filters.doanId);
      if (filters.loai) q = q.eq("loai", filters.loai);
      if (filters.trangThaiTT === "da_tt") q = q.eq("payment_status", "paid");
      else if (filters.trangThaiTT === "chua_tt") q = q.neq("payment_status", "paid");
      if (filters.trangThaiHoaDon && filters.trangThaiHoaDon !== "all")
        q = q.eq("trang_thai_hoa_don", filters.trangThaiHoaDon);
      if (filters.trangThaiUNC && filters.trangThaiUNC !== "all")
        q = q.eq("trang_thai_unc", filters.trangThaiUNC);

      const { data, error } = await q;
      if (error) throw error;

      // Enrich KS rows với ks_ma_code từ doan_ngay (1 code chung cho cả KS trong đoàn)
      const ksRefs = (data || [])
        .filter((r: any) => r.loai === "khach_san" && r.doan_id && r.ref_id)
        .map((r: any) => ({ doan_id: r.doan_id as number, khach_san_id: r.ref_id as number }));
      const codeMap = new Map<string, string>(); // key = `${doan_id}|${khach_san_id}`
      if (ksRefs.length > 0) {
        const doanIds = [...new Set(ksRefs.map((x) => x.doan_id))];
        const ksIds = [...new Set(ksRefs.map((x) => x.khach_san_id))];
        const { data: ngayCodes } = await externalSupabase
          .from("doan_ngay")
          .select("doan_id, khach_san_id, ks_ma_code")
          .in("doan_id", doanIds)
          .in("khach_san_id", ksIds)
          .not("ks_ma_code", "is", null);
        (ngayCodes || []).forEach((n: any) => {
          const key = `${n.doan_id}|${n.khach_san_id}`;
          if (!codeMap.has(key) && n.ks_ma_code) codeMap.set(key, n.ks_ma_code);
        });
      }

      return (data || []).map((r: any) => {
        const codeKey = r.loai === "khach_san" && r.doan_id && r.ref_id
          ? `${r.doan_id}|${r.ref_id}` : null;
        return {
          id: r.id,
          doan_id: r.doan_id,
          ten_doan: r.doan?.ten_doan ?? null,
          loai: r.loai,
          mo_ta: r.mo_ta,
          so_tien: r.so_tien,
          la_coc: !!r.la_coc,
          ref_id: r.ref_id ?? null,
          nha_cung_cap_id: r.nha_cung_cap_id,
          ten_nha_cung_cap: r.ten_nha_cung_cap,
          ngay_can_thanh_toan: r.ngay_can_thanh_toan,
          thanh_toan_luc: r.thanh_toan_luc,
          payment_status: r.payment_status ?? "unpaid",
          paid_amount: r.paid_amount ?? 0,
          trang_thai_hoa_don: r.trang_thai_hoa_don ?? "chua_co",
          trang_thai_unc: r.trang_thai_unc ?? "chua_co",
          hoa_don_url: r.hoa_don_url,
          unc_url: r.unc_url,
          ref_loai: r.ref_loai ?? null,
          code_ncc: codeKey ? (codeMap.get(codeKey) ?? null) : null,
          ghi_chu: r.ghi_chu ?? null,
          hoa_don_so_tien: r.hoa_don_so_tien != null ? Number(r.hoa_don_so_tien) : null,
          tao_boi: r.tao_boi ?? null,
        };
      });
    },
  });
}

// Tổng toàn DB cho metric cards — không phụ thuộc filter người dùng.
// Scope mặc định = trang_thai_duyet='da_duyet' (giống điều kiện cố định của page).
export function useHoaDonUNCSummary() {
  return useQuery({
    // Prefix-share với "hoa-don-unc" → tự động refetch khi list invalidated.
    queryKey: ["hoa-don-unc", "summary"],
    queryFn: async () => {
      const base = () =>
        externalSupabase
          .from("dntt_with_payment_status")
          .select("id", { count: "exact", head: true })
          .eq("trang_thai_duyet", "da_duyet");
      const [chuaTT, daTT, thieuHD, thieuUNC] = await Promise.all([
        base().neq("payment_status", "paid"),
        base().eq("payment_status", "paid"),
        base().eq("payment_status", "paid").eq("trang_thai_hoa_don", "chua_co"),
        base().eq("payment_status", "paid").eq("trang_thai_unc", "chua_co"),
      ]);
      return {
        chuaTT: chuaTT.count ?? 0,
        daTT: daTT.count ?? 0,
        thieu_hd: thieuHD.count ?? 0,
        thieu_unc: thieuUNC.count ?? 0,
      };
    },
  });
}

export function useUpdateDocStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: number;
      field: "trang_thai_hoa_don" | "trang_thai_unc";
      value: TrangThaiDoc;
    }) => {
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ [field]: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hoa-don-unc"] }),
  });
}

export function useUploadDNTTDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      file,
      loaiDoc,
    }: {
      id: number;
      file: File;
      loaiDoc: "hoa_don" | "unc";
    }) => {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${id}/${loaiDoc}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await externalSupabase.storage
        .from("dntt-documents")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = externalSupabase.storage
        .from("dntt-documents")
        .getPublicUrl(path);

      const urlField = loaiDoc === "hoa_don" ? "hoa_don_url" : "unc_url";
      const statusField = loaiDoc === "hoa_don" ? "trang_thai_hoa_don" : "trang_thai_unc";

      const { error: updateErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ [urlField]: urlData.publicUrl, [statusField]: "da_co" })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return urlData.publicUrl;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hoa-don-unc"] }),
  });
}

// Nhập số tiền hóa đơn (thay upload ảnh). Sau khi lưu, so sánh với
// so_tien của DNTT — lệch BẤT KỲ đồng nào → tạo "việc cần xử lý" ưu tiên
// CAO + thông báo chuông cho OP tạo DNTT (tao_boi), fallback OP phụ trách
// đoàn (doan.assigned_to). Dedupe theo marker [HĐ#id] để không spam khi
// kế toán sửa số nhiều lần.
export function useSaveHoaDonSoTien() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: number;
      hoaDonSoTien: number | null;
      dnttSoTien: number;
      doanId: number | null;
      taoBoi: string | null;
      tenDoan: string | null;
      nguoiGiao: string;        // user_id kế toán đang nhập
    }): Promise<{ mismatch: boolean; notified: boolean }> => {
      const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN") + " ₫";
      const hd = p.hoaDonSoTien;

      const { error: updErr } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({
          hoa_don_so_tien: hd,
          trang_thai_hoa_don: hd != null ? "da_co" : "chua_co",
        })
        .eq("id", p.id);
      if (updErr) throw updErr;

      if (hd == null) return { mismatch: false, notified: false };
      const lech = Math.round(hd) - Math.round(p.dnttSoTien);
      if (lech === 0) return { mismatch: false, notified: false };

      // Người giao = kế toán đang nhập. Đọc auth trực tiếp để tránh
      // race (useAuth chưa resolve khi click nhanh) — giống fix tao_boi.
      let nguoiGiao = p.nguoiGiao;
      if (!nguoiGiao) {
        const { data: au } = await externalSupabase.auth.getUser();
        nguoiGiao = au?.user?.id ?? "";
      }

      // Người nhận: OP tạo DNTT → fallback OP phụ trách đoàn
      let recipient = p.taoBoi;
      if (!recipient && p.doanId) {
        const { data: d } = await externalSupabase
          .from("doan")
          .select("assigned_to")
          .eq("id", p.doanId)
          .maybeSingle();
        recipient = (d as any)?.assigned_to ?? null;
      }
      if (!recipient) return { mismatch: true, notified: false };

      // Dedupe: đã có việc đang mở cho HĐ này chưa
      const marker = `[HĐ#${p.id}]`;
      const { data: existed } = await externalSupabase
        .from("cong_viec")
        .select("id")
        .eq("nguoi_nhan", recipient)
        .ilike("mo_ta", `%${marker}%`)
        .neq("trang_thai", "hoan_thanh")
        .limit(1);
      if (existed && existed.length > 0) return { mismatch: true, notified: true };

      const tieuDe = `Hóa đơn lệch số tiền — ĐNTT #${p.id}`;
      const moTa = `${marker} Hóa đơn nhập ${fmt(hd)} ≠ số tiền ĐNTT ${fmt(p.dnttSoTien)} ` +
        `(lệch ${lech > 0 ? "+" : ""}${fmt(lech)})${p.tenDoan ? ` · Đoàn ${p.tenDoan}` : ""}. ` +
        `Kiểm tra & xử lý.`;

      const { data: cv, error: cvErr } = await externalSupabase
        .from("cong_viec")
        .insert({
          tieu_de: tieuDe,
          mo_ta: moTa,
          doan_id: p.doanId || null,
          nguoi_giao: nguoiGiao || null,
          nguoi_nhan: recipient,
          loai_viec: "thanh_toan",
          do_uu_tien: "cao",
          han_xu_ly: null,
          trang_thai: "cho_nhan",
        })
        .select("id")
        .single();
      if (cvErr) throw cvErr;

      await externalSupabase.from("thong_bao").insert({
        user_id: recipient,
        cong_viec_id: cv.id,
        dntt_id: p.id,
        loai: "giao_viec",
        tieu_de: `⚠ Hóa đơn lệch — ĐNTT #${p.id}`,
        noi_dung: `HĐ ${fmt(hd)} ≠ ĐNTT ${fmt(p.dnttSoTien)} (lệch ${lech > 0 ? "+" : ""}${fmt(lech)})` +
          `${p.tenDoan ? ` · ${p.tenDoan}` : ""}`,
        is_read: false,
      });

      return { mismatch: true, notified: true };
    },
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      if (res.notified) {
        qc.invalidateQueries({ queryKey: ["cong_viec"] });
        qc.invalidateQueries({ queryKey: ["thong_bao"] });
      }
    },
  });
}

export function useDeleteDNTTDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      loaiDoc,
    }: {
      id: number;
      loaiDoc: "hoa_don" | "unc";
    }) => {
      const urlField = loaiDoc === "hoa_don" ? "hoa_don_url" : "unc_url";
      const statusField = loaiDoc === "hoa_don" ? "trang_thai_hoa_don" : "trang_thai_unc";
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update({ [urlField]: null, [statusField]: "chua_co" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hoa-don-unc"] }),
  });
}
