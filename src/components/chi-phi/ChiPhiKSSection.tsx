import { useState, useEffect, useCallback, useRef } from "react";
import { format, getDay } from "date-fns";
import { Plus, ArrowRight, Ban, Printer, ChevronDown, ChevronRight, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAdjustment, useUpdateDNTT } from "@/hooks/use-dntt";
import type { DNTTRow } from "@/hooks/use-dntt";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useChiPhiKSData,
  useChiPhiList,
  useUpsertChiPhi,
  useDeleteChiPhi,
  useDNTTList,
  type ChiPhiRow,
} from "@/hooks/use-chi-phi";
import { useCancelDNTT } from "@/hooks/use-dntt";
import { Input } from "@/components/ui/input";
import { useCurrentUserName } from "@/hooks/use-doan";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import KSRowInput from "./KSRowInput";
import KSDNTTModal from "./KSDNTTModal";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { exportDNTTKSWordFromData, exportDNTTKSBatchWordFromData } from "@/lib/export-dntt-ks-word";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Tính giá trị FOC được miễn cho 1 KS (theo từng ngày)
// focKhach: cứ X phòng thì focMien phòng được miễn
// Tính tổng tiền FOC được miễn cho 1 KS (theo từng đêm riêng biệt)
// Chỉ tính FOC nếu tổng phòng trong 1 đêm đạt đủ ngưỡng focKhach
function calcFocDeduction(rows: LocalKSRow[], focKhach: number | null, focMien: number | null): number {
  if (!focKhach || !focMien || focKhach <= 0 || focMien <= 0) return 0;
  const byDay: Record<string, LocalKSRow[]> = {};
  rows.forEach((r) => { const k = r.ngay_date || ""; (byDay[k] = byDay[k] || []).push(r); });
  let deduction = 0;
  Object.values(byDay).forEach((dayRows) => {
    const dayRooms = dayRows.reduce((s, r) => s + (r.so_phong || 0), 0);
    if (dayRooms < focKhach) return; // chưa đủ ngưỡng đêm này
    const focPhong = Math.floor(dayRooms / focKhach) * focMien;
    const dayGross = dayRows.reduce((s, r) => s + (r.so_phong || 0) * (r.gia_phong || 0), 0);
    const avgPrice = dayRooms > 0 ? dayGross / dayRooms : 0;
    deduction += focPhong * avgPrice;
  });
  return Math.round(deduction);
}

