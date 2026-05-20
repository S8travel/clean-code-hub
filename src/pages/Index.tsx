import { useState, useMemo } from "react";
import { t, useTranslate } from "@/lib/i18n";
import { useDoanListFilters } from "@/hooks/use-doan-list-filters";
import { Plus, Search, X, ChevronLeft, ChevronRight, CalendarClock, Bus, Activity, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DoanTable } from "@/components/DoanTable";
import { DoanDrawer } from "@/components/DoanDrawer";
import { PhanViecModal } from "@/components/doan/PhanViecModal";
import { useDoanOpMap, useCreatePhanViec, type PvKey } from "@/hooks/use-phan-viec";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useDoanList,
  useDoanRealtime,
  useCreateDoan,
  useUpdateDoan,
  useDeleteDoan,
  useCancelDoan,
  useAgents,
  useDiaDiem,
  useUserRoles,
  useDoanQuyetToanPaidSet,
  THI_TRUONG_OPTS,
  // useAddDoanPermission, // FEATURE_DOAN_PERM_DISABLED
} from "@/hooks/use-doan";
import { computeDoanStatus, type DoanStatus } from "@/lib/doan-status";
import type { DoanInsert } from "@/hooks/use-doan";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { externalSupabase } from "@/lib/supabase-external";
import { useApplySeriToDoan } from "@/hooks/use-seri";
import { useUploadDoanTaiLieu } from "@/hooks/use-doan-tai-lieu";
import { useLogActivity } from "@/hooks/use-activity-log";
import { useAuth } from "@/hooks/use-auth";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const TRANG_THAI_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "dang_chay", label: "Chờ xác nhận" },
  { value: "hoan_thanh", label: "Hoàn thành" },
  { value: "da_quyet_toan", label: "Đã quyết toán" },
  { value: "huy", label: "Đã hủy" },
];

const LOAI_TOUR_OPTIONS = [
  { value: "all", label: "Tất cả tuyến" },
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "noi_dia", label: "Nội địa" },
];

