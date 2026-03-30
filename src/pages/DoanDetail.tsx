import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { exportDieuTourWord } from "@/lib/export-dieu-tour-word";
import { useQueryClient } from "@tanstack/react-query";
import { useDoanList } from "@/hooks/use-doan";
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
  checkPreSaveWarnings,
  type DayLocal,
  type PreSaveWarning,
} from "@/hooks/use-dieu-tour";
import CompanyHeader from "@/components/dieu-tour/CompanyHeader";
import DoanInfoSection from "@/components/dieu-tour/DoanInfoSection";
import GuestCountSection from "@/components/dieu-tour/GuestCountSection";
import GiftTagsSection from "@/components/dieu-tour/GiftTagsSection";
import DayScheduleTable from "@/components/dieu-tour/DayScheduleTable";
import BookingKSTab from "@/components/dieu-tour/BookingKSTab";
import BookingNHTab from "@/components/booking-nh/BookingNHTab";
import BookingDVTab from "@/components/booking-dv/BookingDVTab";
import ChiPhiTab from "@/components/chi-phi/ChiPhiTab";

export default function DoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const doanId = Number(id);

  const { data: groups, isLoading } = useDoanList();
  const { data: canhDiemList = [] } = useCanhDiem();
  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const { data: dbNgayRows = [] } = useDoanNgayList(doanId || undefined);
  const { data: dbNgayItems = [] } = useDoanNgayItems(doanId || undefined);
  const saveMutation = useSaveDieuTour();
  const initDoanNgay = useInitDoanNgay();

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
  const [days, setDays] = useState<DayLocal[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("dieu-tour");
  const [preSaveWarnings, setPreSaveWarnings] = useState<PreSaveWarning[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const queryClient = useQueryClient();

  const soKhachLon = doan?.so_khach_lon ?? 0;
  const soKhachEm1 = doan?.so_khach_em1 ?? 0;
  const soKhachEm2 = doan?.so_khach_em2 ?? 0;
  const soKhachTl = doan?.so_khach_tl ?? 0;
  const totalKhach = soKhachLon + soKhachEm1 + soKhachEm2 + soKhachTl;

  // Initialize from doan data — re-merge whenever DB data changes
  useEffect(() => {
    if (!doan) return;
    // Only populate when we have actual fetched data (not default empty arrays)
    // dbNgayRows being empty is valid (new doan), but doan must exist
    const generatedDays = generateDays(doan.ngay_di, doan.ngay_ve);
    const merged = mergeDaysWithDB(generatedDays, dbNgayRows, dbNgayItems);
    
    // Preserve local edits: only re-populate non-schedule fields if not initialized
    if (!initialized) {
      setBangDon(doan.bang_don || "");
      setShopping(doan.shopping ?? null);
      setTruongDoan(doan.truong_doan || "");
      setChuyenBayDon(doan.chuyen_bay_don || "");
      setChuyenBayTien(doan.chuyen_bay_tien || "");
      setChuThichKhach(doan.chu_thich_khach || "");
      setGifts(Array.isArray(doan.tang_pham) ? doan.tang_pham : []);
      setGhiChuDieuTour(doan.ghi_chu_dieu_tour || "");
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
  }, [activeTab, doanId, queryClient]);

  const doSave = useCallback(() => {
    if (!doanId) return;
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
          toast.success("✓ Đã lưu!");
          await queryClient.refetchQueries({ queryKey: ["doan_ngay", doanId] });
          await queryClient.refetchQueries({ queryKey: ["doan_ngay_item", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_booking_ks", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_booking_dv", doanId] });

          try {
            const result = await syncDieuTourToBookingDV({
              doanId,
              days,
              canhDiemList,
              soKhach: totalKhach || doan?.so_khach || 0,
            });
            if (result.synced > 0) {
              toast.success(`Đã sync ${result.synced} dịch vụ sang tab Booking DV`);
            }
          } catch (e) {
            console.error("Sync to Booking DV error:", e);
          }
        },
        onError: (err: any) => toast.error(err.message || "Lỗi khi lưu"),
      }
    );
  }, [doanId, bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien, soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, chuThichKhach, gifts, ghiChuDieuTour, days, totalKhach, doan, canhDiemList, nhaHangList, khachSanList, saveMutation, queryClient]);

  const handleSave = useCallback(async () => {
    if (!doanId) return;
    setIsChecking(true);
    try {
      const warnings = await checkPreSaveWarnings({
        doanId,
        days,
        dbNgayRows,
        dbNgayItems,
        canhDiemList,
        nhaHangList,
        khachSanList,
      });
      if (warnings.length > 0) {
        setPreSaveWarnings(warnings);
      } else {
        doSave();
      }
    } catch (e) {
      console.error("Pre-save check error:", e);
      doSave(); // Fallback: save anyway
    } finally {
      setIsChecking(false);
    }
  }, [doanId, days, dbNgayRows, dbNgayItems, canhDiemList, nhaHangList, khachSanList, doSave]);

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
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
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
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Danh sách đoàn
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">{doan.ten_doan}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" /> In / Xuất PDF
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleSave}
              disabled={saveMutation.isPending || isChecking}
            >
              <Save className="h-4 w-4 mr-1.5" /> {isChecking ? "Đang kiểm tra..." : saveMutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dieu-tour" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="print-hide">
            <TabsTrigger value="dieu-tour">Điều Tour</TabsTrigger>
            <TabsTrigger value="booking-ks">Booking KS</TabsTrigger>
            <TabsTrigger value="menu">Booking NH</TabsTrigger>
            <TabsTrigger value="booking-dv">Booking DV</TabsTrigger>
            <TabsTrigger value="chi-phi">Chi phí</TabsTrigger>
          </TabsList>

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
              setBangDon={setBangDon}
              shopping={shopping}
              setShopping={setShopping}
              truongDoan={truongDoan}
              setTruongDoan={setTruongDoan}
              chuyenBayDon={chuyenBayDon}
              setChuyenBayDon={setChuyenBayDon}
              chuyenBayTien={chuyenBayTien}
              setChuyenBayTien={setChuyenBayTien}
            />
            <GuestCountSection
              soKhachLon={soKhachLon}
              soKhachEm1={soKhachEm1}
              soKhachEm2={soKhachEm2}
              soKhachTl={soKhachTl}
              totalFromDoan={doan.so_khach ?? totalKhach}
              chuThichKhach={chuThichKhach}
              setChuThichKhach={setChuThichKhach}
            />
            <GiftTagsSection gifts={gifts} setGifts={setGifts} />
            <DayScheduleTable
              days={days}
              setDays={setDays}
              canhDiemList={canhDiemList}
              nhaHangList={nhaHangList}
              khachSanList={khachSanList}
            />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Ghi chú điều tour</h3>
              <Textarea
                value={ghiChuDieuTour}
                onChange={(e) => setGhiChuDieuTour(e.target.value)}
                placeholder="Nhập ghi chú..."
                rows={4}
                className="resize-none text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="booking-ks" className="mt-4">
            <BookingKSTab doanId={doanId} tenDoan={doan.ten_doan} />
          </TabsContent>

          <TabsContent value="menu" className="mt-4">
            <BookingNHTab doanId={doanId} tenDoan={doan.ten_doan} soKhach={totalKhach || doan.so_khach || 0} />
          </TabsContent>

          <TabsContent value="booking-dv" className="mt-4">
            <BookingDVTab doanId={doanId} tenDoan={doan.ten_doan} hdvTen={doan.hdv || ""} />
          </TabsContent>

          <TabsContent value="chi-phi" className="mt-4">
            <ChiPhiTab doanId={doanId} doan={doan} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Pre-save Warning Dialog */}
      <AlertDialog open={preSaveWarnings.length > 0} onOpenChange={(open) => {
        if (!open) setPreSaveWarnings([]);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ Cảnh báo thay đổi ảnh hưởng đến booking</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Các thay đổi sau có thể ảnh hưởng đến booking đã gửi:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {preSaveWarnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
                <p className="text-sm">
                  Bạn vẫn muốn lưu? Sau khi lưu hãy vào các tab Booking tương ứng để xử lý.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setPreSaveWarnings([]);
              doSave();
              toast.info("Đã lưu. Vui lòng kiểm tra lại các tab Booking.");
            }}>
              Vẫn lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}