function fmtDateDisplay(d: string) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet:     { text: "Chờ duyệt ĐNTT",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { text: "Đã duyệt ĐNTT",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { text: "Đã thanh toán",   cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { text: "Hoàn tiền",       cls: "bg-blue-100 text-blue-700" },
  cong_no:       { text: "Công nợ",         cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return dayNames[getDay(d)];
};

export interface LocalKSRow {
  id?: number;
  khach_san_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  loai_phong: string;
  so_phong: number;
  ci: string;
  co: string;
  so_dem: number;
  gia_phong: number;
  thanh_tien: number;
}

interface Props {
  doanId: number;
  soKhach?: number;
  tenDoan?: string;
}

export default function ChiPhiKSSection({ doanId, soKhach = 0, tenDoan = "" }: Props) {
  const { data: ksData, isLoading: ksLoading } = useChiPhiKSData(doanId);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const { data: currentUserName = "" } = useCurrentUserName();

  // Tracks which cards have been explicitly toggled by user
  const [toggledKsIds, setToggledKsIds] = useState<Set<number>>(new Set());
  const toggleCollapse = (ksId: number) =>
    setToggledKsIds((prev) => {
      const next = new Set(prev);
      next.has(ksId) ? next.delete(ksId) : next.add(ksId);
      return next;
    });
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [selectedKsIds, setSelectedKsIds] = useState<number[]>([]);

  const toggleSelectKs = (ksId: number) =>
    setSelectedKsIds((prev) => prev.includes(ksId) ? prev.filter((x) => x !== ksId) : [...prev, ksId]);

  const buildKSData = (ksId: number, dnttId: number) => {
    const dntt = dnttList.find((d) => d.id === dnttId);
    if (!dntt || !ksData) throw new Error("Thiếu dữ liệu ĐNTT hoặc khách sạn");

    const ks = ksData.khachSanMap[ksId];
    if (!ks) throw new Error("Không tìm thấy thông tin khách sạn");

    // Room entries from localRows for this KS — mỗi đêm 1 dòng
    const ksRows = localRowsRef.current.filter((r) => r.khach_san_id === ksId);

    // Lấy ngày từ ngayRows (nguồn chính xác) theo doan_ngay_id
    const ngayDateMap: Record<number, string> = {};
    (ksData.ngayRows as any[]).forEach((n: any) => {
      ngayDateMap[n.id] = n.ngay_date;
    });

    const roomEntries: { name: string; so_luong: number; don_gia: number; so_dem: number; ci: string; co: string }[] = ksRows.map((r) => {
      const ngayDate = ngayDateMap[r.doan_ngay_id] || r.ngay_date || r.ci || "";
      const coDate = ngayDate ? new Date(ngayDate + "T00:00:00") : null;
      if (coDate) coDate.setDate(coDate.getDate() + 1);
      const coStr = coDate
        ? `${coDate.getDate()}/${coDate.getMonth() + 1}/${coDate.getFullYear()}`
        : "";
      return {
        name: r.loai_phong || "Phòng KS",
        so_luong: r.so_phong,
        don_gia: r.gia_phong,
        so_dem: r.so_dem,
        ci: fmtDateDisplay(ngayDate),
        co: coStr,
      };
    });
    if (roomEntries.length === 0) roomEntries.push({ name: "—", so_luong: 1, don_gia: 0, so_dem: 1, ci: "", co: "" });

    // Dates (overall range)
    const ngayDates = ksRows.map((r) => ngayDateMap[r.doan_ngay_id] || r.ngay_date || r.ci || "").filter(Boolean).sort();
    const checkIn = fmtDateDisplay(ngayDates[0] || "");
    const lastDate = ngayDates[ngayDates.length - 1] || "";
    const lastCoDate = lastDate ? new Date(lastDate + "T00:00:00") : null;
    if (lastCoDate) lastCoDate.setDate(lastCoDate.getDate() + 1);
    const checkOut = lastCoDate
      ? `${lastCoDate.getDate()}/${lastCoDate.getMonth() + 1}/${lastCoDate.getFullYear()}`
      : "";
    const soDem = new Set(ngayDates).size || ksRows[0]?.so_dem || 1;

    // Code KS from ngayRows
    const ngayRow = (ksData.ngayRows as any[]).find((r) => r.khach_san_id === ksId);
    const codeKS = ngayRow?.ks_ma_code || "";

    // cocTotal: cọc đã thanh toán (da_tt) + cấn trừ công nợ đã duyệt (can_tru)
    const nccId = ks?.nha_cung_cap_id ?? null;
    const cocTotal = dnttList
      .filter((d) => {
        if (d.id === dnttId) return false;
        if (d.trang_thai_duyet === "da_huy" || d.trang_thai_duyet === "tu_choi") return false;
        if (!d.la_coc) return false;
        // Cọc đã thanh toán thực sự cho KS này
        if (d.trang_thai_thanh_toan === "da_tt" && d.ref_loai === "khach_san" && d.ref_id === ksId) return true;
        // Cấn trừ công nợ đã duyệt — ref_loai mới hoặc cũ
        if (d.trang_thai_thanh_toan === "can_tru" && d.trang_thai_duyet === "da_duyet") {
          if (d.ref_loai === "can_tru_cong_no" && nccId && d.nha_cung_cap_id === nccId) return true;
          if (d.ref_loai === "khach_san" && d.ref_id === ksId) return true;
        }
        return false;
      })
      .reduce((sum, d) => sum + d.so_tien, 0);

    const focDisplay =
      ks.foc_khach && ks.foc_mien ? `${ks.foc_khach}/${ks.foc_mien}` : "—";

    return {
      doan: { ten_doan: tenDoan || String(doanId), so_khach: soKhach },
      ks: { ten: ks.ten, foc_khach: ks.foc_khach ?? null, foc_mien: ks.foc_mien ?? null },
      ncc: ks.nha_cung_cap_id
        ? { ten: ks.ten_ncc || undefined, so_tai_khoan: ks.ncc_so_tai_khoan || undefined, ngan_hang: ks.ncc_ngan_hang || undefined }
        : null,
      checkIn,
      checkOut,
      codeKS,
      soDem,
      roomEntries,
      cocTotal,
      focDisplay,
      soTien: dntt.so_tien,
      la_coc: dntt.la_coc ?? false,
      nguoiDeNghi: currentUserName,
    };
  };

  const buildAndPrintKS = async (ksId: number, dnttId: number) => {
    const data = buildKSData(ksId, dnttId);
    await exportDNTTKSWordFromData(data);
  };

  const handlePrintSelected = async (activeDnttByKs: Record<number, number>) => {
    const pairs = selectedKsIds
      .map((ksId) => ({ ksId, dnttId: activeDnttByKs[ksId] }))
      .filter((p) => p.dnttId);
    if (pairs.length === 0) {
      toast.error("Các KS đã chọn chưa có ĐNTT nào");
      return;
    }
    setBatchPrinting(true);
    try {
      if (pairs.length === 1) {
        await buildAndPrintKS(pairs[0].ksId, pairs[0].dnttId);
      } else {
        const allData = pairs.map(({ ksId, dnttId }) => buildKSData(ksId, dnttId));
        await exportDNTTKSBatchWordFromData(allData, tenDoan || String(doanId), currentUserName);
      }
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    } finally {
      setBatchPrinting(false);
    }
  };

  // Cancel DNTT state
  const [cancelTarget, setCancelTarget] = useState<{
    type: "dntt" | "dich_vu"; // "dntt" = hủy khoản đề nghị, "dich_vu" = hủy toàn bộ dịch vụ
    ksId: number;
    ksName: string;
    paidDnttIds: number[];
    unpaidDnttIds: number[];
    paidTotal: number;
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

  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    try {
      if (cancelTarget.type === "dntt") {
        // Chỉ hủy các khoản chưa thanh toán — để tạo lại đề nghị mới
        for (const id of cancelTarget.unpaidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: undefined });
        }
        toast.success("Đã hủy đề nghị thanh toán");
      } else {
        // Hủy toàn bộ dịch vụ: unpaid trước, paid sau (paid cuối → chi_phi status đúng)
        for (const id of cancelTarget.unpaidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: undefined });
        }
        for (const id of cancelTarget.paidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: cancelMode });
        }
        // Xóa toggle để card tự collapse theo default (cong_no/hoan_tien → collapsed)
        const cancelledKsId = cancelTarget.ksId;
        setToggledKsIds((prev) => {
          const next = new Set(prev);
          next.delete(cancelledKsId);
          return next;
        });
        toast.success("Đã hủy dịch vụ khách sạn");
      }
      setCancelTarget(null);
    } catch (err: any) {
      toast.error("Lỗi khi hủy: " + (err?.message || ""));
    }
  };

  const storageKey = `chi_phi_ks_rows_${doanId}`;

  const [localRows, setLocalRows] = useState<LocalKSRow[]>(() => {
    try {
      const cached = sessionStorage.getItem(storageKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Ref to always have latest localRows for blur save (avoids stale closure)
  const localRowsRef = useRef(localRows);
  useEffect(() => {
    localRowsRef.current = localRows;
  }, [localRows]);

  // Persist localRows to sessionStorage on every change
  useEffect(() => {
    if (localRows.length > 0) {
      sessionStorage.setItem(storageKey, JSON.stringify(localRows));
    }
  }, [localRows, storageKey]);

  // Clear storage when doanId changes
  const prevDoanIdRef = useRef(doanId);
  useEffect(() => {
    if (prevDoanIdRef.current !== doanId) {
      sessionStorage.removeItem(`chi_phi_ks_rows_${prevDoanIdRef.current}`);
      prevDoanIdRef.current = doanId;
    }
  }, [doanId]);

  // ── FIX: Cleanup invalid/stale rows after ksData loads ──
  // Xóa rows có khach_san_id = 0 hoặc ngay_date rỗng khỏi localRows & sessionStorage
  // Đồng thời strip id của rows không còn tồn tại trong DB (bị xóa) để tránh FK violation
  useEffect(() => {
    if (!ksData || chiPhiRows.length === 0 && localRows.every((r) => !r.id)) return;

    const validKsIds = new Set(Object.keys(ksData.khachSanMap).map(Number));
    const validNgayIds = new Set((ksData.ngayRows || []).map((r: any) => r.id));
    const validChiPhiIds = new Set(chiPhiRows.map((r) => r.id).filter(Boolean));

    setLocalRows((prev) => {
      const cleaned = prev
        .filter(
          (r) =>
            r.khach_san_id > 0 &&
            validKsIds.has(r.khach_san_id) &&
            r.ngay_date !== "" &&
            r.ngay_date !== "unknown" &&
            (r.doan_ngay_id === 0 || validNgayIds.has(r.doan_ngay_id)),
        )
        .map((r) =>
          // Strip stale id nếu không còn trong DB — tránh FK violation khi tạo allocation
          r.id && !validChiPhiIds.has(r.id) ? { ...r, id: undefined } : r,
        );

      if (
        cleaned.length === prev.length &&
        cleaned.every((r, i) => r.id === prev[i]?.id)
      ) return prev; // no change

      // Rows rác đã bị lọc bỏ → cập nhật sessionStorage
      if (cleaned.length === 0) {
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, JSON.stringify(cleaned));
      }
      return cleaned;
    });
  }, [ksData, chiPhiRows, storageKey]);

  // Auto-xóa chi phí KS orphaned đã bị chuyển thành công nợ
  const autoDeletedKsIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!ksData || dnttList.length === 0) return;
    const orphanedIds: number[] = ksData.orphanedKsIds || [];
    for (const ksId of orphanedIds) {
      if (autoDeletedKsIdsRef.current.has(ksId)) continue;
      const hasCongNo = dnttList.some(
        (d) =>
          d.ref_loai === "khach_san" &&
          d.ref_id === ksId &&
          d.trang_thai_duyet === "da_huy" &&
          d.trang_thai_thanh_toan === "cong_no",
      );
      if (!hasCongNo) continue;
      autoDeletedKsIdsRef.current.add(ksId);
      const rowsToDelete = localRows.filter((r) => r.khach_san_id === ksId && r.id);
      for (const row of rowsToDelete) {
        deleteMut.mutate({ id: row.id!, doanId });
      }
      setLocalRows((prev) => prev.filter((r) => r.khach_san_id !== ksId));
    }
  }, [ksData, localRows, dnttList, doanId, deleteMut]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKsId, setModalKsId] = useState<number | null>(null);

  // Cấn trừ selection per ksId (controlled by KSCongNoPanel)
  const [canTruByKs, setCanTruByKs] = useState<Record<number, CanTruSelection | null>>({});

  // Định kỳ: track per ksId
  const [dinhKyKsIds, setDinhKyKsIds] = useState<Set<number>>(new Set());
  const dinhKyKsIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => { dinhKyKsIdsRef.current = dinhKyKsIds; }, [dinhKyKsIds]);

  // Only load from DB if no cached data exists
  useEffect(() => {
    if (!ksData || localRows.length > 0) return;
    const ksChiPhi = chiPhiRows.filter((c) => c.danh_muc === "khach_san");

    if (ksChiPhi.length === 0) return;

    const { ngayRows } = ksData;
    const ngayMap: Record<number, any> = {};
    ngayRows.forEach((r: any) => {
      ngayMap[r.id] = r;
    });

    const rows: LocalKSRow[] = ksChiPhi
      .map((cp) => {
        const ngay = ngayMap[cp.ref_doan_ngay_id!];
        // Bỏ qua rows không có ngay hoặc ngay không có khach_san_id hợp lệ
        if (!ngay || !ngay.khach_san_id) return null;

        const ci = ngay?.ngay_date || "";
        if (!ci) return null; // bỏ qua nếu không có ngày

        const coDate = new Date(ci);
        coDate.setDate(coDate.getDate() + 1);
        const co = format(coDate, "yyyy-MM-dd");

        return {
          id: cp.id,
          khach_san_id: ngay.khach_san_id,
          doan_ngay_id: cp.ref_doan_ngay_id || 0,
          ngay_date: ci,
          loai_phong: cp.mo_ta || "",
          so_phong: cp.so_luong || 1,
          ci,
          co,
          so_dem: 1,
          gia_phong: cp.don_gia || 0,
          thanh_tien: (cp.so_luong || 1) * (cp.don_gia || 0),
        } as LocalKSRow;
      })
      .filter((r): r is LocalKSRow => r !== null);

    if (rows.length > 0) setLocalRows(rows);

    // Khởi tạo dinhKyKsIds từ DB
    const dkIds = new Set<number>(
      ksChiPhi
        .filter((cp) => cp.thanh_toan_dinh_ky)
        .map((cp) => {
          const ngay = ngayMap[cp.ref_doan_ngay_id!];
          return ngay?.khach_san_id as number;
        })
        .filter(Boolean),
    );
    if (dkIds.size > 0) {
      setDinhKyKsIds(dkIds);
    }
  }, [ksData, chiPhiRows, localRows.length]);

  const handleToggleDinhKy = useCallback((ksId: number) => {
    setDinhKyKsIds((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(ksId);
      if (newVal) next.add(ksId); else next.delete(ksId);
      // Cập nhật tất cả chi phí rows của KS này trong DB
      const rowsForKs = localRowsRef.current.filter((r) => r.khach_san_id === ksId && r.id);
      rowsForKs.forEach((r) => {
        upsertMut.mutate({ id: r.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any);
      });
      return next;
    });
  }, [doanId, upsertMut]);

  const handleFieldChange = useCallback((idx: number, field: string, value: any) => {
    setLocalRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      row.thanh_tien = row.so_phong * row.gia_phong * row.so_dem;
      updated[idx] = row;
      return updated;
    });
  }, []);

  const handleBlurSave = useCallback(
    (idx: number) => {
      const row = localRowsRef.current[idx];
      if (!row) return;
      // Skip save if row is still empty (no room type and no price)
      if (!row.loai_phong && !row.gia_phong) return;
      console.log("handleBlurSave row:", idx, "gia_phong:", row.gia_phong, "so_phong:", row.so_phong);
      // Tính FOC per ngày để lưu tien_cong_ty = giá sau khi trừ FOC
      const sameKsDayRows = localRowsRef.current.filter(
        (r) => r.khach_san_id === row.khach_san_id && r.ngay_date === row.ngay_date,
      );
      const ksInfo = ksData?.khachSanMap[row.khach_san_id];
      const focKhach = ksInfo?.foc_khach ?? null;
      const focMien = ksInfo?.foc_mien ?? null;
      // Tổng phòng ngày này — chỉ tính FOC nếu đủ ngưỡng trong 1 đêm
      const dayTotalRooms = sameKsDayRows.reduce((s, r2) => s + (r2.so_phong || 0), 0);
      const dayFocPhong = (focKhach && focMien && focKhach > 0 && dayTotalRooms >= focKhach)
        ? Math.floor(dayTotalRooms / focKhach) * focMien
        : 0;
      const rowGross = row.thanh_tien; // so_phong * gia_phong * so_dem
      // Tiền FOC ngày này = số phòng miễn * giá bình quân cả ngày
      // Phân bổ cho row này theo tỉ lệ doanh thu
      const dayGross = sameKsDayRows.reduce(
        (s, r2) => s + (r2.so_phong || 0) * (r2.gia_phong || 0) * (r2.so_dem || 1), 0,
      );
      const avgPrice = dayTotalRooms > 0 ? dayGross / dayTotalRooms : 0;
      const dayFocAmount = dayFocPhong * avgPrice;
      const rowFocDeduction = dayGross > 0 && dayFocAmount > 0
        ? Math.round((rowGross / dayGross) * dayFocAmount)
        : 0;
      const tienCongTy = rowGross - rowFocDeduction;

      upsertMut.mutate(
        {
          id: row.id,
          doan_id: doanId,
          ngay_so: null,
          loai: "chi",
          danh_muc: "khach_san",
          ref_doan_ngay_id: row.doan_ngay_id,
          mo_ta: row.loai_phong || "Phòng KS",
          don_gia: row.gia_phong,
          so_luong: row.so_phong,
          tien_cong_ty: tienCongTy,
          tien_hdv: 0,
          thanh_toan_dinh_ky: dinhKyKsIdsRef.current.has(row.khach_san_id),
        },
        {
          onSuccess: (data) => {
            console.log("Saved row:", data, "gia_phong:", row.gia_phong);
            if (!row.id && data?.id) {
              setLocalRows((prev) => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], id: data.id };
                return updated;
              });
            }
          },
        },
      );
    },
    [doanId, upsertMut],
  );

  const handleDelete = useCallback(
    (idx: number) => {
      const row = localRows[idx];
      if (row.id) {
        deleteMut.mutate(
          { id: row.id, doanId },
          {
            onSuccess: () => {
              setLocalRows((prev) => prev.filter((_, i) => i !== idx));
            },
          },
        );
      } else {
        setLocalRows((prev) => prev.filter((_, i) => i !== idx));
      }
    },
    [localRows, doanId, deleteMut],
  );

  const handleAddRow = useCallback((ksId: number, doanNgayId: number, ngayDate: string) => {
    const coDate = new Date(ngayDate);
    coDate.setDate(coDate.getDate() + 1);
    const co = format(coDate, "yyyy-MM-dd");
    setLocalRows((prev) => [
      ...prev,
      {
        khach_san_id: ksId,
        doan_ngay_id: doanNgayId,
        ngay_date: ngayDate,
        loai_phong: "",
        so_phong: 1,
        ci: ngayDate,
        co,
        so_dem: 1,
        gia_phong: 0,
        thanh_tien: 0,
      },
    ]);
  }, []);

  if (ksLoading) return <div className="text-sm text-muted-foreground">Đang tải KS...</div>;

  const grouped: Record<number, LocalKSRow[]> = {};
  localRows.forEach((r) => {
    if (!grouped[r.khach_san_id]) grouped[r.khach_san_id] = [];
    grouped[r.khach_san_id].push(r);
  });

  const khachSanMap = ksData?.khachSanMap || {};
  const ngayRows = ksData?.ngayRows || [];
  const allKsEntries = Object.entries(grouped);

  // Compute deposit totals per KS from existing ĐNTT
  const cocByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (
      d.loai === "khach_san" &&
      d.ref_loai === "khach_san" &&
      d.ref_id &&
      d.trang_thai_duyet !== "da_huy" &&
      d.trang_thai_duyet !== "tu_choi"
    ) {
      cocByKs[d.ref_id] = (cocByKs[d.ref_id] || 0) + d.so_tien;
    }
  });

  // Tổng đã thanh toán thực sự (trang_thai_thanh_toan === "da_tt") per KS
  const ttByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (
      d.loai === "khach_san" &&
      d.ref_loai === "khach_san" &&
      d.ref_id &&
      d.trang_thai_thanh_toan === "da_tt"
    ) {
      ttByKs[d.ref_id] = (ttByKs[d.ref_id] || 0) + d.so_tien;
    }
  });

  // Chi phí thực tế per KS (sau điều chỉnh, tính từ doan_chi_phi)
  const thucTeByKs: Record<number, number> = {};
  chiPhiRows.forEach((r) => {
    if (r.danh_muc === "khach_san" && r.thanh_tien_thuc_te != null) {
      // Lấy khach_san_id từ localRows theo ref_doan_ngay_id
      const localRow = localRows.find((lr) => lr.id === r.id);
      if (localRow) {
        thucTeByKs[localRow.khach_san_id] =
          (thucTeByKs[localRow.khach_san_id] || 0) + r.thanh_tien_thuc_te;
      }
    }
  });

  // Tổng công nợ / hoàn tiền (đã hủy dịch vụ) per KS
  const congNoByKs: Record<number, number> = {};
  const hoanTienByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id && d.trang_thai_duyet === "da_huy") {
      if (d.trang_thai_thanh_toan === "cong_no") {
        congNoByKs[d.ref_id] = (congNoByKs[d.ref_id] || 0) + d.so_tien;
      } else if (d.trang_thai_thanh_toan === "hoan_tien") {
        hoanTienByKs[d.ref_id] = (hoanTienByKs[d.ref_id] || 0) + d.so_tien;
      }
    }
  });

  // Trạng thái KS tính thẳng từ dnttList — chính xác và cập nhật ngay khi dnttList thay đổi
  const getKsChiPhiStatus = (ksId: number): string => {
    const all = dnttList.filter((d) => d.ref_loai === "khach_san" && d.ref_id === ksId);
    if (all.length === 0) return "chua_de_nghi";

    // Đã hủy dịch vụ với xử lý tiền
    if (all.some((d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "cong_no"))
      return "cong_no";
    if (all.some((d) => d.trang_thai_duyet === "da_huy" && d.trang_thai_thanh_toan === "hoan_tien"))
      return "hoan_tien";

    // Các DNTT chưa hủy
    const nonHuy = all.filter((d) => d.trang_thai_duyet !== "da_huy");
    if (nonHuy.length === 0) return "chua_de_nghi";

    // Tất cả đã TT → da_thanh_toan
    if (nonHuy.every((d) => d.trang_thai_thanh_toan === "da_tt")) return "da_thanh_toan";

    // Có khoản đang xử lý — cho_duyet ưu tiên hơn da_duyet
    if (nonHuy.some((d) => d.trang_thai_duyet === "cho_duyet")) return "cho_duyet";
    if (nonHuy.some((d) => d.trang_thai_duyet === "da_duyet")) return "da_duyet";
    if (nonHuy.some((d) => d.trang_thai_duyet === "tu_choi")) return "tu_choi";
    return "chua_de_nghi";
  };

  // Danh sách KS từ doan_ngay + orphaned KS từ DNTT (đã xóa khỏi điều tour nhưng còn DNTT)
  const orphanedKsIds = ksData?.orphanedKsIds || [];
  const distinctKsIdsFromNgay = [
    ...new Set([
      ...ngayRows.map((r: any) => r.khach_san_id).filter(Boolean),
      ...orphanedKsIds,
    ]),
  ];

  // Map ksId → active DNTT id (for batch print)
  // Ưu tiên DNTT chưa TT (khoản mới nhất cần in), fallback sang đã TT
  const activeDnttByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        d.trang_thai_thanh_toan !== "da_tt") {
      activeDnttByKs[d.ref_id] = d.id; // unpaid = ưu tiên
    }
  });
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        !activeDnttByKs[d.ref_id]) {
      activeDnttByKs[d.ref_id] = d.id; // fallback: paid
    }
  });

  const allSelected = selectedKsIds.length === distinctKsIdsFromNgay.length && distinctKsIdsFromNgay.length > 0;
  const ksWithDnttSelected = selectedKsIds.filter((id) => activeDnttByKs[id]).length;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-900 px-3 py-1.5 rounded-md">
        🏨 Khách sạn
        <Badge variant="secondary" className="text-xs">
          Điều tour
        </Badge>
      </h3>

      {distinctKsIdsFromNgay.length === 0 && localRows.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có chi phí khách sạn.</p>
      )}

      {/* Toolbar select + print */}
      {distinctKsIdsFromNgay.length > 0 && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) =>
                v ? setSelectedKsIds([...distinctKsIdsFromNgay]) : setSelectedKsIds([])
              }
              id="select-all-ks"
            />
            <label htmlFor="select-all-ks" className="text-xs text-muted-foreground cursor-pointer select-none">
              {selectedKsIds.length > 0
                ? `Đã chọn ${selectedKsIds.length}/${distinctKsIdsFromNgay.length} KS`
                : "Chọn tất cả"}
            </label>
          </div>
          {selectedKsIds.length > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => handlePrintSelected(activeDnttByKs)}
                disabled={batchPrinting || ksWithDnttSelected === 0}
                title={ksWithDnttSelected === 0 ? "Không có KS nào đang có ĐNTT" : undefined}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                {batchPrinting ? "Đang xuất..." : `In ĐNTT KS${ksWithDnttSelected > 0 ? ` (${ksWithDnttSelected})` : ""}`}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKsIds([])}>
                Bỏ chọn
              </Button>
            </>
          )}
        </div>
      )}

      {/* Render từng KS có trong doan_ngay (không phụ thuộc localRows nữa) */}
      {distinctKsIdsFromNgay.map((ksId) => {
        const ks = khachSanMap[ksId];
        const rows = grouped[ksId] || [];
        const totalKSGross = rows.reduce((sum, r) => {
          return sum + (Number(r.so_phong) || 0) * (Number(r.gia_phong) || 0) * (Number(r.so_dem) || 1);
        }, 0);
        const focDeduction = calcFocDeduction(rows, ks?.foc_khach ?? null, ks?.foc_mien ?? null);
        const totalKS = totalKSGross - focDeduction;

        const focDisplay = ks?.foc_khach && ks?.foc_mien
          ? `FOC ${ks.foc_khach}免${ks.foc_mien}`
          : "";

        const daCoc = cocByKs[ksId] || 0;
        const daTT = ttByKs[ksId] || 0;
        // Dùng thucTeByKs nếu có điều chỉnh, ngược lại dùng totalKS từ room pricing
        const thucTeKS = thucTeByKs[ksId] ?? totalKS;
        const daDieuChinh = thucTeByKs[ksId] != null && thucTeByKs[ksId] !== totalKS;
        const conLai = thucTeKS - daCoc;
        const isDaTT = thucTeKS > 0 && daTT >= thucTeKS;
        const congNoAmount = congNoByKs[ksId] || 0;
        const hoanTienAmount = hoanTienByKs[ksId] || 0;
        const ksStatus = getKsChiPhiStatus(ksId);
        const ksStatusInfo = STATUS_LABEL[ksStatus] ?? STATUS_LABEL.chua_de_nghi;

        // DNTT active: ưu tiên khoản chưa TT (còn lại), fallback sang đã TT (cọc)
        const activeDntt =
          dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
            d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
            d.trang_thai_thanh_toan !== "da_tt") ??
          dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
            d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");

        // Tất cả DNTT có thể hủy cho KS này (kể cả nhiều khoản cọc + còn lại)
        const cancellableDntts = dnttList.filter(
          (d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
                 d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
                 (d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet" ||
                  d.trang_thai_thanh_toan === "da_tt"),
        );
        const paidDnttsForKs = cancellableDntts.filter((d) => d.trang_thai_thanh_toan === "da_tt");
        const unpaidDnttsForKs = cancellableDntts.filter((d) => d.trang_thai_thanh_toan !== "da_tt");
        const canCancelKs = cancellableDntts.length > 0;

        const byDay: Record<string, LocalKSRow[]> = {};
        rows.forEach((r) => {
          const key = r.ngay_date || "unknown";
          if (!byDay[key]) byDay[key] = [];
          byDay[key].push(r);
        });
        const dayEntries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));

        const ngayDateToNgaySo: Record<string, number> = {};
        const ngayDateToDoanNgayId: Record<string, number> = {};
        ngayRows.forEach((r: any) => {
          if (r.khach_san_id === ksId) {
            ngayDateToNgaySo[r.ngay_date] = r.ngay_so;
            ngayDateToDoanNgayId[r.ngay_date] = r.id;
          }
        });

        const isOrphaned = orphanedKsIds.includes(ksId); // không còn trong điều tour
        const isKsDinhKy = dinhKyKsIds.has(ksId);

        // Orphaned + công nợ → auto-xóa, ẩn luôn khỏi UI
        if (isOrphaned && ksStatus === "cong_no") return null;

        // KS còn trong điều tour dù đã có cong_no → coi như chi phí mới, không show annotation
        const effectiveKsStatus = (!isOrphaned && ksStatus === "cong_no") ? "chua_de_nghi" : ksStatus;

        // cong_no/hoan_tien: collapsed by default; others: expanded by default
        const defaultCollapsed = effectiveKsStatus === "cong_no" || effectiveKsStatus === "hoan_tien";
        const isCollapsed = toggledKsIds.has(ksId) ? !defaultCollapsed : defaultCollapsed;
        const showContent = !isCollapsed;

        return (
          <Card key={ksId} className={`border-border transition-colors ${selectedKsIds.includes(ksId) ? "border-primary/50 bg-primary/5" : ""}`}>
            <CardHeader className="py-1 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  <Checkbox
                    checked={selectedKsIds.includes(ksId)}
                    onCheckedChange={() => toggleSelectKs(ksId)}
                    className="shrink-0"
                  />
                  <button
                    className="flex items-center gap-2 flex-wrap text-left"
                    onClick={() => toggleCollapse(ksId)}
                  >
                    {ks?.ten || `KS #${ksId}`}
                    {ks?.dia_diem && <span className="text-muted-foreground font-normal text-xs">({ks.dia_diem})</span>}
                    {effectiveKsStatus === "cong_no" && congNoAmount > 0 && (
                      <span className="text-purple-600 font-semibold text-xs">
                        — Công nợ: {fmt(congNoAmount)} VND
                      </span>
                    )}
                    {effectiveKsStatus === "hoan_tien" && hoanTienAmount > 0 && (
                      <span className="text-blue-600 font-semibold text-xs">
                        — Hoàn tiền: {fmt(hoanTienAmount)} VND
                      </span>
                    )}
                  </button>
                </CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  {isKsDinhKy && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">Định kỳ</span>
                  )}
                  {totalKS > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {daDieuChinh
                        ? <><span className="line-through">{fmt(totalKS)}</span> <span className="text-blue-600 font-medium">{fmt(thucTeKS)} ₫</span></>
                        : <span className="font-medium text-foreground">{fmt(totalKS)} ₫</span>
                      }
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{focDisplay}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-6 text-[10px] px-2", isKsDinhKy ? "text-indigo-600 hover:text-indigo-700" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => handleToggleDinhKy(ksId)}
                    title={isKsDinhKy ? "Đang thanh toán định kỳ — bấm để bỏ" : "Đặt thanh toán định kỳ"}
                  >
                    {isKsDinhKy ? "⏱ Định kỳ" : "⏱"}
                  </Button>
                  <button onClick={() => toggleCollapse(ksId)} className="text-muted-foreground hover:text-foreground">
                    {showContent
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {ks?.ncc_so_tai_khoan && (
                <p className="text-xs text-muted-foreground mt-1">
                  STK: {ks.ncc_so_tai_khoan} · {ks.ncc_ngan_hang || "—"}
                  {ks.ten_ncc && <span> ({ks.ten_ncc})</span>}
                </p>
              )}
            </CardHeader>
            {showContent && <CardContent className="px-4 pb-1.5 pt-0">
              {isOrphaned && (
                <p className="text-xs text-muted-foreground italic mb-2">
                  Khách sạn đã được xóa khỏi lịch trình điều tour.
                </p>
              )}
              {!isOrphaned && <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-[120px] h-auto py-1 px-2">Loại phòng</TableHead>
                      <TableHead className="w-[60px] h-auto py-1 px-2">Số phòng</TableHead>
                      <TableHead className="w-[90px] h-auto py-1 px-2">C/I</TableHead>
                      <TableHead className="w-[90px] h-auto py-1 px-2">C/O</TableHead>
                      <TableHead className="w-[50px] h-auto py-1 px-2">Đêm</TableHead>
                      <TableHead className="w-[100px] h-auto py-1 px-2">Giá/phòng</TableHead>
                      <TableHead className="w-[110px] h-auto py-1 px-2">Thành tiền</TableHead>
                      <TableHead className="w-[32px] h-auto py-1 px-2" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayEntries.map(([dateStr, dayRows]) => {
                      const ngaySo = ngayDateToNgaySo[dateStr];
                      const doanNgayId = ngayDateToDoanNgayId[dateStr] || dayRows[0]?.doan_ngay_id;
                      return (
                        <DayGroup
                          key={dateStr}
                          dateStr={dateStr}
                          ngaySo={ngaySo}
                          dayRows={dayRows}
                          localRows={localRows}
                          onFieldChange={handleFieldChange}
                          onBlurSave={handleBlurSave}
                          onDelete={handleDelete}
                          onAddRow={() => handleAddRow(ksId, doanNgayId, dateStr)}
                        />
                      );
                    })}
                    {ngayRows
                      .filter((r: any) => r.khach_san_id === ksId && !byDay[r.ngay_date])
                      .map((r: any) => (
                        <EmptyDayHeader
                          key={r.ngay_date}
                          dateStr={r.ngay_date}
                          ngaySo={r.ngay_so}
                          onAddRow={() => handleAddRow(ksId, r.id, r.ngay_date)}
                        />
                      ))}
                  </TableBody>
                </Table>
              </div>}

              {/* ── Thanh toán section ── */}
              <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                {/* ĐNTT history list */}
                {(() => {
                  const allKsDntts = dnttList.filter(
                    (d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
                           d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
                           d.trang_thai_thanh_toan !== "can_tru" && d.trang_thai_thanh_toan !== "da_can_tru",
                  );
                  if (allKsDntts.length === 0) return null;
                  return (
                    <div className="rounded-md border border-border overflow-hidden">
                      {allKsDntts.map((dntt, i) => {
                        const isPaid = dntt.trang_thai_thanh_toan === "da_tt";
                        const isWaiting = dntt.trang_thai_duyet === "cho_duyet";
                        const isApproved = dntt.trang_thai_duyet === "da_duyet";
                        return (
                          <div
                            key={dntt.id}
                            className={cn(
                              "flex items-center justify-between px-3 py-1 text-xs",
                              i > 0 && "border-t border-border",
                              isPaid ? "bg-emerald-50/50" : "bg-muted/20",
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-muted-foreground font-mono">#{dntt.id}</span>
                              {isWaiting && editingDnttId === dntt.id ? (
                                <Input
                                  autoFocus
                                  type="number"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: dntt.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }
                                    if (e.key === "Escape") setEditingDnttId(null);
                                  }}
                                  className="h-6 w-28 text-xs px-2 py-0"
                                />
                              ) : (
                                <span className={cn(
                                  "font-semibold",
                                  isPaid ? "text-emerald-700" : "text-foreground",
                                )}>
                                  {fmt(dntt.so_tien)} ₫
                                </span>
                              )}
                              {dntt.la_coc && (
                                <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">Cọc</span>
                              )}
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                isPaid ? "bg-emerald-100 text-emerald-700"
                                  : isWaiting ? "bg-yellow-100 text-yellow-700"
                                  : isApproved ? "bg-teal-100 text-teal-700"
                                  : "bg-muted text-muted-foreground",
                              )}>
                                {isPaid ? "Đã TT" : isWaiting ? "Chờ duyệt" : isApproved ? "Đã duyệt" : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Sửa số tiền khi chờ duyệt */}
                              {isWaiting && editingDnttId === dntt.id ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700"
                                    disabled={updateDNTT.isPending}
                                    onClick={() => {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: dntt.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => setEditingDnttId(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {isWaiting && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                                      title="Sửa số tiền"
                                      onClick={() => {
                                        setEditingDnttId(dntt.id);
                                        setEditAmount(String(dntt.so_tien));
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {/* Điều chỉnh chỉ khi DNTT đó đã TT VÀ toàn bộ chi phí KS đã được thanh toán đủ */}
                                  {isPaid && isDaTT && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 text-blue-600 hover:text-blue-700"
                                      onClick={() => {
                                        setAdjustTarget(dntt as unknown as DNTTRow);
                                        setAdjustAmount(String(dntt.so_tien));
                                        setAdjustReason("");
                                      }}
                                    >
                                      <SlidersHorizontal className="h-3 w-3 mr-1" />
                                      Điều chỉnh
                                    </Button>
                                  )}
                                  {!isPaid && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setCancelTarget({
                                          type: "dntt",
                                          ksId,
                                          ksName: ks?.ten || `KS #${ksId}`,
                                          paidDnttIds: [],
                                          unpaidDnttIds: [dntt.id],
                                          paidTotal: 0,
                                        });
                                      }}
                                    >
                                      <Ban className="h-3 w-3 mr-1" />
                                      Hủy
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Cấn trừ + actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <KSCongNoPanel
                    nccId={ks?.nha_cung_cap_id}
                    doanId={doanId}
                    value={canTruByKs[ksId] ?? null}
                    onChange={(v) => setCanTruByKs((prev) => ({ ...prev, [ksId]: v }))}
                  />
                  <div className="flex items-center gap-2 ml-auto">
                    {paidDnttsForKs.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({
                            type: "dich_vu",
                            ksId,
                            ksName: ks?.ten || `KS #${ksId}`,
                            paidDnttIds: paidDnttsForKs.map((d) => d.id),
                            unpaidDnttIds: unpaidDnttsForKs.map((d) => d.id),
                            paidTotal: paidDnttsForKs.reduce((sum, d) => sum + d.so_tien, 0),
                          });
                        }}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Hủy dịch vụ
                      </Button>
                    )}
                    {/* Thanh toán định kỳ: ẩn nút ĐNTT, kế toán xử lý qua trang định kỳ */}
                    {isKsDinhKy && effectiveKsStatus === "chua_de_nghi" && (
                      <span className="text-[11px] text-indigo-500 italic">Thanh toán định kỳ</span>
                    )}
                    {/* Chưa có DNTT nào → nút tạo lần đầu */}
                    {!isKsDinhKy && effectiveKsStatus === "chua_de_nghi" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setModalKsId(ksId); setModalOpen(true); }}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Đề nghị TT
                      </Button>
                    )}
                    {/* Đã có DNTT → luôn cho phép tạo thêm (trừ khi đã hủy dịch vụ) */}
                    {!isKsDinhKy && effectiveKsStatus !== "chua_de_nghi" && effectiveKsStatus !== "cong_no" && effectiveKsStatus !== "hoan_tien" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setModalKsId(ksId); setModalOpen(true); }}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        {conLai > 0 ? `Đề nghị TT còn lại: ${fmt(conLai)} ₫` : "Đề nghị TT bổ sung"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>}
          </Card>
        );
      })}

      {/* ĐNTT Modal */}
      {modalOpen && modalKsId != null && (
        <KSDNTTModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalKsId(null);
          }}
          doanId={doanId}
          ksId={modalKsId}
          ksName={khachSanMap[modalKsId]?.ten || `KS #${modalKsId}`}
          nccId={khachSanMap[modalKsId]?.nha_cung_cap_id || null}
          nccTen={khachSanMap[modalKsId]?.ten_ncc || null}
          nccStk={khachSanMap[modalKsId]?.ncc_so_tai_khoan || null}
          nccNganHang={khachSanMap[modalKsId]?.ncc_ngan_hang || null}
          totalKS={(() => {
            const modalRows = grouped[modalKsId] || [];
            const modalKs = khachSanMap[modalKsId];
            const gross = modalRows.reduce(
              (s, r) => s + (Number(r.so_phong) || 0) * (Number(r.gia_phong) || 0) * (Number(r.so_dem) || 1), 0,
            );
            return gross - calcFocDeduction(modalRows, modalKs?.foc_khach ?? null, modalKs?.foc_mien ?? null);
          })()}
          daCoc={cocByKs[modalKsId] || 0}
          localRows={grouped[modalKsId] || []}
          chiPhiRowIds={(grouped[modalKsId] || []).filter((r) => r.id).map((r) => r.id!)}
          canTru={canTruByKs[modalKsId] ?? null}
          tenDoanMoi={tenDoan}
          serviceDate={(() => {
            const rows = grouped[modalKsId] || [];
            const dates = rows.map((r) => r.ngay_date).filter(Boolean).sort();
            return dates[0] || undefined;
          })()}
        />
      )}

      {/* Adjustment dialog */}
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
                <label className="text-xs font-medium">Số tiền thực tế</label>
                <input
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <label className="text-xs font-medium">Lý do</label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="VD: Đổi loại phòng, giảm số đêm..."
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

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.type === "dntt" ? "Hủy đề nghị thanh toán" : "Hủy sử dụng dịch vụ"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm font-medium">{cancelTarget?.ksName}</p>

            {cancelTarget?.type === "dntt" ? (
              /* Hủy ĐNTT: chỉ cancel khoản chưa TT để tạo lại */
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Hủy {cancelTarget.unpaidDnttIds.length} đề nghị thanh toán đang chờ xử lý.
                  Sau khi hủy, bạn có thể tạo đề nghị mới với số tiền chính xác hơn.
                </p>
                <p className="text-xs text-muted-foreground">
                  Các khoản đã thanh toán trước đó không bị ảnh hưởng.
                </p>
              </div>
            ) : (
              /* Hủy dịch vụ: cancel tất cả, hỏi xử lý tiền đã TT */
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs">
                  {cancelTarget && cancelTarget.paidTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đã thanh toán ({cancelTarget.paidDnttIds.length} khoản)</span>
                      <span className="font-semibold text-destructive">{fmt(cancelTarget.paidTotal)} VND</span>
                    </div>
                  )}
                  {cancelTarget && cancelTarget.unpaidDnttIds.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đề nghị chưa TT ({cancelTarget.unpaidDnttIds.length} khoản)</span>
                      <span className="text-muted-foreground">→ hủy đề nghị</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Xử lý {fmt(cancelTarget?.paidTotal ?? 0)} VND đã thanh toán:</p>
                  <RadioGroup value={cancelMode} onValueChange={(v) => setCancelMode(v as "cong_no" | "hoan_tien")} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="hoan_tien" id="ks-hoan" className="mt-0.5" />
                      <Label htmlFor="ks-hoan" className="text-xs cursor-pointer">
                        <span className="font-medium">Hoàn lại tiền</span>
                        <p className="text-muted-foreground font-normal">Nhà cung cấp trả lại tiền cho công ty</p>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="cong_no" id="ks-cno" className="mt-0.5" />
                      <Label htmlFor="ks-cno" className="text-xs cursor-pointer">
                        <span className="font-medium">Cấn trừ công nợ</span>
                        <p className="text-muted-foreground font-normal">Giữ lại làm công nợ, cấn trừ vào booking sau</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>Đóng</Button>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleCancelSubmit} disabled={cancelMut.isPending}>
              {cancelMut.isPending ? "Đang xử lý..." : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Day group header + rows ── */
function DayGroup({
  dateStr,
  ngaySo,
  dayRows,
  localRows,
  onFieldChange,
  onBlurSave,
  onDelete,
  onAddRow,
}: {
  dateStr: string;
  ngaySo?: number;
  dayRows: LocalKSRow[];
  localRows: LocalKSRow[];
  onFieldChange: (idx: number, field: string, value: any) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAddRow: () => void;
}) {
  const label =
    dateStr !== "unknown"
      ? `Ngày ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`
      : "Không xác định";

  return (
    <>
      <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
        <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium">
          {label}
        </TableCell>
        <TableCell className="py-1 px-2 text-right">
          <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={onAddRow}>
            <Plus className="h-3 w-3 mr-0.5" />
            Thêm
          </Button>
        </TableCell>
      </TableRow>
      {dayRows.map((row) => {
        const globalIdx = localRows.indexOf(row);
        return (
          <KSRowInput
            key={`${row.doan_ngay_id}-${globalIdx}`}
            row={row}
            globalIdx={globalIdx}
            onFieldChange={onFieldChange}
            onBlurSave={onBlurSave}
            onDelete={onDelete}
          />
        );
      })}
    </>
  );
}

/* ── Empty day header ── */
function EmptyDayHeader({ dateStr, ngaySo, onAddRow }: { dateStr: string; ngaySo?: number; onAddRow: () => void }) {
  const label = `Ngày ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`;
  return (
    <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
      <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium">
        {label}
      </TableCell>
      <TableCell className="py-1 px-2 text-right">
        <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={onAddRow}>
          <Plus className="h-3 w-3 mr-0.5" />
          Thêm
        </Button>
      </TableCell>
    </TableRow>
  );
}