export default function Index() {
  useTranslate(); // re-render khi đổi ngôn ngữ
  const { user: currentUser } = useAuth();
  const phanLoaiTour = (currentUser?.role !== "admin" && currentUser?.role !== "giam_doc")
    ? (currentUser?.phan_loai_tour ?? null)
    : null;
  const { data: groups, isLoading, error } = useDoanList(phanLoaiTour);
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  useDoanRealtime();
  const createDoan = useCreateDoan();
  const uploadTaiLieu = useUploadDoanTaiLieu();
  const updateDoan = useUpdateDoan();
  const deleteDoan = useDeleteDoan();
  const cancelDoan = useCancelDoan();
  // const addPerm = useAddDoanPermission(); // FEATURE_DOAN_PERM_DISABLED
  const applySeri = useApplySeriToDoan();
  const logActivity = useLogActivity();
  const { data: agents } = useAgents();
  const { data: diaDiemList } = useDiaDiem();
  const { data: userRoles } = useUserRoles();
  const { data: doanOpMap } = useDoanOpMap((groups ?? []).map((g: any) => g.id));

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDoan, setEditingDoan] = useState<any | null>(null);
  const [deletingDoan, setDeletingDoan] = useState<any | null>(null);
  const [cancelingDoan, setCancelingDoan] = useState<any | null>(null);
  const [pendingCreate, setPendingCreate] = useState<DoanInsert | null>(null);
  const [pendingPhanViec, setPendingPhanViec] = useState<
    { payload: DoanInsert; info: { code: string; agent: string; diaDiem: string; soKhach: number | null; ngayDi: string | null; ngayVe: string | null; loaiTour: string | null } } | null
  >(null);
  const createPhanViec = useCreatePhanViec();
  const [quickTab, setQuickTab] = useState<
    "all" | "dang_chay" | "sap_khoi_hanh" | "dang_dien_ra" | "hoan_thanh" | "da_quyet_toan" | "huy"
  >("all");
  const [pageSize, setPageSize] = useState(5);

  // Filters + sort + pagination — persist qua URL params + sessionStorage
  const filterState = useDoanListFilters();
  const search = filterState.get("search");
  const dateFrom = filterState.get("dateFrom");
  const dateTo = filterState.get("dateTo");
  const agentFilter = filterState.get("agentFilter");
  const diaDiemFilter = filterState.get("diaDiemFilter");
  const trangThaiFilter = filterState.get("trangThaiFilter");
  const loaiTourFilter = filterState.get("loaiTourFilter");
  const page = parseInt(filterState.get("page"), 10) || 1;
  const sortKey = filterState.get("sortKey");
  const sortDir = filterState.get("sortDir") as "asc" | "desc";

  // Setter helpers — đổi filter sẽ auto reset page về 1
  const setSearch = (v: string) => filterState.set({ search: v, page: "1" });
  const setDateFrom = (v: string) => filterState.set({ dateFrom: v, page: "1" });
  const setDateTo = (v: string) => filterState.set({ dateTo: v, page: "1" });
  const setAgentFilter = (v: string) => filterState.set({ agentFilter: v, page: "1" });
  const setDiaDiemFilter = (v: string) => filterState.set({ diaDiemFilter: v, page: "1" });
  const setTrangThaiFilter = (v: string) => filterState.set({ trangThaiFilter: v, page: "1" });
  const setLoaiTourFilter = (v: string) => filterState.set({ loaiTourFilter: v, page: "1" });
  const setPage = (v: number) => filterState.set({ page: String(v) });
  const setSort = (k: string, d: "asc" | "desc") => filterState.set({ sortKey: k, sortDir: d });

  // Build user_roles map: user_id → ho_ten
  const userRolesMap = useMemo(() => {
    const map = new Map<string, string>();
    userRoles?.forEach((u) => map.set(u.user_id, u.ho_ten));
    return map;
  }, [userRoles]);

  const hasFilters = search || dateFrom || dateTo || agentFilter !== "all" || diaDiemFilter !== "all" || trangThaiFilter !== "all" || loaiTourFilter !== "all";

  const clearFilters = () => {
    filterState.clear();
    setQuickTab("all");
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const today3Str = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const curYM = todayStr.slice(0, 7);
  const gCat = (g: any) => {
    const status = computeDoanStatus(g, qtPaidSet ?? null);
    const di = g.ngay_di as string | null;
    const ve = g.ngay_ve as string | null;
    const sapKhoiHanh = status === "dang_chay" && !!di && di >= todayStr && di <= today3Str;
    const dangDienRa = status === "dang_chay" && !!di && !!ve && di <= todayStr && ve >= todayStr;
    const hoanThanhThang =
      (status === "hoan_thanh" || status === "da_quyet_toan") && !!ve && ve.slice(0, 7) === curYM;
    return { status, sapKhoiHanh, dangDienRa, hoanThanhThang };
  };
  const stats = useMemo(() => {
    const s = { total: 0, dangChay: 0, sapKhoiHanh: 0, dangDienRa: 0, hoanThanh: 0, daQuyetToan: 0, hoanThanhThang: 0, huy: 0 };
    for (const g of groups ?? []) {
      s.total++;
      const c = gCat(g);
      if (c.status === "dang_chay") s.dangChay++;
      if (c.status === "huy") s.huy++;
      if (c.status === "hoan_thanh") s.hoanThanh++;
      if (c.status === "da_quyet_toan") s.daQuyetToan++;
      if (c.sapKhoiHanh) s.sapKhoiHanh++;
      if (c.dangDienRa) s.dangDienRa++;
      if (c.hoanThanhThang) s.hoanThanhThang++;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, qtPaidSet, todayStr, today3Str, curYM]);

  const filtered = useMemo(() => {
    if (!groups) return [];
    return groups.filter((g: any) => {
      if (search) {
        const q = search.toLowerCase();
        const opName = doanOpMap?.get(g.id)?.ten || "";
        const match =
          g.ten_doan?.toLowerCase().includes(q) ||
          g.huong_dan_vien?.ten?.toLowerCase().includes(q) ||
          g.agents?.ten?.toLowerCase().includes(q) ||
          opName.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Date range on ngay_di (ngày đón)
      if (dateFrom && g.ngay_di) { if (g.ngay_di < dateFrom) return false; }
      if (dateTo && g.ngay_di) { if (g.ngay_di > dateTo) return false; }
      if ((dateFrom || dateTo) && !g.ngay_di) return false;

      if (agentFilter !== "all" && g.agent_id?.toString() !== agentFilter) return false;
      if (diaDiemFilter !== "all" && g.dia_diem_id?.toString() !== diaDiemFilter) return false;
      if (loaiTourFilter !== "all" && (g.loai_tour ?? null) !== loaiTourFilter) return false;

      if (trangThaiFilter !== "all") {
        const status = computeDoanStatus(g, qtPaidSet ?? null);
        if (status !== (trangThaiFilter as DoanStatus)) return false;
      }

      if (quickTab !== "all") {
        const c = gCat(g);
        if (quickTab === "dang_chay" && c.status !== "dang_chay") return false;
        if (quickTab === "huy" && c.status !== "huy") return false;
        if (quickTab === "hoan_thanh" && c.status !== "hoan_thanh") return false;
        if (quickTab === "da_quyet_toan" && c.status !== "da_quyet_toan") return false;
        if (quickTab === "sap_khoi_hanh" && !c.sapKhoiHanh) return false;
        if (quickTab === "dang_dien_ra" && !c.dangDienRa) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, search, dateFrom, dateTo, agentFilter, diaDiemFilter, trangThaiFilter, loaiTourFilter, doanOpMap, qtPaidSet, quickTab]);

  // Page reset đã tích hợp trong setSearch/setDateFrom/... helpers ở trên

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const showFrom = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, filtered.length);

  const handleSave = async (data: DoanInsert) => {
    try {
      if (editingDoan) {
        const result = await updateDoan.mutateAsync({ id: editingDoan.id, ...data });
        // HYBRID: cảnh báo nếu cascade so_khach đã reset adjustment cũ trên N chi phí
        const x = (result as any)?.thucTeClearCount ?? 0;
        if (x > 0) {
          toast.warning(
            `Đã đồng bộ ${x} chi phí theo số khách mới. Adjustment cũ (nếu có) đã reset.`,
            { duration: 6000 }
          );
        }
        const aff = (result as any)?.committedDnttAffected ?? 0;
        if (aff > 0) {
          toast.warning(
            `${aff} chi phí có DNTT chờ duyệt/đã duyệt vừa cập nhật theo số khách mới. ` +
            `DNTT cũ chưa khớp số tiền — vào tab Chi phí sửa DNTT.so_tien hoặc hủy & tạo lại.`,
            { duration: 10000 }
          );
        }
        // FEATURE_DOAN_PERM_DISABLED: auto-grant khi sửa assigned_to
        // if (data.assigned_to && data.assigned_to !== editingDoan.assigned_to) {
        //   const assigneeName = userRolesMap.get(data.assigned_to) || "";
        //   try {
        //     await addPerm.mutateAsync({ doan_id: editingDoan.id, user_id: data.assigned_to, ho_ten: assigneeName, quyen: "admin" });
        //   } catch { /* ignore if permission already exists */ }
        // }
        logActivity.mutate({ action: "sua", table_name: "doan", record_id: editingDoan.id, mo_ta: `Sửa đoàn ${data.ten_doan ?? editingDoan.ten_doan}` });
        // Áp dụng seri mới nếu user vừa chọn seri khác. DoanDrawer đã pre-check conflict,
        // nên ở đây chắc chắn đoàn không có lịch trình / booking / chi phí.
        if (data.seri_id && data.seri_id !== editingDoan.seri_id && data.ngay_di) {
          try {
            await applySeri.mutateAsync({
              doanId: editingDoan.id,
              seriId: data.seri_id,
              ngayDi: data.ngay_di,
            });
            toast.success("Đã áp dụng seri mới");
          } catch (err: any) {
            toast.error("Lỗi áp dụng seri: " + (err?.message || ""));
          }
        }
        toast.success("Đã cập nhật đoàn");
      } else {
        const markets = currentUser?.phan_loai_tour ?? null;
        if (markets && markets.length > 1) {
          setPendingCreate({ ...data, shopping: false, van_phong_id: currentUser?.van_phong_id ?? null });
          return;
        }
        const thi_truong = markets && markets.length === 1 ? markets[0] : null;
        // KHÔNG tạo đoàn ngay — chỉ tạo sau khi xác nhận phân việc
        setDrawerOpen(false);
        setEditingDoan(null);
        openPhanViec({ ...data, shopping: false, van_phong_id: currentUser?.van_phong_id ?? null, thi_truong });
        return;
      }
      setDrawerOpen(false);
      setEditingDoan(null);
    } catch {
      toast.error("Có lỗi xảy ra");
    }
  };

  // Mở modal phân việc (chưa tạo đoàn) — đoàn chỉ tạo khi xác nhận
  const openPhanViec = (payload: DoanInsert) => {
    const agent = (agents ?? []).find((a: any) => a.id === payload.agent_id)?.ten ?? "—";
    const diaDiem = (diaDiemList ?? []).find((d: any) => d.id === payload.dia_diem_id)?.ten ?? "—";
    const soKhach =
      (payload.so_khach_lon ?? 0) + (payload.so_khach_em1 ?? 0) +
      (payload.so_khach_em2 ?? 0) + (payload.so_khach_tl ?? 0) ||
      (payload as any).so_khach || null;
    setPendingPhanViec({
      payload,
      info: {
        code: payload.ten_doan, agent, diaDiem, soKhach,
        ngayDi: payload.ngay_di ?? null,
        ngayVe: (payload as any).ngay_ve ?? null,
        loaiTour: (payload as any).loai_tour ?? null,
      },
    });
  };

  // Xác nhận phân việc → MỚI tạo đoàn → seri/log → phân việc + thông báo
  const confirmPhanViec = async (
    assignments: { key: PvKey; assignedTo: string | null }[],
    baoGiaFile: File | null,
  ) => {
    if (!pendingPhanViec) return;
    const p = { ...pendingPhanViec.payload } as any;
    try {
      const created = await createDoan.mutateAsync(p);
      if (created) {
        logActivity.mutate({ action: "tao", table_name: "doan", record_id: created.id, mo_ta: `Tạo đoàn ${p.ten_doan}` });
        if (baoGiaFile) {
          // Lưu báo giá vào Tài liệu của đoàn (mục Báo giá) — liên kết với tab Tài liệu DoanDetail
          try {
            await uploadTaiLieu.mutateAsync({
              doanId: created.id,
              loai: "bao_gia",
              file: baoGiaFile,
              uploadedBy: currentUser?.user_id ?? null,
            });
          } catch (upErr: any) {
            toast.warning("Đoàn đã tạo nhưng tải báo giá thất bại: " + (upErr?.message ?? ""));
          }
        }
        if (p.seri_id && p.ngay_di) {
          try { await applySeri.mutateAsync({ doanId: created.id, seriId: p.seri_id, ngayDi: p.ngay_di }); }
          catch { /* non-fatal */ }
        }
        await createPhanViec.mutateAsync({
          doan: { id: created.id, ten_doan: p.ten_doan, loai_tour: (p as any).loai_tour ?? null, ngay_di: p.ngay_di ?? null },
          creatorId: currentUser?.user_id ?? "",
          creatorName: currentUser?.ho_ten ?? "",
          assignments,
        });
        toast.success(`✓ Tạo đoàn & phân việc: ${p.ten_doan}`);
      }
      setPendingPhanViec(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi tạo đoàn / phân việc");
    }
  };

  const checkDoanCancelable = async (doanId: number): Promise<string[]> => {
    const [ks, nh, dv, dntt] = await Promise.all([
      externalSupabase.from("doan_booking_ks").select("ks_dat_truoc_status, ks_final_status").eq("doan_id", doanId),
      // NH: gồm cả nh_xac_nhan (đã xác nhận) — chỉ chua_gui/da_huy/cho_xac_nhan_huy/khong_dat mới cho xóa
      externalSupabase.from("doan_booking_nh").select("id").eq("doan_id", doanId).in("booking_status", ["da_gui", "nh_xac_nhan"]),
      externalSupabase.from("doan_booking_dv").select("id").eq("doan_id", doanId).in("booking_status", ["cho_xac_nhan", "da_xac_nhan"]),
      externalSupabase.from("de_nghi_thanh_toan").select("id").eq("doan_id", doanId).not("trang_thai_duyet", "in", '("tu_choi","da_huy")'),
    ]);
    const errors: string[] = [];
    // KS: chỉ block nếu booking đã được GỬI (status != chua_gui) và chưa hủy.
    //   - `chua_gui` = chưa gửi mail → không có cam kết bên ngoài → cho xóa.
    //   - cancelled = đã hủy → cho xóa.
    //   - Final là phase quyết định: nếu Final đã/đang hủy → toàn booking coi như cancelled,
    //     bất kể ks_dat_truoc_status (đặt trước có thể vẫn ở ks_xac_nhan trước khi user
    //     chuyển sang Final rồi hủy). Đồng bộ với use-dieu-tour.checkKhachSanDeletable.
    const isKsCancelled = (r: any) => {
      const cancelStates = ["cho_ks_xac_nhan_huy", "ks_xac_nhan_huy"];
      if (r.ks_final_status) return cancelStates.includes(r.ks_final_status);
      return cancelStates.includes(r.ks_dat_truoc_status);
    };
    const isKsSent = (r: any) =>
      (r.ks_dat_truoc_status && r.ks_dat_truoc_status !== "chua_gui") ||
      (r.ks_final_status && r.ks_final_status !== "chua_gui");
    const activeKS = (ks.data ?? []).filter((r: any) => !isKsCancelled(r) && isKsSent(r)).length;
    if (activeKS > 0) errors.push(`Booking KS: còn ${activeKS} khách sạn đã gửi mail chưa hủy`);
    if ((nh.data ?? []).length > 0) errors.push(`Booking NH: còn ${nh.data!.length} bữa chưa hủy`);
    if ((dv.data ?? []).length > 0) errors.push(`Booking DV: còn ${dv.data!.length} dịch vụ chưa hủy`);
    if ((dntt.data ?? []).length > 0) errors.push(`ĐNTT: còn ${dntt.data!.length} phiếu chưa hủy`);
    return errors;
  };

  const handleOpenCancel = async (doan: any) => {
    const errors = await checkDoanCancelable(doan.id);
    if (errors.length > 0) {
      toast.error("Không thể hủy đoàn", { description: errors.join(" · ") });
      return;
    }
    setCancelingDoan(doan);
  };

  const handleOpenDelete = async (doan: any) => {
    const errors = await checkDoanCancelable(doan.id);
    if (errors.length > 0) {
      toast.error("Không thể xóa đoàn", { description: errors.join(" · ") });
      return;
    }
    setDeletingDoan(doan);
  };

  const handleDelete = async () => {
    if (!deletingDoan) return;
    try {
      const name = deletingDoan.ten_doan;
      await deleteDoan.mutateAsync(deletingDoan.id);
      logActivity.mutate({ action: "xoa", table_name: "doan", record_id: deletingDoan.id, mo_ta: `Xóa đoàn ${name}` });
      toast.success("Đã xoá đoàn");
      setDeletingDoan(null);
    } catch {
      toast.error("Xoá thất bại");
    }
  };

  const handleCancel = async () => {
    if (!cancelingDoan) return;
    try {
      await cancelDoan.mutateAsync(cancelingDoan.id);
      toast.success("Đã hủy đoàn");
      setCancelingDoan(null);
    } catch {
      toast.error("Hủy đoàn thất bại");
    }
  };

  const handleClone = async (doan: any) => {
    try {
      const payload: DoanInsert = {
        ten_doan: doan.ten_doan + " - bản sao",
        agent_id: doan.agent_id,
        dia_diem_id: doan.dia_diem_id,
        huong_dan_vien_id: doan.huong_dan_vien_id,
        xe_id: doan.xe_id,
        seri_id: doan.seri_id,
        so_khach: doan.so_khach,
        so_khach_lon: doan.so_khach_lon,
        so_khach_em1: doan.so_khach_em1,
        so_khach_em2: doan.so_khach_em2,
        so_khach_tl: doan.so_khach_tl,
        ngay_di: doan.ngay_di,
        ngay_ve: doan.ngay_ve,
        chuyen_bay_don: doan.chuyen_bay_don,
        chuyen_bay_tien: doan.chuyen_bay_tien,
        assigned_to: doan.assigned_to,
        ghi_chu: doan.ghi_chu,
        trang_thai: "dang_chay",
        shopping: doan.shopping ?? false,
      };
      const created = await createDoan.mutateAsync(payload);
      if (created) {
        logActivity.mutate({ action: "tao", table_name: "doan", record_id: created.id, mo_ta: `Nhân bản đoàn ${doan.ten_doan}` });
      }
      toast.success("Đã nhân bản đoàn");
    } catch {
      toast.error("Nhân bản thất bại");
    }
  };

  const openNew = () => {
    setEditingDoan(null);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 py-6">

        {/* TOOLBAR */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold notranslate">{t("Quản lý đoàn")}</h1>
            <Badge variant="secondary" className="text-xs tabular-nums">{filtered.length}</Badge>
          </div>
          <Button onClick={openNew} className="active:scale-[0.98] transition-transform shrink-0"
            style={{ backgroundColor: "hsl(213, 78%, 37%)" }}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t("Tạo đoàn mới")}
          </Button>
        </div>

        {/* DASHBOARD: thẻ thống kê */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {([
            { key: "sap_khoi_hanh", label: "Sắp khởi hành", sub: "trong 3 ngày tới", n: stats.sapKhoiHanh, icon: CalendarClock, tile: "bg-amber-500" },
            { key: "dang_dien_ra", label: "Đang diễn ra", sub: "đang trong hành trình", n: stats.dangDienRa, icon: Bus, tile: "bg-blue-500" },
            { key: "dang_chay", label: "Chờ xác nhận", sub: "tổng đoàn hoạt động", n: stats.dangChay, icon: Activity, tile: "bg-emerald-500" },
            { key: "hoan_thanh", label: "Hoàn thành", sub: "trong tháng này", n: stats.hoanThanhThang, icon: CheckCircle2, tile: "bg-teal-500" },
          ] as const).map((c) => (
            <button
              key={c.key}
              onClick={() => { setQuickTab((t) => (t === c.key ? "all" : c.key)); setPage(1); }}
              className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-shadow hover:shadow-md ${quickTab === c.key ? "ring-2 ring-primary/50" : ""}`}
            >
              <div className={`h-10 w-10 rounded-xl grid place-items-center text-white shrink-0 ${c.tile}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight">{c.n}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{t(c.label)} · {t(c.sub)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* DASHBOARD: tabs lọc nhanh */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {([
            { key: "all", label: "Tất cả", n: stats.total },
            { key: "dang_chay", label: "Chờ xác nhận", n: stats.dangChay },
            { key: "sap_khoi_hanh", label: "Sắp khởi hành", n: stats.sapKhoiHanh },
            { key: "dang_dien_ra", label: "Đang diễn ra", n: stats.dangDienRa },
            { key: "hoan_thanh", label: "Hoàn thành", n: stats.hoanThanh },
            { key: "da_quyet_toan", label: "Đã quyết toán", n: stats.daQuyetToan },
            { key: "huy", label: "Đã huỷ", n: stats.huy },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setQuickTab(tab.key); setPage(1); }}
              className={`h-8 px-3 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${quickTab === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50 border-border"}`}
            >
              {t(tab.label)}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold ${quickTab === tab.key ? "bg-white/25" : "bg-muted"}`}>
                {tab.n}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {t("Không thể tải dữ liệu. Kiểm tra kết nối và thử lại.")}
          </div>
        )}

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Tìm code, HDV, agent, OP...")}
              className="pl-9 h-9 text-sm rounded-lg" />
          </div>

          <div className="flex items-center gap-1.5">
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={t("Từ ngày")} className="h-9 text-xs rounded-lg w-[145px]" align="start" />
            <span className="text-muted-foreground text-xs">→</span>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder={t("Đến ngày")} className="h-9 text-xs rounded-lg w-[145px]" align="start" />
          </div>

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[140px]">
              <span>{agentFilter === "all" ? t("Tất cả Agent") : agents?.find((a) => a.id.toString() === agentFilter)?.ten ?? "Agent"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả Agent")}</SelectItem>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.ten}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={diaDiemFilter} onValueChange={setDiaDiemFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[140px]">
              <span>{diaDiemFilter === "all" ? t("Tất cả ĐĐ") : diaDiemList?.find((d) => d.id.toString() === diaDiemFilter)?.ten ?? "Địa điểm"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả ĐĐ")}</SelectItem>
              {diaDiemList?.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.ten}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={loaiTourFilter} onValueChange={setLoaiTourFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[130px]">
              <span>{t(LOAI_TOUR_OPTIONS.find((o) => o.value === loaiTourFilter)?.label ?? "Loại tuyến")}</span>
            </SelectTrigger>
            <SelectContent>
              {LOAI_TOUR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={trangThaiFilter} onValueChange={setTrangThaiFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[130px]">
              <span>{t(TRANG_THAI_OPTIONS.find((o) => o.value === trangThaiFilter)?.label ?? "Trạng thái")}</span>
            </SelectTrigger>
            <SelectContent>
              {TRANG_THAI_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5 mr-1" />
              {t("Xoá lọc")}
            </Button>
          )}
        </div>

        {/* TABLE */}
        <div className="rounded-xl bg-card shadow-card overflow-hidden">
          <DoanTable
            groups={paged}
            isLoading={isLoading}
            userRolesMap={userRolesMap}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={setSort}
            onEdit={(doan) => { setEditingDoan(doan); setDrawerOpen(true); }}
            onClone={handleClone}
            onCancel={handleOpenCancel}
            onDelete={handleOpenDelete}
          />
        </div>

        {/* PAGINATION */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>{t("Hiển thị")} {showFrom}–{showTo} / {filtered.length} {t("đoàn")}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1}
                onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> {t("Trước")}
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1">…</span>}
                      <Button variant={p === page ? "default" : "outline"} size="sm"
                        className="h-8 w-8 text-xs p-0" onClick={() => setPage(p)}>{p}</Button>
                    </span>
                  );
                })}
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}>
                {t("Sau")} <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-8 text-xs w-[130px]">
                <span>{t("Hiển thị")} {pageSize}/{t("trang")}</span>
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} {t("đoàn / trang")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <DoanDrawer
        open={drawerOpen}
        doan={editingDoan}
        onClose={() => { setDrawerOpen(false); setEditingDoan(null); }}
        onSave={handleSave}
        isSaving={createDoan.isPending || updateDoan.isPending}
      />

      <DeleteDialog
        open={!!cancelingDoan}
        name={cancelingDoan?.ten_doan || ""}
        onConfirm={handleCancel}
        onCancel={() => setCancelingDoan(null)}
        isDeleting={cancelDoan.isPending}
        variant="cancel"
      />

      <DeleteDialog
        open={!!deletingDoan}
        name={deletingDoan?.ten_doan || ""}
        onConfirm={handleDelete}
        onCancel={() => setDeletingDoan(null)}
        isDeleting={deleteDoan.isPending}
      />

      <Dialog open={!!pendingCreate} onOpenChange={(o) => { if (!o) setPendingCreate(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{t("Chọn thị trường")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            {(currentUser?.phan_loai_tour ?? []).map((market) => {
              const opt = THI_TRUONG_OPTS.find((o) => o.value === market);
              return (
                <Button
                  key={market}
                  variant="outline"
                  className="justify-start h-10"
                  disabled={createDoan.isPending}
                  onClick={() => {
                    if (!pendingCreate) return;
                    const payload = { ...pendingCreate, thi_truong: market };
                    setPendingCreate(null);
                    setDrawerOpen(false);
                    setEditingDoan(null);
                    openPhanViec(payload);
                  }}
                >
                  {opt ? `${opt.loai_tour === "inbound" ? "Inbound" : opt.loai_tour === "outbound" ? "Outbound" : "Nội địa"} — ${opt.label}` : market}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PhanViecModal
        open={!!pendingPhanViec}
        onClose={() => setPendingPhanViec(null)}
        info={pendingPhanViec?.info ?? null}
        creatorId={currentUser?.user_id ?? ""}
        submitting={createDoan.isPending || uploadTaiLieu.isPending || createPhanViec.isPending}
        onConfirm={confirmPhanViec}
      />
    </div>
  );
}
