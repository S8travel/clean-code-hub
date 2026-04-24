import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { exportDieuTourWord } from "@/lib/export-dieu-tour-word";
import { useQueryClient } from "@tanstack/react-query";
import { useDoanList, useDoanPermissions } from "@/hooks/use-doan";
import { useAuth } from "@/hooks/use-auth";
import {
  useCanhDiem,
  useNhaHang,
  useKhachSan,
  useDoanNgayList,
  useDoanNgayItems,
  useSaveDieuTour,
  useInitDoanNgay,
  generateDays,
  mergeDaysWithDB,
  syncDieuTourToBookingDV,
  type DayLocal,
} from "@/hooks/use-dieu-tour";
import { useBookingKS } from "@/hooks/use-booking-ks";
import { useBookingNH } from "@/hooks/use-booking-nh";
import { useChiPhiList } from "@/hooks/use-chi-phi";
import CompanyHeader from "@/components/dieu-tour/CompanyHeader";
import DoanInfoSection from "@/components/dieu-tour/DoanInfoSection";
import GiftTagsSection from "@/components/dieu-tour/GiftTagsSection";
import DayScheduleTable from "@/components/dieu-tour/DayScheduleTable";
import BookingKSTab from "@/components/dieu-tour/BookingKSTab";
import BookingNHTab from "@/components/booking-nh/BookingNHTab";
import BookingDVTab from "@/components/booking-dv/BookingDVTab";
import ChiPhiTab from "@/components/chi-phi/ChiPhiTab";
import DoanLogTab from "@/components/doan-log/DoanLogTab";

function TabBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px]">
      {count}
    </span>
  );
}

