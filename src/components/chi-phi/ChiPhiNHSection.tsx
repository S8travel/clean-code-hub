import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { format, getDay, subDays, parseISO } from "date-fns";
import { Plus, Ban, Printer, Trash2, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCreateAdjustment } from "@/hooks/use-dntt";
import type { DNTTRow } from "@/hooks/use-dntt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useChiPhiList, useUpsertChiPhi, useDeleteChiPhi, useDNTTList, useInsertDNTT,
} from "@/hooks/use-chi-phi";
import { useChiPhiNHSection } from "@/hooks/use-chi-phi-nh";
import { useCancelDNTT, useCreateCanTru, useUpdateDNTT } from "@/hooks/use-dntt";
import { useCurrentUserName } from "@/hooks/use-doan";
import { externalSupabase } from "@/lib/supabase-external";
import { exportDNTTNHWordFromData, type NHDocEntry } from "@/lib/export-dntt-nh-word";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("vi-VN");

const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return names[getDay(d)];
};

function calcSoKhachThucTe(soKhach: number, focKhach: number | null, focMien: number | null): number {
  if (!focKhach || !focMien || focKhach <= 0) return soKhach;
  return soKhach - Math.floor(soKhach / focKhach) * focMien;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet:     { text: "Chờ duyệt ĐNTT",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { text: "Đã duyệt ĐNTT",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { text: "Đã thanh toán",   cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { text: "Hoàn tiền",       cls: "bg-blue-100 text-blue-700" },
  cong_no:       { text: "Công nợ",         cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

// Extra rows are identified by this prefix in mo_ta column
const extraPrefix = (bua: "trua" | "toi") => `[${bua}] `;

// Parse "NH Name (trưa/tối)" → { name, bua }
function parseNHMoTa(moTa: string | null): { name: string; bua: string; buaIcon: string } {
  if (!moTa) return { name: "—", bua: "—", buaIcon: "" };
  const m = moTa.match(/^(.+)\s+\((trưa|tối)\)$/);
  if (m) return { name: m[1], bua: m[2], buaIcon: m[2] === "trưa" ? "🌤" : "🌙" };
  return { name: moTa, bua: "—", buaIcon: "" };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LocalNHRow {
  id?: number;
  nha_hang_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  ngay_so: number;
  bua_an: "trua" | "toi";
  so_khach: number;
  don_gia: number;
}

interface LocalNHExtra {
  id?: number;
  mo_ta: string;
  so_luong: number;
  don_gia: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  doanId: number;
  soKhachDefault?: number;
  tenDoan?: string;
}

export default function ChiPhiNHSection({ doanId, soKhachDefault = 0, tenDoan = "" }: Props) {
  const { data: nhData, isLoading } = useChiPhiNHSection(doanId);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: currentUserName = "" } = useCurrentUserName();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const createCanTru = useCreateCanTru();
  const insertDNTT = useInsertDNTT();

  const [localRows, setLocalRows] = useState<Record<string, LocalNHRow>>({});
  const [extrasMap, setExtrasMap] = useState<Record<string, LocalNHExtra[]>>({});
  const localRowsRef = useRef(localRows);
  const extrasMapRef = useRef(extrasMap);
  useEffect(() => { localRowsRef.current = localRows; }, [localRows]);
  useEffect(() => { extrasMapRef.current = extrasMap; }, [extrasMap]);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [batchPrinting, setBatchPrinting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<{
    dnttId: number; isPaid: boolean; nhName: string;
  } | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Điều chỉnh sau thanh toán
  const adjustMut = useCreateAdjustment();
  const [adjustTarget, setAdjustTarget] = useState<DNTTRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Sửa ĐNTT chờ duyệt
  const updateDNTT = useUpdateDNTT();
  const [editingDnttId, setEditingDnttId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const [dnttModalKey, setDnttModalKey] = useState<string | null>(null);
  const [dnttModalMode, setDnttModalMode] = useState<"full" | "deposit">("full");
  const [dnttDepositAmount, setDnttDepositAmount] = useState(0);
  const [dnttAlreadyPaid, setDnttAlreadyPaid] = useState(0); // amount already paid (for partial flow)
  const [dnttBsAmount, setDnttBsAmount] = useState(0); // bổ sung: nhập tự do khi đã TT đủ
  const [dnttNgayCan, setDnttNgayCan] = useState(""); // ngày cần thanh toán
  const [dnttSubmitting, setDnttSubmitting] = useState(false);
  const [canTruByMeal, setCanTruByMeal] = useState<Record<string, CanTruSelection | null>>({});

  // Định kỳ per meal key
  const [dinhKyKeys, setDinhKyKeys] = useState<Set<string>>(new Set());
  const dinhKyKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => { dinhKyKeysRef.current = dinhKyKeys; }, [dinhKyKeys]);

  const initializedRef = useRef(false);
  const autoFixedHdvRef = useRef(false);

  // ── Load from DB ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!nhData || initializedRef.current) return;
    if (nhData.meals.length === 0) return;

    const nhChiPhi = chiPhiRows.filter((c) => c.danh_muc === "nha_hang");
    const rows: Record<string, LocalNHRow> = {};
    const extras: Record<string, LocalNHExtra[]> = {};

    for (const meal of nhData.meals) {
      const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
      const prefix = extraPrefix(meal.bua_an);
      const nh = nhData.nhaHangMap[meal.nha_hang_id];
      const nhName = nh?.ten || "Nhà hàng";
      const buaStr = meal.bua_an === "trua" ? "trưa" : "tối";
      const mainMoTa = `${nhName} (${buaStr})`;

      const mainCp = nhChiPhi.find(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta === mainMoTa,
      );
      rows[key] = {
        id: mainCp?.id,
        nha_hang_id: meal.nha_hang_id,
        doan_ngay_id: meal.doan_ngay_id,
        ngay_date: meal.ngay_date,
        ngay_so: meal.ngay_so,
        bua_an: meal.bua_an,
        // Nếu DB có so_luong > 1 thì dùng DB, còn lại dùng soKhachDefault (tránh giá trị 1 sai từ lần lưu cũ)
        so_khach: (mainCp?.so_luong != null && mainCp.so_luong > 1) ? mainCp.so_luong : (soKhachDefault || mainCp?.so_luong || 0),
        don_gia: (mainCp?.don_gia != null && mainCp.don_gia > 0) ? mainCp.don_gia : (meal.gia_set_menu ?? 0),
      };

      const extraCps = nhChiPhi.filter(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta?.startsWith(prefix),
      );
      if (extraCps.length > 0) {
        extras[key] = extraCps.map((cp) => ({
          id: cp.id,
          mo_ta: cp.mo_ta?.slice(prefix.length) || "",
          so_luong: cp.so_luong,
          don_gia: cp.don_gia,
        }));
      }
    }

    setLocalRows(rows);
    setExtrasMap(extras);

    // Khởi tạo dinhKyKeys từ DB
    const dkSet = new Set<string>();
    for (const meal of nhData.meals) {
      const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
      const nh = nhData.nhaHangMap[meal.nha_hang_id];
      const nhName = nh?.ten || "Nhà hàng";
      const buaStr = meal.bua_an === "trua" ? "trưa" : "tối";
      const mainMoTa = `${nhName} (${buaStr})`;
      const mainCp = nhChiPhi.find(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta === mainMoTa,
      );
      if (mainCp?.thanh_toan_dinh_ky) dkSet.add(key);
    }
    if (dkSet.size > 0) setDinhKyKeys(dkSet);

    initializedRef.current = true;
  }, [nhData, chiPhiRows, soKhachDefault]);

  // Chỉ reset khi doanId THỰC SỰ thay đổi, không chạy khi mount lần đầu
  const prevDoanIdRef = useRef(doanId);
  useEffect(() => {
    if (prevDoanIdRef.current === doanId) return;
    prevDoanIdRef.current = doanId;
    initializedRef.current = false;
    autoFixedHdvRef.current = false;
    setLocalRows({});
    setExtrasMap({});
  }, [doanId]);

  // Khi nhData thay đổi (user vừa chọn set menu ở điều tour), cập nhật
  // những rows có don_gia = 0 với giá set menu mới
  useEffect(() => {
    if (!nhData) return;
    setLocalRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const meal of nhData.meals) {
        const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
        if (next[key] && next[key].don_gia === 0 && meal.gia_set_menu != null && meal.gia_set_menu > 0) {
          next[key] = { ...next[key], don_gia: meal.gia_set_menu };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nhData]);

  // Khi soKhachDefault load xong (async), cập nhật rows chưa có số khách
  useEffect(() => {
    if (soKhachDefault <= 0) return;
    setLocalRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        // Cập nhật nếu so_khach = 0 hoặc = 1 (default sai từ lần lưu trước)
        if (next[key].so_khach === 0 || (soKhachDefault > 1 && next[key].so_khach === 1)) {
          next[key] = { ...next[key], so_khach: soKhachDefault };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [soKhachDefault]);

  // Auto-fix: nếu NH có nguoi_thanh_toan = "hdv" nhưng DB row có tien_cong_ty > 0
  // (hoặc chưa có trong DB), re-save để phân bổ đúng vào tien_hdv.
  useEffect(() => {
    if (autoFixedHdvRef.current || !initializedRef.current) return;
    if (!nhData || Object.keys(localRows).length === 0) return;

    autoFixedHdvRef.current = true;

    for (const [key, row] of Object.entries(localRows)) {
      const nh = nhData.nhaHangMap[row.nha_hang_id];
      if (nh?.nguoi_thanh_toan !== "hdv") continue;
      if (!row.don_gia || !row.so_khach) continue;

      const dbRow = row.id ? chiPhiRows.find((cp) => cp.id === row.id) : null;
      if (!dbRow || (dbRow.tien_cong_ty != null && dbRow.tien_cong_ty > 0)) {
        handleSave(key);
      }
    }
  }, [localRows, nhData, chiPhiRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-xóa chi phí NH orphaned đã bị chuyển thành công nợ
  const autoDeletedNhIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!nhData || chiPhiRows.length === 0 || dnttList.length === 0) return;
    const currentNgayIds = new Set(nhData.meals.map((m) => m.doan_ngay_id));
    const orphanedCongNoCps = chiPhiRows.filter((cp) => {
      if (cp.danh_muc !== "nha_hang") return false;
      if (cp.ref_doan_ngay_id == null) return false;
      if (currentNgayIds.has(cp.ref_doan_ngay_id)) return false;
      if (cp.mo_ta?.startsWith("[trua] ") || cp.mo_ta?.startsWith("[toi] ")) return false;
      if (!cp.id || autoDeletedNhIdsRef.current.has(cp.id)) return false;
      return dnttList.some(
        (d) =>
          d.ref_loai === "doan_chi_phi" &&
          d.ref_id === cp.id &&
          d.trang_thai_duyet === "da_huy" &&
          d.trang_thai_thanh_toan === "cong_no",
      );
    });
    for (const cp of orphanedCongNoCps) {
      autoDeletedNhIdsRef.current.add(cp.id!);
      deleteMut.mutate({ id: cp.id!, doanId });
    }
  }, [nhData, chiPhiRows, dnttList, doanId, deleteMut]);

  // ── Main row handlers ─────────────────────────────────────────────────────

  const handleChange = useCallback((key: string, field: "so_khach" | "don_gia", value: number) => {
    setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }, []);

  const handleSave = useCallback((key: string) => {
    const row = localRowsRef.current[key];
    if (!row || (!row.don_gia && !row.so_khach)) return;

    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const nhName = nh?.ten || "Nhà hàng";
    const buaStr = row.bua_an === "trua" ? "trưa" : "tối";
    const soKhachThucTe = calcSoKhachThucTe(row.so_khach, nh?.foc_khach ?? null, nh?.foc_mien ?? null);
    const thanhTienTruocCK = soKhachThucTe * row.don_gia;
    const ck = nh?.chiet_khau_phan_tram ?? null;
    const thanhTien = ck && ck > 0 ? Math.round(thanhTienTruocCK * (1 - ck / 100)) : thanhTienTruocCK;

    upsertMut.mutate(
      {
        id: row.id,
        doan_id: doanId,
        ngay_so: row.ngay_so,
        loai: "chi",
        danh_muc: "nha_hang",
        ref_doan_ngay_id: row.doan_ngay_id,
        mo_ta: `${nhName} (${buaStr})`,
        don_gia: row.don_gia,
        so_luong: row.so_khach,
        tien_cong_ty: nh?.nguoi_thanh_toan !== "hdv" ? thanhTien : 0,
        tien_hdv: nh?.nguoi_thanh_toan === "hdv" ? thanhTien : 0,
        thanh_toan_dinh_ky: dinhKyKeysRef.current.has(key),
      },
      {
        onSuccess: (data) => {
          if (!row.id && data?.id) {
            setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: data.id } }));
          }
        },
      },
    );
  }, [doanId, upsertMut, nhData]);

  const handleToggleDinhKyNH = useCallback((key: string) => {
    setDinhKyKeys((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(key);
      if (newVal) next.add(key); else next.delete(key);
      // Cập nhật chi phí row trong DB nếu đã tồn tại
      const row = localRowsRef.current[key];
      if (row?.id) {
        upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any);
      }
      return next;
    });
  }, [doanId, upsertMut]);

  // ── Extra handlers ────────────────────────────────────────────────────────

  const addExtra = useCallback((key: string) => {
    setExtrasMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { mo_ta: "", so_luong: 1, don_gia: 0 }],
    }));
  }, []);

  const handleExtraChange = useCallback((key: string, idx: number, field: keyof LocalNHExtra, value: any) => {
    setExtrasMap((prev) => {
      const list = [...(prev[key] || [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, [key]: list };
    });
  }, []);

  const handleExtraSave = useCallback((key: string, idx: number) => {
    const extra = extrasMapRef.current[key]?.[idx];
    const row = localRowsRef.current[key];
    if (!extra || !row || (!extra.mo_ta && !extra.don_gia)) return;

    const prefix = extraPrefix(row.bua_an);
    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const thanhTien = extra.so_luong * extra.don_gia;

    upsertMut.mutate(
      {
        id: extra.id,
        doan_id: doanId,
        ngay_so: row.ngay_so,
        loai: "chi",
        danh_muc: "nha_hang",
        ref_doan_ngay_id: row.doan_ngay_id,
        mo_ta: `${prefix}${extra.mo_ta}`,
        don_gia: extra.don_gia,
        so_luong: extra.so_luong,
        tien_cong_ty: nh?.nguoi_thanh_toan !== "hdv" ? thanhTien : 0,
        tien_hdv: nh?.nguoi_thanh_toan === "hdv" ? thanhTien : 0,
      },
      {
        onSuccess: (data) => {
          if (!extra.id && data?.id) {
            setExtrasMap((prev) => {
              const list = [...(prev[key] || [])];
              list[idx] = { ...list[idx], id: data.id };
              return { ...prev, [key]: list };
            });
          }
        },
      },
    );
  }, [doanId, upsertMut, nhData]);

  const handleExtraDelete = useCallback((key: string, idx: number) => {
    const extra = extrasMap[key]?.[idx];
    const remove = () =>
      setExtrasMap((prev) => {
        const list = [...(prev[key] || [])];
        list.splice(idx, 1);
        return { ...prev, [key]: list };
      });
    if (extra?.id) {
      deleteMut.mutate({ id: extra.id, doanId }, { onSuccess: remove });
    } else {
      remove();
    }
  }, [extrasMap, doanId, deleteMut]);

  // ── DNTT ─────────────────────────────────────────────────────────────────

  const handleDnttSubmit = async () => {
    const key = dnttModalKey;
    if (!key) return;
    let row = localRows[key];
    const extras = extrasMap[key] || [];
    if (!row) return;

    // Auto-save chi_phi nếu chưa có id
    if (!row.id) {
      const nh0 = nhData?.nhaHangMap[row.nha_hang_id];
      const nhName0 = nh0?.ten || "Nhà hàng";
      const buaStr0 = row.bua_an === "trua" ? "trưa" : "tối";
      const skTT0 = calcSoKhachThucTe(row.so_khach, nh0?.foc_khach ?? null, nh0?.foc_mien ?? null);
      try {
        const saved = await upsertMut.mutateAsync({
          doan_id: doanId,
          ngay_so: row.ngay_so,
          loai: "chi",
          danh_muc: "nha_hang",
          ref_doan_ngay_id: row.doan_ngay_id,
          mo_ta: `${nhName0} (${buaStr0})`,
          don_gia: row.don_gia,
          so_luong: row.so_khach,
          tien_cong_ty: nh0?.nguoi_thanh_toan !== "hdv" ? Math.round(skTT0 * row.don_gia * (1 - (nh0?.chiet_khau_phan_tram ?? 0) / 100)) : 0,
          tien_hdv: nh0?.nguoi_thanh_toan === "hdv" ? Math.round(skTT0 * row.don_gia * (1 - (nh0?.chiet_khau_phan_tram ?? 0) / 100)) : 0,
        });
        if (saved?.id) {
          setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: saved.id } }));
          row = { ...row, id: saved.id };
        }
      } catch (err: any) {
        toast.error("Lỗi lưu chi phí: " + (err?.message || ""));
        return;
      }
    }

    if (!row?.id) { toast.error("Chưa lưu chi phí bữa ăn"); return; }

    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const soKhachThucTe = calcSoKhachThucTe(row.so_khach, nh?.foc_khach ?? null, nh?.foc_mien ?? null);
    const mainTotalTruocCK = soKhachThucTe * row.don_gia;
    const extrasTotal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
    const ckPct = nh?.chiet_khau_phan_tram ?? null;
    const chietKhau = ckPct && ckPct > 0 ? Math.round(mainTotalTruocCK * ckPct / 100) : 0;
    const totalBua = mainTotalTruocCK - chietKhau + extrasTotal;
    // Số tiền chưa đề nghị (trừ phần đã cọc + thanh toán trước)
    const effectiveTotalBua = Math.max(0, totalBua - dnttAlreadyPaid);
    const isBSMode = effectiveTotalBua <= 0;
    const soTien = isBSMode ? dnttBsAmount : (dnttModalMode === "full" ? effectiveTotalBua : dnttDepositAmount);
    const soTienConLai = isBSMode ? 0 : (dnttModalMode === "full" ? 0 : effectiveTotalBua - dnttDepositAmount);
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }

    setDnttSubmitting(true);
    try {
      const nhName = nh?.ten || "Nhà hàng";
      const buaLabel = row.bua_an === "trua" ? "trưa" : "tối";
      const dateLabel = row.ngay_date
        ? format(new Date(row.ngay_date + "T00:00:00"), "dd/MM")
        : "?";

      await insertDNTT.mutateAsync({
        doan_id: doanId,
        loai: "nha_hang",
        mo_ta: `${nhName} (${buaLabel}) - Ngày ${row.ngay_so} ${dateLabel}`,
        nha_cung_cap_id: nh?.nha_cung_cap_id || null,
        ten_nha_cung_cap: nh?.ten_ncc || null,
        so_tai_khoan: nh?.ncc_so_tai_khoan || null,
        ngan_hang: nh?.ncc_ngan_hang || null,
        so_tien: soTien,
        la_coc: dnttModalMode === "deposit",
        so_tien_con_lai: soTienConLai > 0 ? soTienConLai : 0,
        trang_thai_duyet: "cho_duyet",
        trang_thai_thanh_toan: "chua_tt",
        ref_loai: "doan_chi_phi",
        ref_id: row.id,
        ngay_can_thanh_toan: dnttNgayCan || null,
        allocations: [{ chi_phi_id: row.id, so_tien: soTien }],
      });

      const allIds = [row.id, ...extras.filter((e) => e.id).map((e) => e.id!)];
      await externalSupabase
        .from("doan_chi_phi")
        .update({ trang_thai_dntt: "cho_duyet" })
        .in("id", allIds);

      // Áp dụng cấn trừ nếu có
      const canTru = canTruByMeal[key];
      if (canTru && nh?.nha_cung_cap_id && canTru.soTienCanTru > 0) {
        await createCanTru.mutateAsync({
          doanId,
          nccId: nh.nha_cung_cap_id,
          loai: "nha_hang",
          tenDoanMoi: tenDoan,
          items: [{
            congNoId: canTru.congNoId,
            soTienGoc: canTru.soTienConLai,
            soTienConLai: canTru.soTienConLai,
            soTienCanTru: Math.min(canTru.soTienCanTru, soTien),
            tenDoan: canTru.tenDoan,
          }],
        });
        setCanTruByMeal((prev) => ({ ...prev, [key]: null }));
      }

      toast.success("Đã tạo đề nghị thanh toán");
      setDnttModalKey(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể tạo ĐNTT"));
    } finally {
      setDnttSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => {
          toast.success(cancelTarget.isPaid ? "Đã hủy khoản thanh toán" : "Đã hủy đề nghị");
          setCancelTarget(null);
        },
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy"),
      },
    );
  };

  // ── Print handler ─────────────────────────────────────────────────────────

  const handlePrintSelected = async () => {
    if (!nhData || selectedKeys.length === 0) return;
    setBatchPrinting(true);
    try {
      const entries: NHDocEntry[] = [];
      // Track cấn trừ đã phân bổ cho từng NCC (chỉ hiện 1 lần)
      const canTruShownByNcc: Record<number, boolean> = {};

      for (const key of selectedKeys) {
        const row = localRowsRef.current[key];
        if (!row) continue;
        const nh = nhData.nhaHangMap[row.nha_hang_id];
        if (!nh) continue;

        // Số khách thực tế (trừ FOC)
        const soLuongThuc = calcSoKhachThucTe(row.so_khach, nh.foc_khach, nh.foc_mien);

        // Build items: main meal + extras
        const extras = extrasMapRef.current[key] || [];
        const items: NHDocEntry["items"] = [];
        if (row.don_gia > 0) {
          items.push({ so_luong: soLuongThuc, don_gia: row.don_gia, ghi_chu: "" });
        }
        extras.forEach((e) => {
          if (e.don_gia > 0) {
            items.push({ so_luong: e.so_luong, don_gia: e.don_gia, ghi_chu: e.mo_ta });
          }
        });
        if (items.length === 0) continue;

        // DNTT for this meal
        const chiPhiId = row.id;
        const mealDntts = chiPhiId
          ? dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId)
          : [];

        // Cọc đã thanh toán thực sự (da_tt)
        const soCoc = mealDntts
          .filter((d) => d.la_coc && d.trang_thai_duyet !== "da_huy" && d.trang_thai_thanh_toan === "da_tt")
          .reduce((s, d) => s + d.so_tien, 0);

        // Cấn trừ công nợ đã duyệt (NCC-level, chỉ hiện 1 lần mỗi NCC)
        const nccId = nh.nha_cung_cap_id ?? null;
        let canTruAmount = 0;
        if (nccId && !canTruShownByNcc[nccId]) {
          canTruAmount = dnttList
            .filter(
              (d) =>
                d.trang_thai_thanh_toan === "can_tru" &&
                d.trang_thai_duyet === "da_duyet" &&
                d.nha_cung_cap_id === nccId,
            )
            .reduce((s, d) => s + d.so_tien, 0);
          if (canTruAmount > 0) canTruShownByNcc[nccId] = true;
        }

        const totalEntry = items.reduce((s, i) => s + i.so_luong * i.don_gia, 0);
        const soTienConTT = Math.max(0, totalEntry - soCoc - canTruAmount);

        // Format ngay_date
        const d = new Date(row.ngay_date + "T00:00:00");
        const ngayDisplay = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        entries.push({
          ngay_date: ngayDisplay,
          ten_nh: nh.ten,
          so_khach: row.so_khach,
          foc: nh.foc_khach && nh.foc_mien ? nh.foc_mien : null,
          items,
          ncc: nh.nha_cung_cap_id
            ? { ten: nh.ten_ncc || undefined, so_tai_khoan: nh.ncc_so_tai_khoan || undefined, ngan_hang: nh.ncc_ngan_hang || undefined }
            : null,
          so_tien_coc: soCoc,
          can_tru: canTruAmount,
          so_tien_con_tt: soTienConTT,
        });
      }

      if (entries.length === 0) {
        toast.error("Không có dữ liệu để xuất");
        return;
      }

      await exportDNTTNHWordFromData({
        doan: { ten_doan: tenDoan || String(doanId) },
        entries,
        nguoiDeNghi: currentUserName,
      });
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    } finally {
      setBatchPrinting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <div className="text-sm text-muted-foreground">Đang tải nhà hàng...</div>;

  const meals = nhData?.meals || [];
  const nhaHangMap = nhData?.nhaHangMap || {};

  if (meals.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ Nhà hàng
          <Badge variant="secondary" className="text-xs">Điều tour</Badge>
        </h3>
        <p className="text-sm text-muted-foreground">Chưa có nhà hàng trong lịch trình.</p>
      </div>
    );
  }

  const mealKeys = meals.map((m) => `${m.doan_ngay_id}_${m.bua_an}`);
  const allSelected = selectedKeys.length === meals.length && meals.length > 0;

  return (
    <div className="space-y-3">
      {/* Header + toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ Nhà hàng
          <Badge variant="secondary" className="text-xs">Điều tour</Badge>
        </h3>
        {selectedKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handlePrintSelected}
              disabled={batchPrinting}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              In ĐNTT ({selectedKeys.length})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKeys([])}>
              Bỏ chọn
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <colgroup>
            <col className="w-[28px]" />
            <col className="w-[64px]" />
            <col />
            <col className="w-[56px]" />
            <col className="w-[80px]" />
            <col className="w-[100px]" />
            <col className="w-[110px]" />
            <col className="w-[180px]" />
            <col className="w-[150px]" />
            <col className="w-[100px]" />
          </colgroup>
          {/* Header */}
          <thead>
            <tr className="bg-muted/50 border-b border-border text-[11px] font-medium text-muted-foreground">
              <th className="px-2 py-1.5 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => v ? setSelectedKeys(mealKeys) : setSelectedKeys([])}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="px-3 py-2 text-center font-medium">Ngày</th>
              <th className="px-3 py-2 text-left font-medium">Nhà hàng</th>
              <th className="px-3 py-2 text-center font-medium">Bữa</th>
              <th className="px-3 py-2 text-center font-medium">Số khách</th>
              <th className="px-3 py-2 text-center font-medium">Đơn giá</th>
              <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
              <th className="px-3 py-2 text-center font-medium">TT ĐNTT</th>
              <th className="px-3 py-2 text-center font-medium">TT Thanh toán</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          {/* Rows */}
          <tbody>
        {meals.map((meal, mealIdx) => {
          const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
          const row = localRows[key];
          const extras = extrasMap[key] || [];
          const nh = nhaHangMap[meal.nha_hang_id];
          const selected = selectedKeys.includes(key);

          const soKhachThucTe = row
            ? calcSoKhachThucTe(row.so_khach, nh?.foc_khach ?? null, nh?.foc_mien ?? null)
            : 0;
          const focMienSo = row ? row.so_khach - soKhachThucTe : 0;
          const mainTotal = row ? soKhachThucTe * row.don_gia : 0;
          const extrasTotal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
          const totalTruocCK = mainTotal + extrasTotal;
          // Chiết khấu % áp dụng trên tổng sau FOC
          const ckPhanTram = nh?.chiet_khau_phan_tram ?? null;
          const chietKhauSoTien = ckPhanTram && ckPhanTram > 0
            ? Math.round(totalTruocCK * ckPhanTram / 100)
            : 0;
          const totalBua = totalTruocCK - chietKhauSoTien;

          const dateLabel = meal.ngay_date
            ? `N${meal.ngay_so} · ${format(new Date(meal.ngay_date + "T00:00:00"), "d/M")}`
            : `N${meal.ngay_so}`;
          const buaLabel = meal.bua_an === "trua" ? "Trưa" : "Tối";
          const buaIcon = meal.bua_an === "trua" ? "🌤" : "🌙";

          const isMealDinhKy = dinhKyKeys.has(key);

          // ── DNTT state per meal ──────────────────────────────────────────
          const allMealDntts = row?.id ? dnttList.filter(
            (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
          ) : [];
          const activeDntts = allMealDntts.filter(
            (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
          );
          const paidDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan === "da_tt");
          const pendingDntts = activeDntts.filter((d) => d.trang_thai_thanh_toan !== "da_tt");
          const daTT = paidDntts.reduce((s, d) => s + d.so_tien, 0);
          const daDeNghi = pendingDntts.reduce((s, d) => s + d.so_tien, 0);
          const isDaTT = totalBua > 0 && daTT >= totalBua;
          const conLai = Math.max(0, totalBua - daTT);
          // Primary DNTT for cancel: prefer pending over paid
          const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
          const canCancel = activeDntt && (
            activeDntt.trang_thai_duyet === "cho_duyet" ||
            activeDntt.trang_thai_duyet === "da_duyet" ||
            activeDntt.trang_thai_thanh_toan === "da_tt"
          );
          // Pending badge: show status of first pending DNTT
          const pendingStatusInfo = pendingDntts[0]
            ? STATUS_LABEL[pendingDntts[0].trang_thai_duyet] ?? STATUS_LABEL.cho_duyet
            : null;
          const congNoAmount = allMealDntts.filter(
            (d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no"
          ).reduce((s, d) => s + d.so_tien, 0);
          const hoanTienAmount = allMealDntts.filter(
            (d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien"
          ).reduce((s, d) => s + d.so_tien, 0);

          return (
            <Fragment key={key}>
              {/* Main meal row */}
              <tr
                className={`border-b border-border last:border-b-0 ${selected ? "bg-primary/5" : ""} hover:bg-muted/30 transition-colors`}
              >
                {/* Checkbox */}
                <td className="px-2 py-1.5">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setSelectedKeys((prev) =>
                        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                </td>

                {/* Ngày */}
                <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap text-[11px]">
                  {dateLabel}
                </td>

                {/* NH name */}
                <td className="px-3 py-2 font-medium">
                  <div className="truncate">
                    {nh?.ten || `NH #${meal.nha_hang_id}`}
                    {nh?.ncc_so_tai_khoan && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                        STK: {nh.ncc_so_tai_khoan}
                      </span>
                    )}
                  </div>
                </td>

                {/* Bữa */}
                <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap">
                  {buaIcon} {buaLabel}
                </td>

                {/* Số khách */}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {row ? (
                      <>
                        <NHInput
                          value={row.so_khach}
                          onChange={(v) => handleChange(key, "so_khach", v)}
                          onBlur={() => handleSave(key)}
                          width="w-[44px]"
                        />
                        {focMienSo > 0 && (
                          <span className="text-green-600 text-[10px]">-{focMienSo}</span>
                        )}
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* Đơn giá */}
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    {row ? (
                      <NHInput
                        value={row.don_gia}
                        onChange={(v) => handleChange(key, "don_gia", v)}
                        onBlur={() => handleSave(key)}
                        width="w-[84px]"
                      />
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* Thành tiền (đã trừ FOC + CK) */}
                <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                  {row ? (
                    <div>
                      <div>{fmt(totalBua)}</div>
                      {chietKhauSoTien > 0 && (
                        <div className="text-[10px] text-green-600 font-normal">
                          CK {ckPhanTram}%: −{fmt(chietKhauSoTien)}
                        </div>
                      )}
                    </div>
                  ) : "—"}
                </td>

                {/* Trạng thái ĐNTT */}
                <td className="px-2 py-1.5 align-top text-center">
                  {activeDntts.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    <div className="space-y-1">
                      {activeDntts.map(d => {
                        const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                        return (
                          <div key={d.id} className="flex items-center gap-1 flex-wrap">
                            {editingDnttId === d.id ? (
                              <>
                                <Input
                                  autoFocus
                                  type="number"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: d.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }
                                    if (e.key === "Escape") setEditingDnttId(null);
                                  }}
                                  className="h-6 w-20 text-xs px-2 py-0"
                                />
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600 hover:text-emerald-700"
                                  disabled={updateDNTT.isPending}
                                  onClick={() => {
                                    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                    if (!isNaN(v) && v > 0) {
                                      updateDNTT.mutate({ id: d.id, soTien: v });
                                      setEditingDnttId(null);
                                    }
                                  }}>
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground"
                                  onClick={() => setEditingDnttId(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.cls}`}>
                                  {statusInfo.text} · {fmt(d.so_tien)}
                                </span>
                                {d.la_coc && (
                                  <span className="text-[9px] text-muted-foreground">(Cọc)</span>
                                )}
                                {d.trang_thai_duyet === "cho_duyet" && (
                                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-500 hover:text-blue-600"
                                    title="Sửa số tiền"
                                    onClick={() => { setEditingDnttId(d.id); setEditAmount(String(d.so_tien)); }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>

                {/* Trạng thái Thanh toán */}
                <td className="px-2 py-1.5 align-top text-center">
                  <div className="space-y-1">
                    {activeDntts.map(d => (
                      <div key={d.id}>
                        {d.trang_thai_thanh_toan === "da_tt" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                            Đã TT{(d as any).ngay_thanh_toan ? ` ${format(new Date((d as any).ngay_thanh_toan), "dd/MM")}` : ""}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                            Chờ UNC · {fmt(d.so_tien)}
                          </span>
                        )}
                      </div>
                    ))}
                    {congNoAmount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                        CN: {fmt(congNoAmount)}
                      </span>
                    )}
                    {hoanTienAmount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                        HT: {fmt(hoanTienAmount)}
                      </span>
                    )}
                    {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1 justify-end">
                    {isDaTT && paidDntts.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                        title="Điều chỉnh sau thanh toán"
                        onClick={() => {
                          const lastPaid = paidDntts[paidDntts.length - 1];
                          setAdjustTarget(lastPaid as unknown as DNTTRow);
                          setAdjustAmount(String(lastPaid.so_tien));
                          setAdjustReason("");
                        }}>
                        <SlidersHorizontal className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      title="Thêm dịch vụ phát sinh"
                      onClick={() => addExtra(key)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    {canCancel && activeDntt && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        title="Hủy"
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({
                            dnttId: activeDntt.id,
                            isPaid: activeDntt.trang_thai_thanh_toan === "da_tt",
                            nhName: nh?.ten || "Nhà hàng",
                          });
                        }}>
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm"
                      className={cn("h-6 text-[10px] px-1.5", isMealDinhKy ? "text-indigo-600 hover:text-indigo-700" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => handleToggleDinhKyNH(key)}
                      title={isMealDinhKy ? "Đang định kỳ — bấm để bỏ" : "Đặt thanh toán định kỳ"}>
                      ⏱
                    </Button>
                    {isMealDinhKy && activeDntts.length === 0 && (
                      <span className="text-[10px] text-indigo-500 italic">Định kỳ</span>
                    )}
                    {!isMealDinhKy && activeDntts.length === 0 && !!row && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                        onClick={() => {
                          setDnttAlreadyPaid(0);
                          setDnttModalMode("full");
                          setDnttDepositAmount(0);
                          setDnttNgayCan(meal.ngay_date ? (() => { try { return format(subDays(parseISO(meal.ngay_date), 1), "yyyy-MM-dd"); } catch { return ""; } })() : "");
                          setDnttModalKey(key);
                        }}>
                        ĐNTT
                      </Button>
                    )}
                    {!isMealDinhKy && activeDntts.length > 0 && daDeNghi === 0 && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setDnttAlreadyPaid(daTT);
                          setDnttModalMode("full");
                          setDnttDepositAmount(0);
                          setDnttBsAmount(0);
                          setDnttNgayCan(meal.ngay_date ? (() => { try { return format(subDays(parseISO(meal.ngay_date), 1), "yyyy-MM-dd"); } catch { return ""; } })() : "");
                          setDnttModalKey(key);
                        }}>
                        {conLai > 0 ? `ĐNTT còn lại` : "ĐNTT bổ sung"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>

              {/* Extras sub-rows */}
              {extras.map((extra, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border/50 last:border-b-0 bg-muted/20"
                >
                  <td />
                  <td />
                  <td colSpan={2} className="pl-6 py-1">
                    <ExtraRow
                      extra={extra}
                      onChange={(field, val) => handleExtraChange(key, idx, field as keyof LocalNHExtra, val)}
                      onBlur={() => handleExtraSave(key, idx)}
                      onDelete={() => handleExtraDelete(key, idx)}
                    />
                  </td>
                  <td />
                  <td />
                  <td className="px-2 py-1 text-right text-muted-foreground text-[10px]">
                    {extra.so_luong > 0 && extra.don_gia > 0 ? fmt(extra.so_luong * extra.don_gia) : ""}
                  </td>
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </Fragment>
          );
        })}
          {/* Orphaned NH rows — removed from điều tour but still have chi phí / DNTT */}
          {(() => {
            const currentNgayIds = new Set(meals.map((m) => m.doan_ngay_id));
            const orphanedCps = chiPhiRows.filter(
              (cp) =>
                cp.danh_muc === "nha_hang" &&
                cp.ref_doan_ngay_id != null &&
                !currentNgayIds.has(cp.ref_doan_ngay_id) &&
                !cp.mo_ta?.startsWith("[trua] ") &&
                !cp.mo_ta?.startsWith("[toi] ") &&
                // Ẩn luôn những row đã/đang được auto-xóa (công nợ orphaned)
                !dnttList.some(
                  (d) =>
                    d.ref_loai === "doan_chi_phi" &&
                    d.ref_id === cp.id &&
                    d.trang_thai_duyet === "da_huy" &&
                    d.trang_thai_thanh_toan === "cong_no",
                ),
            );
            if (orphanedCps.length === 0) return null;
            return (
              <>
                <tr>
                  <td colSpan={10} className="px-3 py-1 text-[11px] text-muted-foreground bg-muted/40 border-t border-border">
                    Không còn trong lịch trình điều tour
                  </td>
                </tr>
                {orphanedCps.map((cp) => {
                  const { name: cpNhName, bua: cpBua, buaIcon: cpBuaIcon } = parseNHMoTa(cp.mo_ta);
                  const cpTotal = cp.so_luong * cp.don_gia;
                  const cpDntts = dnttList.filter(
                    (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id,
                  );
                  const cpActiveDntts = cpDntts.filter(
                    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                  );
                  const cpCongNo = cpDntts.filter(
                    (d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no",
                  ).reduce((s, d) => s + d.so_tien, 0);
                  const cpHoanTien = cpDntts.filter(
                    (d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien",
                  ).reduce((s, d) => s + d.so_tien, 0);
                  const cpPending = cpActiveDntts.find((d) => d.trang_thai_thanh_toan !== "da_tt");
                  const cpPendingInfo = cpPending ? STATUS_LABEL[cpPending.trang_thai_duyet] : null;
                  const cpDaTT = cpActiveDntts.filter((d) => d.trang_thai_thanh_toan === "da_tt")
                    .reduce((s, d) => s + d.so_tien, 0);
                  const cpIsDaTT = cpTotal > 0 && cpDaTT >= cpTotal;
                  return (
                    <tr key={`orphan-${cp.id}`} className="border-t border-border bg-muted/10 opacity-80">
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-center text-muted-foreground text-[11px]">
                        N{cp.ngay_so}
                      </td>
                      <td className="px-2 py-1.5 font-medium text-muted-foreground max-w-0">
                        <div className="truncate">{cpNhName}</div>
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">
                        {cpBuaIcon} {cpBua}
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{cp.so_luong}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{fmt(cp.don_gia)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-muted-foreground">
                        {fmt(cpTotal)}
                      </td>
                      {/* Trạng thái ĐNTT - orphaned */}
                      <td className="px-2 py-1.5 align-top">
                        {cpActiveDntts.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            {cpActiveDntts.map(d => {
                              const si = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                              return (
                                <span key={d.id} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${si.cls}`}>
                                  {si.text} · {fmt(d.so_tien)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      {/* Trạng thái TT - orphaned */}
                      <td className="px-2 py-1.5 align-top">
                        <div className="space-y-1">
                          {cpActiveDntts.map(d => (
                            <div key={d.id}>
                              {d.trang_thai_thanh_toan === "da_tt" ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">Đã TT</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">Chờ UNC</span>
                              )}
                            </div>
                          ))}
                          {cpCongNo > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">CN: {fmt(cpCongNo)}</span>
                          )}
                          {cpHoanTien > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">HT: {fmt(cpHoanTien)}</span>
                          )}
                          {cpActiveDntts.length === 0 && cpCongNo === 0 && cpHoanTien === 0 && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td />
                    </tr>
                  );
                })}
              </>
            );
          })()}
          </tbody>
        </table>
      </div>

      {/* DNTT Modal */}
      {dnttModalKey != null && (() => {
        const row = localRows[dnttModalKey];
        if (!row) return null;
        const extras = extrasMap[dnttModalKey] || [];
        const nh = nhaHangMap[row.nha_hang_id];
        const soKhachThucTe = calcSoKhachThucTe(row.so_khach, nh?.foc_khach ?? null, nh?.foc_mien ?? null);
        const mainTotalModal = soKhachThucTe * row.don_gia;
        const extrasTotal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
        const ckPctModal = nh?.chiet_khau_phan_tram ?? null;
        const chietKhauModal = ckPctModal && ckPctModal > 0 ? Math.round(mainTotalModal * ckPctModal / 100) : 0;
        const totalBua = mainTotalModal - chietKhauModal + extrasTotal;
        const effectiveTotalBua = Math.max(0, totalBua - dnttAlreadyPaid);
        const isBSMode = effectiveTotalBua <= 0;
        const soTien = isBSMode ? dnttBsAmount : (dnttModalMode === "full" ? effectiveTotalBua : dnttDepositAmount);
        const soTienConLai = isBSMode ? 0 : (dnttModalMode === "full" ? 0 : effectiveTotalBua - dnttDepositAmount);
        return (
          <Dialog open onOpenChange={(v) => { if (!v) setDnttModalKey(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">
                  {isBSMode ? "ĐNTT bổ sung" : dnttAlreadyPaid > 0 ? "ĐNTT còn lại" : "Tạo đề nghị TT"} — {nh?.ten}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-xs">
                {chietKhauModal > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Tổng bữa ăn (sau FOC): <span className="font-semibold text-foreground">{fmt(mainTotalModal + extrasTotal)} VND</span></p>
                    <p className="text-green-600">Chiết khấu {ckPctModal}%: <span className="font-semibold">−{fmt(chietKhauModal)} VND</span></p>
                    <p>Thực thanh toán: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
                  </div>
                ) : (
                  <p>Tổng bữa ăn: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
                )}
                {dnttAlreadyPaid > 0 && (
                  <>
                    <p>Đã thanh toán: <span className="font-semibold text-amber-600">- {fmt(dnttAlreadyPaid)} VND</span></p>
                    {!isBSMode && <p>Còn lại: <span className="font-semibold text-primary">{fmt(effectiveTotalBua)} VND</span></p>}
                  </>
                )}
                {extras.length > 0 && dnttAlreadyPaid === 0 && (
                  <p className="text-muted-foreground">
                    Gồm: {fmt(mainTotalModal)} VND (chính) + {fmt(extrasTotal)} VND (phát sinh)
                  </p>
                )}
                {isBSMode ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-amber-600">Đã thanh toán đủ — nhập số tiền bổ sung cần thanh toán thêm.</p>
                    <Label className="text-xs">Số tiền bổ sung</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={dnttBsAmount || ""}
                      onChange={(e) => setDnttBsAmount(Number(e.target.value) || 0)}
                      min={0}
                      placeholder="Nhập số tiền..."
                    />
                  </div>
                ) : (
                  <>
                    <RadioGroup
                      value={dnttModalMode}
                      onValueChange={(v) => setDnttModalMode(v as "full" | "deposit")}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="full" id="nh-full" />
                        <Label htmlFor="nh-full" className="text-xs cursor-pointer">
                          Toàn bộ — {fmt(effectiveTotalBua)} VND
                        </Label>
                      </div>
                      {dnttAlreadyPaid === 0 && (
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="deposit" id="nh-dep" />
                          <Label htmlFor="nh-dep" className="text-xs cursor-pointer">1 phần (cọc)</Label>
                        </div>
                      )}
                    </RadioGroup>
                    {dnttModalMode === "deposit" && dnttAlreadyPaid === 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Số tiền cọc</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={dnttDepositAmount || ""}
                          onChange={(e) => setDnttDepositAmount(Number(e.target.value) || 0)}
                          max={effectiveTotalBua}
                        />
                        {dnttDepositAmount > 0 && (
                          <p className="text-[11px] text-muted-foreground">Còn lại: {fmt(soTienConLai)} VND</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {/* Ngày cần thanh toán */}
                <div className="space-y-1">
                  <Label className="text-xs">Ngày cần thanh toán</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={dnttNgayCan}
                    onChange={(e) => setDnttNgayCan(e.target.value)}
                  />
                </div>
                <KSCongNoPanel
                  nccId={nh?.nha_cung_cap_id}
                  doanId={doanId}
                  value={canTruByMeal[dnttModalKey] ?? null}
                  onChange={(v) => setCanTruByMeal((prev) => ({ ...prev, [dnttModalKey]: v }))}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setDnttModalKey(null)}>
                  Hủy
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleDnttSubmit}
                  disabled={dnttSubmitting || soTien <= 0}
                >
                  Tạo đề nghị TT
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Adjustment Dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Số tiền thực tế</Label>
                <Input
                  className="h-8 text-sm"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập số tiền..."
                />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                return (
                  <div className={cn(
                    "rounded px-3 py-2 text-xs font-medium",
                    delta > 0 ? "bg-yellow-50 text-yellow-700" : "bg-purple-50 text-purple-700",
                  )}>
                    {delta > 0
                      ? `Thiếu ${fmt(delta)} ₫ → tạo ĐNTT bổ sung (chờ duyệt)`
                      : `Thừa ${fmt(Math.abs(delta))} ₫ → ghi công nợ NCC`
                    }
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do</Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="VD: Giảm số khách, thêm món..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={
                adjustMut.isPending ||
                !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                adjustMut.mutate(
                  { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh số lượng" },
                  {
                    onSuccess: (result) => {
                      if (!result) return;
                      if (result.delta > 0) {
                        toast.success(`Đã tạo ĐNTT bổ sung ${fmt(result.delta)} ₫`);
                      } else {
                        toast.success(`Đã ghi công nợ ${fmt(Math.abs(result.delta))} ₫`);
                      }
                      setAdjustTarget(null);
                    },
                    onError: (err: any) => toast.error("Lỗi: " + (err?.message || "")),
                  },
                );
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.isPaid ? "Hủy khoản thanh toán" : "Hủy đề nghị thanh toán"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">{cancelTarget?.nhName}</p>
            {cancelTarget?.isPaid ? (
              <RadioGroup
                value={cancelMode}
                onValueChange={(v) => setCancelMode(v as "cong_no" | "hoan_tien")}
                className="space-y-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="hoan_tien" id="nh-hoan" className="mt-0.5" />
                  <Label htmlFor="nh-hoan" className="text-xs cursor-pointer">
                    <span className="font-medium">Hoàn lại tiền</span>
                    <p className="text-muted-foreground font-normal">Không ghi nhận công nợ</p>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="cong_no" id="nh-cno" className="mt-0.5" />
                  <Label htmlFor="nh-cno" className="text-xs cursor-pointer">
                    <span className="font-medium">Cấn trừ công nợ</span>
                    <p className="text-muted-foreground font-normal">Ghi nhận công nợ cho nhà cung cấp</p>
                  </Label>
                </div>
              </RadioGroup>
            ) : (
              <p className="text-xs">Đề nghị sẽ bị hủy, chi phí trở về trạng thái chưa gửi duyệt.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={handleCancelSubmit}
              disabled={cancelMut.isPending}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NHInput({
  value, onChange, onBlur, width = "w-[72px]",
}: {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  width?: string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <Input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { onChange(Number(local) || 0); setTimeout(onBlur, 0); }}
      className={`h-7 text-xs ${width} text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
    />
  );
}

function ExtraRow({
  extra, onChange, onBlur, onDelete,
}: {
  extra: LocalNHExtra;
  onChange: (field: string, val: any) => void;
  onBlur: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Input
        placeholder="Dịch vụ phát sinh"
        value={extra.mo_ta}
        onChange={(e) => onChange("mo_ta", e.target.value)}
        onBlur={onBlur}
        className="h-6 text-xs flex-1 min-w-[100px]"
      />
      <span className="text-muted-foreground shrink-0">×</span>
      <Input
        type="number"
        placeholder="SL"
        value={extra.so_luong || ""}
        onChange={(e) => onChange("so_luong", Number(e.target.value) || 1)}
        onBlur={onBlur}
        className="h-6 text-xs w-[44px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <Input
        type="number"
        placeholder="Giá"
        value={extra.don_gia || ""}
        onChange={(e) => onChange("don_gia", Number(e.target.value) || 0)}
        onBlur={onBlur}
        className="h-6 text-xs w-[80px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-[70px] text-right">
        {fmt(extra.so_luong * extra.don_gia)}
      </span>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onDelete}>
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}