export default function DoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const doanId = Number(id);

  const { data: groups, isLoading } = useDoanList();
  const { user: currentUser } = useAuth();
  const { data: doanPerms = [] } = useDoanPermissions(doanId || null);
  const isAdmin = currentUser?.role === "admin";
  const myPerm = doanPerms.find((p) => p.user_id === currentUser?.user_id);
  // Nếu chưa phân quyền (doanPerms rỗng) → ai cũng sửa được
  // Nếu đã phân quyền → chỉ admin hệ thống hoặc người có quyen edit/admin mới sửa được
  const canEdit = isAdmin || doanPerms.length === 0 || myPerm?.quyen === "edit" || myPerm?.quyen === "admin";

  const { data: canhDiemList = [] } = useCanhDiem();
  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const { data: dbNgayRows = [] } = useDoanNgayList(doanId || undefined);
  const { data: dbNgayItems = [] } = useDoanNgayItems(doanId || undefined);
  const saveMutation = useSaveDieuTour();
  const initDoanNgay = useInitDoanNgay();

  // Warning badge data (React Query deduplicates — no extra requests when tabs are active)
  const { data: bookingKSList = [] } = useBookingKS(doanId || undefined);
  const { data: menuData = [] } = useBookingNH(doanId || undefined);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId || undefined);

  const doan = groups?.find((g: any) => String(g.id) === id);

  // Local state for editable fields
  const [bangDon, setBangDon] = useState("");
  const [shopping, setShopping] = useState<boolean | null>(null);
  const [truongDoan, setTruongDoan] = useState("");
  const [chuyenBayDon, setChuyenBayDon] = useState("");
  const [chuyenBayTien, setChuyenBayTien] = useState("");
  const [chuThichKhach, setChuThichKhach] = useState("");
  const [gifts, setGifts] = useState<string[]>([]);
  const [ghiChuDieuTour, setGhiChuDieuTour] = useState("");
  const [coTinhSuatTLNhaHang, setCoTinhSuatTLNhaHang] = useState(false);
  const [days, setDays] = useState<DayLocal[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("dieu-tour");
  const [exportingWord, setExportingWord] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const queryClient = useQueryClient();

  // Auto-save refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSaveRef = useRef<(() => void) | null>(null);

  const soKhachLon = doan?.so_khach_lon ?? 0;
  const soKhachEm1 = doan?.so_khach_em1 ?? 0;
  const soKhachEm2 = doan?.so_khach_em2 ?? 0;
  const soKhachTl = doan?.so_khach_tl ?? 0;
  const totalKhach = soKhachLon + soKhachEm1 + soKhachEm2 + soKhachTl;

  // Initialize from doan data — re-merge whenever DB data changes
  // NOTE: uses raw setDays (not handleSetDays) to avoid triggering auto-save on DB refetch
  useEffect(() => {
    if (!doan) return;
    const generatedDays = generateDays(doan.ngay_di, doan.ngay_ve);
    const merged = mergeDaysWithDB(generatedDays, dbNgayRows, dbNgayItems);

    if (!initialized) {
      setBangDon(doan.bang_don || "");
      setShopping(doan.shopping ?? false);
      setTruongDoan(doan.truong_doan || "");
      setChuyenBayDon(doan.chuyen_bay_don || "");
      setChuyenBayTien(doan.chuyen_bay_tien || "");
      setChuThichKhach(doan.chu_thich_khach || "");
      setGifts(Array.isArray(doan.tang_pham) ? doan.tang_pham : []);
      setGhiChuDieuTour(doan.ghi_chu_dieu_tour || "");
      setCoTinhSuatTLNhaHang(doan.co_tinh_suat_tl_nha_hang ?? false);
      setInitialized(true);
    }

    setDays(merged);
  }, [doan, dbNgayRows, dbNgayItems]);

  // Auto-init doan_ngay rows
  useEffect(() => {
    if (doanId && doan?.ngay_di && doan?.ngay_ve) {
      initDoanNgay.mutate({ doanId, ngayDi: doan.ngay_di, ngayVe: doan.ngay_ve });
    }
  }, [doanId, doan?.ngay_di, doan?.ngay_ve]);

  // Refetch booking data when switching tabs
  useEffect(() => {
    if (activeTab === "dieu-tour" && doanId) {
      queryClient.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
      queryClient.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] });
    }
    if (activeTab === "booking-ks" && doanId) {
      queryClient.invalidateQueries({ queryKey: ["doan_booking_ks", doanId] });
    }
    if (activeTab === "menu" && doanId) {
      queryClient.invalidateQueries({ queryKey: ["doan_booking_nh", doanId] });
    }
    if (activeTab === "booking-dv" && doanId) {
      queryClient.invalidateQueries({ queryKey: ["doan_booking_dv", doanId] });
    }
    if (activeTab === "log" && doanId) {
      queryClient.invalidateQueries({ queryKey: ["doan_log", doanId] });
    }
  }, [activeTab, doanId, queryClient]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const doSave = useCallback(() => {
    if (!doanId) return;
    setSaveStatus("saving");
    saveMutation.mutate(
      {
        doanId,
        doanFields: {
          bang_don: bangDon || null,
          shopping,
          truong_doan: truongDoan || null,
          chuyen_bay_don: chuyenBayDon || null,
          chuyen_bay_tien: chuyenBayTien || null,
          so_khach_lon: soKhachLon,
          so_khach_em1: soKhachEm1,
          so_khach_em2: soKhachEm2,
          so_khach_tl: soKhachTl,
          co_tinh_suat_tl_nha_hang: coTinhSuatTLNhaHang,
          chu_thich_khach: chuThichKhach || null,
          tang_pham: gifts.length > 0 ? gifts : null,
          ghi_chu_dieu_tour: ghiChuDieuTour || null,
        },
        days,
        soKhach: totalKhach || doan?.so_khach || 0,
        canhDiemList,
        nhaHangList,
        khachSanList,
      },
      {
        onSuccess: async () => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
          queryClient.invalidateQueries({ queryKey: ["doan_booking_ks", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_booking_dv", doanId] });

          try {
            await syncDieuTourToBookingDV({
              doanId,
              days,
              canhDiemList,
              soKhach: totalKhach || doan?.so_khach || 0,
            });
          } catch (e) {
            console.error("Sync to Booking DV error:", e);
          }
        },
        onError: (err: any) => {
          setSaveStatus("error");
          toast.error(err.message || "Lỗi khi lưu");
        },
      }
    );
  }, [doanId, bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien, soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, coTinhSuatTLNhaHang, chuThichKhach, gifts, ghiChuDieuTour, days, totalKhach, doan, canhDiemList, nhaHangList, khachSanList, saveMutation, queryClient]);

  // Keep ref updated so timer always calls latest doSave
  doSaveRef.current = doSave;

  const scheduleSave = useCallback(() => {
    if (!canEdit || !doanId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      doSaveRef.current?.();
    }, 1500);
  }, [canEdit, doanId]);

  // Wrapped setters: call original setter + schedule auto-save
  // The init useEffect uses raw setters to avoid triggering auto-save on DB changes
  const handleSetBangDon = useCallback((v: string) => { setBangDon(v); scheduleSave(); }, [scheduleSave]);
  const handleSetShopping = useCallback((v: boolean | null) => { setShopping(v); scheduleSave(); }, [scheduleSave]);
  const handleSetTruongDoan = useCallback((v: string) => { setTruongDoan(v); scheduleSave(); }, [scheduleSave]);
  const handleSetChuyenBayDon = useCallback((v: string) => { setChuyenBayDon(v); scheduleSave(); }, [scheduleSave]);
  const handleSetChuyenBayTien = useCallback((v: string) => { setChuyenBayTien(v); scheduleSave(); }, [scheduleSave]);
  const handleSetChuThichKhach = useCallback((v: string) => { setChuThichKhach(v); scheduleSave(); }, [scheduleSave]);
  const handleSetCoTinhSuatTLNhaHang = useCallback((v: boolean) => { setCoTinhSuatTLNhaHang(v); scheduleSave(); }, [scheduleSave]);
  const handleSetGifts = useCallback((v: string[]) => { setGifts(v); scheduleSave(); }, [scheduleSave]);
  const handleSetGhiChuDieuTour = useCallback((v: string) => { setGhiChuDieuTour(v); scheduleSave(); }, [scheduleSave]);
  const handleSetDays = useCallback((v: DayLocal[]) => {
    setDays(v);
    scheduleSave();
  }, [scheduleSave]);

  const handleExportWord = useCallback(async () => {
    if (!doan) return;
    setExportingWord(true);
    try {
      await exportDieuTourWord({
        days,
        canhDiemList,
        nhaHangList,
        khachSanList,
        tenDoan: doan.ten_doan,
        hdv: doan.huong_dan_vien?.ten ?? "",
        xe: doan.xe ?? null,
        ngayDi: doan.ngay_di ?? null,
        ngayVe: doan.ngay_ve ?? null,
        bangDon,
        shopping,
        truongDoan,
        chuyenBayDon,
        chuyenBayTien,
        soKhachLon,
        soKhachEm1,
        soKhachEm2,
        soKhachTl,
        totalKhach: doan.so_khach ?? totalKhach,
        chuThichKhach,
        gifts,
        ghiChuDieuTour,
      });
    } finally {
      setExportingWord(false);
    }
  }, [doan, days, canhDiemList, nhaHangList, khachSanList, bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien, soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalKhach, chuThichKhach, gifts, ghiChuDieuTour]);

  // Warning badge counts
  const bookingKSBadgeCount = useMemo(() =>
    bookingKSList.filter(b => !b.con_trong_dieu_tour && b.ks_final_status !== "ks_xac_nhan_huy").length
  , [bookingKSList]);

  const bookingNHBadgeCount = useMemo(() =>
    menuData.filter(d =>
      d.orphan_trua !== null || d.orphan_toi !== null ||
      (!d.trua_con_trong_tour && d.booking_trua?.booking_status === "da_gui") ||
      (!d.toi_con_trong_tour && d.booking_toi?.booking_status === "da_gui")
    ).length
  , [menuData]);

  const validNgayIds = useMemo(() => new Set(dbNgayRows.map(r => r.id)), [dbNgayRows]);

  const chiPhiBadgeCount = useMemo(() =>
    chiPhiRows.filter(r =>
      r.ref_doan_ngay_id !== null &&
      !validNgayIds.has(r.ref_doan_ngay_id) &&
      r.trang_thai_thanh_toan === "unpaid"
    ).length
  , [chiPhiRows, validNgayIds]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!doan) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/doan")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Danh sách đoàn
        </Button>
        <p className="mt-8 text-center text-muted-foreground">Không tìm thấy đoàn.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 print-hide">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/doan")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Danh sách đoàn
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">{doan.ten_doan}</span>
          </div>
          <div className="flex items-center gap-2">
            {!canEdit && (
              <span className="text-xs text-muted-foreground border rounded px-2 py-1">Chỉ xem</span>
            )}
            {canEdit && saveStatus !== "idle" && (
              <span className={cn(
                "text-xs px-2 py-1 rounded",
                saveStatus === "saving" && "text-muted-foreground",
                saveStatus === "saved" && "text-green-600",
                saveStatus === "error" && "text-red-600"
              )}>
                {saveStatus === "saving" && "Đang lưu..."}
                {saveStatus === "saved" && "✓ Đã lưu"}
                {saveStatus === "error" && "Lỗi lưu"}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dieu-tour" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="print-hide">
            <TabsTrigger value="dieu-tour">Điều Tour</TabsTrigger>
            <TabsTrigger value="booking-ks">Booking KS<TabBadge count={bookingKSBadgeCount} /></TabsTrigger>
            <TabsTrigger value="menu">Booking NH<TabBadge count={bookingNHBadgeCount} /></TabsTrigger>
            <TabsTrigger value="booking-dv">Booking DV</TabsTrigger>
            <TabsTrigger value="chi-phi">Chi phí<TabBadge count={chiPhiBadgeCount} /></TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0 [&:disabled]:opacity-100">
          <TabsContent value="dieu-tour" className="mt-4 space-y-6">
            <div className="flex justify-end print-hide">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleExportWord}
                disabled={exportingWord || days.length === 0}
              >
                <FileDown className="h-3.5 w-3.5" />
                {exportingWord ? "Đang xuất..." : "Xuất Word"}
              </Button>
            </div>
            <CompanyHeader />
            <DoanInfoSection
              doan={doan}
              bangDon={bangDon}
              setBangDon={handleSetBangDon}
              shopping={shopping}
              setShopping={handleSetShopping}
              truongDoan={truongDoan}
              setTruongDoan={handleSetTruongDoan}
              chuyenBayDon={chuyenBayDon}
              setChuyenBayDon={handleSetChuyenBayDon}
              chuyenBayTien={chuyenBayTien}
              setChuyenBayTien={handleSetChuyenBayTien}
              soKhachLon={soKhachLon}
              soKhachEm1={soKhachEm1}
              soKhachEm2={soKhachEm2}
              soKhachTl={soKhachTl}
              totalFromDoan={doan.so_khach ?? totalKhach}
              chuThichKhach={chuThichKhach}
              setChuThichKhach={handleSetChuThichKhach}
              coTinhSuatTLNhaHang={coTinhSuatTLNhaHang}
              setCoTinhSuatTLNhaHang={handleSetCoTinhSuatTLNhaHang}
            />
            <GiftTagsSection gifts={gifts} setGifts={handleSetGifts} />
            <DayScheduleTable
              days={days}
              setDays={handleSetDays}
              canhDiemList={canhDiemList}
              nhaHangList={nhaHangList}
              khachSanList={khachSanList}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Ghi chú điều tour</h3>
              <Textarea
                value={ghiChuDieuTour}
                onChange={(e) => handleSetGhiChuDieuTour(e.target.value)}
                placeholder="Nhập ghi chú..."
                rows={4}
                className="resize-none text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="booking-ks" className="mt-4">
            <BookingKSTab doanId={doanId} tenDoan={doan.ten_doan} ngayDi={doan.ngay_di} />
          </TabsContent>

          <TabsContent value="menu" className="mt-4">
            <BookingNHTab
              doanId={doanId}
              tenDoan={doan.ten_doan}
              soKhach={coTinhSuatTLNhaHang ? (totalKhach || doan.so_khach || 0) : ((totalKhach - soKhachTl) || doan.so_khach || 0)}
              soNoidBo={soKhachTl > 0 && !coTinhSuatTLNhaHang ? 3 : 2}
              soKhachLon={soKhachLon}
              soKhachEm1={soKhachEm1}
              soKhachEm2={soKhachEm2}
              hdvTen={doan.hdv || ""}
            />
          </TabsContent>

          <TabsContent value="booking-dv" className="mt-4">
            <BookingDVTab doanId={doanId} tenDoan={doan.ten_doan} hdvTen={doan.hdv || ""} ngayDi={doan.ngay_di} />
          </TabsContent>

          <TabsContent value="chi-phi" className="mt-4">
            <ChiPhiTab doanId={doanId} doan={doan} coTinhSuatTLNhaHang={coTinhSuatTLNhaHang} />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <DoanLogTab doanId={doanId} />
          </TabsContent>
          </fieldset>
        </Tabs>
      </div>
    </div>
  );
}
