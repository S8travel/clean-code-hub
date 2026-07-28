import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileDown, CalendarCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { DieuTourGuardError } from "@/lib/dieu-tour-guard-error";
import { parseDoanTab } from "@/lib/doan-cancel-check";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { type DieuTourExportData } from "@/lib/export-dieu-tour-word";
import { useQueryClient } from "@tanstack/react-query";
import { useDoanList, useDoanDetailRealtime, useUserRoles } from "@/hooks/use-doan"; // useDoanPermissions: FEATURE_DOAN_PERM_DISABLED
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permissions";
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
import { useAllSetMenus } from "@/hooks/use-nha-hang";
import { useBookingKS } from "@/hooks/use-booking-ks";
import { useBookingNH } from "@/hooks/use-booking-nh";
import { useChiPhiList, useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { giftMoTa, GIFT_DON_GIA } from "@/components/chi-phi/hdv-shared";
import CompanyHeader from "@/components/dieu-tour/CompanyHeader";
import DoanInfoSection from "@/components/dieu-tour/DoanInfoSection";
import GiftTagsSection from "@/components/dieu-tour/GiftTagsSection";
import DayScheduleTable from "@/components/dieu-tour/DayScheduleTable";
import DoanNhomTabs from "@/components/dieu-tour/DoanNhomTabs";
import { useDoanNhomList } from "@/hooks/use-doan-nhom";
import TipSection from "@/components/dieu-tour/TipSection";
import BookingKSTab from "@/components/dieu-tour/BookingKSTab";
import BookingNHTab from "@/components/booking-nh/BookingNHTab";
import BookingDVTab from "@/components/booking-dv/BookingDVTab";
import BookingVisaXeTab from "@/components/booking-dv/BookingVisaXeTab";
import ChiPhiTab from "@/components/chi-phi/ChiPhiTab";
import KhaoSatTab from "@/components/khao-sat/KhaoSatTab";
import { KhachLeTab } from "@/components/dieu-tour/KhachLeTab";
import DoanLogTab from "@/components/doan-log/DoanLogTab";
import DoanTaiLieuTab from "@/components/tai-lieu/DoanTaiLieuTab";
import DieuTourWordPreviewModal from "@/components/dieu-tour/DieuTourWordPreviewModal";
import RemapNgayModal from "@/components/dieu-tour/RemapNgayModal";
import DoiKsPhiHuyModal, { type DoiKsConfirmArgs } from "@/components/dieu-tour/DoiKsPhiHuyModal";
import KsHuyMailModal from "@/components/dieu-tour/KsHuyMailModal";
import KsBotDemCanhBaoDialog from "@/components/dieu-tour/KsBotDemCanhBaoDialog";
import {
  useDoiKsPhiHuy, checkKsPhiHuyOnChange, checkKsBotDemOnChange,
  KsDnttNgoaiPhamViError, type KsPhiHuyPending,
} from "@/hooks/use-doi-ks-phi-huy";
import type { KsBotDemCanhBao } from "@/lib/ks-bot-dem";

function TabBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px]">
      {count}
    </span>
  );
}

export default function DoanDetail() {
  useTranslate();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const doanId = Number(id);

  // Realtime: máy khác đổi đoan/doan_ngay/doan_ngay_item → tự refetch
  // (an toàn nhờ chốt hasPendingChangesRef ở local state điều tour).
  useDoanDetailRealtime(doanId);

  const { data: groups, isLoading } = useDoanList();
  const { data: userRoles } = useUserRoles();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  // FEATURE_DOAN_PERM_DISABLED: tạm tắt per-tour permission, dùng team-based thay thế
  // Bật lại: bỏ comment 3 dòng dưới và xóa dòng `const canEdit = true`
  // const { data: doanPerms = [] } = useDoanPermissions(doanId || null);
  // const myPerm = doanPerms.find((p) => p.user_id === currentUser?.user_id);
  // const canEdit = isAdmin || doanPerms.length === 0 || myPerm?.quyen === "edit" || myPerm?.quyen === "admin";
  // Tài khoản chỉ xem → khóa nguyên <fieldset> bên dưới (DB cũng chặn ghi).
  const canEdit = !currentUser?.chi_xem;
  // Resource `chi_phi` trước đây không được enforce ở đâu — nay gate tab Chi phí,
  // để tài khoản che giá vốn không thấy giá gốc (RLS ở DB cũng đã chặn đọc).
  const canViewChiPhi = usePermission("chi_phi", "view");

  const { data: canhDiemList = [] } = useCanhDiem();
  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const { data: allSetMenus = [] } = useAllSetMenus();
  // Nhóm active cho tab Điều Tour (Phase 2). DoanNhomTabs auto-set khi nhóm list load.
  const [activeNhomId, setActiveNhomId] = useState<number | null>(null);
  const { data: dbNgayRows = [] } = useDoanNgayList(doanId || undefined, activeNhomId);
  const { data: dbNgayItems = [] } = useDoanNgayItems(doanId || undefined, activeNhomId);
  const saveMutation = useSaveDieuTour();
  const { mutate: initDoanNgayMutate } = useInitDoanNgay();

  // Warning badge data (React Query deduplicates — no extra requests when tabs are active)
  const { data: bookingKSList = [] } = useBookingKS(doanId || undefined);
  const { data: menuData = [] } = useBookingNH(doanId || undefined);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId || undefined);
  const upsertChiPhi = useUpsertChiPhi();
  const deleteChiPhi = useDeleteChiPhi();

  const doan = groups?.find((g) => String(g.id) === id);

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
  const [thuTip, setThuTip] = useState(true);
  const [tipRate, setTipRate] = useState<number | null>(null);
  const [tipSoNgayOverride, setTipSoNgayOverride] = useState<number | null>(null);
  const [tipSoKhachOverride, setTipSoKhachOverride] = useState<number | null>(null);
  const [tipLumpSum, setTipLumpSum] = useState<number | null>(null);
  const [days, setDays] = useState<DayLocal[]>([]);
  const [initialized, setInitialized] = useState(false);
  // Deep-link ?tab= từ màn checklist "Hủy đoàn" (Index.tsx) nhảy thẳng vào tab
  // cần dọn. Whitelist ở lib — `?tab=<rác>` phải rơi về dieu-tour, không để Tabs
  // rỗng ruột. Chỉ đọc lúc mount; sau đó tab do người dùng điều khiển.
  const [activeTab, setActiveTab] = useState<string>(() => parseDoanTab(searchParams.get("tab")) ?? "dieu-tour");
  const [showWordPreview, setShowWordPreview] = useState(false);
  const [showRemap, setShowRemap] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  // Guard đổi KS: KS cũ còn ĐNTT sống HOẶC booking đã gửi → chặn autosave, hỏi OP.
  const [ksPhiHuyPending, setKsPhiHuyPending] = useState<KsPhiHuyPending | null>(null);
  // Bước 2 (tuỳ chọn): soạn mail hủy gửi KS cũ TRƯỚC khi ghi DB.
  const [ksHuyMail, setKsHuyMail] = useState<{
    pending: KsPhiHuyPending; phiHuy: number; lyDo: string; mode: "phi_huy" | "de_sau";
  } | null>(null);
  const ksGateBusyRef = useRef(false);
  // Đã ghi DB cho ít nhất 1 KS trong lượt đổi này (không hoàn tác được).
  const ksCommittedRef = useRef(false);
  // Cảnh báo "đêm đang giữ tiền bị đụng" — ca mà checkKsPhiHuyOnChange cố tình bỏ qua
  // (KS vẫn còn đêm khác / gán KS vào đêm mồ côi). Chỉ hỏi, KHÔNG tự xử lý tiền.
  const [ksBotDem, setKsBotDem] = useState<KsBotDemCanhBao | null>(null);
  // Các dayId OP ĐÃ bấm "tôi hiểu, vẫn đổi". Theo TỪNG đêm, KHÔNG phải cờ tắt-cả-gate:
  // nếu bật/tắt cả gate thì xác nhận cảnh báo #1 sẽ nuốt luôn cảnh báo #2 (đêm khác đang
  // giữ tiền) → tiền quy nhầm không ai báo. Dọn khi lượt đổi kết thúc (days re-sync từ DB).
  const ksBotDemOkRef = useRef<Set<number>>(new Set());
  const doiKsMut = useDoiKsPhiHuy();
  const queryClient = useQueryClient();

  // Auto-save refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSaveRef = useRef<(() => void) | null>(null);
  const hasPendingChangesRef = useRef(false);
  // Track doan đã apply menu-fallback (chỉ cho legacy data lần đầu load).
  // Sau lần đầu, tin DB hoàn toàn — nếu không, user xóa NH ở điều tour
  // sẽ bị "phục hồi" từ booking NH cũ qua menuData.
  const menuFallbackAppliedRef = useRef<Set<number>>(new Set());

  // Số khách hiển thị + tính toán: ưu tiên nhóm active (Phase 2+), fallback đoàn.
  // (Save tour KHÔNG ghi đè doan.so_khach_* — DoanDrawer là chỗ chính edit số khách đoàn.)
  const { data: nhomList = [] } = useDoanNhomList(doanId || undefined);
  const activeNhom = activeNhomId != null ? nhomList.find((n) => n.id === activeNhomId) : null;
  const soKhachLon = activeNhom?.so_khach_lon ?? doan?.so_khach_lon ?? 0;
  const soKhachEm1 = activeNhom?.so_khach_em1 ?? doan?.so_khach_em1 ?? 0;
  const soKhachEm2 = activeNhom?.so_khach_em2 ?? doan?.so_khach_em2 ?? 0;
  const soKhachTl = activeNhom?.so_khach_tl ?? doan?.so_khach_tl ?? 0;
  const totalKhach = soKhachLon + soKhachEm1 + soKhachEm2 + soKhachTl;
  // Giá trị đoàn-level để giữ trong save payload (không bị nhóm 2 overwrite)
  const doanSoKhachLon = doan?.so_khach_lon ?? 0;
  const doanSoKhachEm1 = doan?.so_khach_em1 ?? 0;
  const doanSoKhachEm2 = doan?.so_khach_em2 ?? 0;
  const doanSoKhachTl = doan?.so_khach_tl ?? 0;

  // Initialize from doan data — re-merge whenever DB data changes
  // NOTE: uses raw setDays (not handleSetDays) to avoid triggering auto-save on DB refetch
  useEffect(() => {
    if (!doan) return;
    const generatedDays = generateDays(doan.ngay_di, doan.ngay_ve);
    const merged = mergeDaysWithDB(generatedDays, dbNgayRows, dbNgayItems);

    // Menu-fallback chỉ chạy LẦN ĐẦU per doan (legacy data: doan_ngay null
    // nhưng booking NH có row). Sau đó tin DB — nếu không, user xóa NH khỏi
    // điều tour sẽ bị "phục hồi" từ menuData (orphan recovered từ booking).
    const applyMenuFallback =
      doanId != null && !menuFallbackAppliedRef.current.has(doanId) && menuData.length > 0;
    let mergedWithBookingNh = merged;
    if (applyMenuFallback) {
      const menuDataByDay = new Map(menuData.map((m) => [m.doan_ngay_id, m]));
      mergedWithBookingNh = merged.map((day) => {
        if (!day.id) return day;
        const menuDay = menuDataByDay.get(day.id);
        if (!menuDay) return day;
        return {
          ...day,
          an_trua_nha_hang_id: day.an_trua_nha_hang_id ?? menuDay.an_trua_nha_hang_id,
          an_toi_nha_hang_id: day.an_toi_nha_hang_id ?? menuDay.an_toi_nha_hang_id,
          an_trua_set_menu_id: day.an_trua_set_menu_id ?? menuDay.an_trua_set_menu_id,
          an_toi_set_menu_id: day.an_toi_set_menu_id ?? menuDay.an_toi_set_menu_id,
        };
      });
      menuFallbackAppliedRef.current.add(doanId);
    }

    if (!initialized) {
      setBangDon(doan.bang_don || "");
      setShopping(doan.shopping ?? false);
      setTruongDoan(doan.truong_doan || "");
      setChuyenBayDon(doan.chuyen_bay_don || "");
      setChuyenBayTien(doan.chuyen_bay_tien || "");
      setChuThichKhach(doan.chu_thich_khach || "");
      setGifts(Array.isArray(doan.tang_pham) ? (doan.tang_pham as unknown as string[]) : []);
      setGhiChuDieuTour(doan.ghi_chu_dieu_tour || "");
      setCoTinhSuatTLNhaHang(doan.co_tinh_suat_tl_nha_hang ?? false);
      setThuTip(doan.thu_tip ?? true);
      setTipRate(doan.tip_rate ?? null);
      setTipSoNgayOverride(doan.tip_so_ngay_override ?? null);
      setTipSoKhachOverride(doan.tip_so_khach_override ?? null);
      setTipLumpSum(doan.tip_lump_sum ?? null);
      setInitialized(true);
    }

    if (!hasPendingChangesRef.current) {
      setDays(mergedWithBookingNh);
    }
  }, [doan, dbNgayRows, dbNgayItems, menuData, doanId, initialized]);

  // Sync chuyen_bay_don/tien từ doan khi DoanDrawer sửa (chỉ 2 field này bị
  // duplicate trong local state; các field khác như HDV, xe, số khách... đọc
  // doan trực tiếp nên tự cập nhật theo refetch). Tách field ra const để effect
  // chỉ chạy đúng khi field đó đổi — tránh đè input đang nhập dở khi doan refetch.
  const chuyenBayDonDb = doan?.chuyen_bay_don;
  const chuyenBayTienDb = doan?.chuyen_bay_tien;
  useEffect(() => {
    if (!initialized) return;
    setChuyenBayDon(chuyenBayDonDb || "");
  }, [chuyenBayDonDb, initialized]);
  useEffect(() => {
    if (!initialized) return;
    setChuyenBayTien(chuyenBayTienDb || "");
  }, [chuyenBayTienDb, initialized]);

  // Auto-init doan_ngay rows
  useEffect(() => {
    if (doanId && doan?.ngay_di && doan?.ngay_ve) {
      initDoanNgayMutate({ doanId, ngayDi: doan.ngay_di, ngayVe: doan.ngay_ve });
    }
  }, [doanId, doan?.ngay_di, doan?.ngay_ve, initDoanNgayMutate]);

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

  const runSave = useCallback(() => {
    if (!doanId) return;
    setSaveStatus("saving");
    saveMutation.mutate(
      {
        doanId,
        doanNhomId: activeNhomId,
        doanFields: {
          bang_don: bangDon || null,
          shopping,
          truong_doan: truongDoan || null,
          chuyen_bay_don: chuyenBayDon || null,
          chuyen_bay_tien: chuyenBayTien || null,
          // Dùng giá trị ĐOÀN (không phải nhóm active) — tránh overwrite tổng đoàn
          // khi user save tour ở tab nhóm 2.
          so_khach_lon: doanSoKhachLon,
          so_khach_em1: doanSoKhachEm1,
          so_khach_em2: doanSoKhachEm2,
          so_khach_tl: doanSoKhachTl,
          co_tinh_suat_tl_nha_hang: coTinhSuatTLNhaHang,
          chu_thich_khach: chuThichKhach || null,
          tang_pham: gifts.length > 0 ? gifts : null,
          ghi_chu_dieu_tour: ghiChuDieuTour || null,
          thu_tip: thuTip,
          tip_rate: tipRate,
          tip_so_ngay_override: tipSoNgayOverride,
          tip_so_khach_override: tipSoKhachOverride,
          tip_lump_sum: tipLumpSum,
        },
        days,
        soKhach: totalKhach || doan?.so_khach || 0,
        canhDiemList,
        nhaHangList,
        khachSanList,
      },
      {
        onSuccess: async (result) => {
          hasPendingChangesRef.current = false;
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 800);
          queryClient.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_booking_ks", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_booking_dv", doanId] });

          // HYBRID: cảnh báo user nếu cascade Điều tour đã reset adjustment cũ
          const x = result?.thucTeClearCount ?? 0;
          if (x > 0) {
            toast.warning(
              `${t("Đã reset điều chỉnh thanh_tien_thuc_te trên")} ${x} ${t("chi phí do thay đổi số khách/đơn giá.")}`,
              { duration: 6000 }
            );
          }

          // Cleanup NH mồ côi sau đổi chương trình (NH đổi ngày / thay NH / bỏ bữa)
          const orphanDeleted = result?.nhOrphanDeleted ?? 0;
          if (orphanDeleted > 0) {
            toast.info(
              `${t("Đã dọn")} ${orphanDeleted} ${t("dòng chi phí nhà hàng cũ không còn trong chương trình.")}`,
              { duration: 6000 }
            );
          }
          const orphanKept = result?.nhOrphanKept ?? 0;
          if (orphanKept > 0) {
            toast.warning(
              `${orphanKept} ${t("dòng chi phí nhà hàng cũ còn ĐNTT/voucher — cần xử lý ở tab Chi phí trước khi in.")}`,
              { duration: 8000 }
            );
          }

          try {
            await syncDieuTourToBookingDV({
              doanId,
              days,
              canhDiemList,
              soKhach: totalKhach || doan?.so_khach || 0,
            });
          } catch (e) {
            // Lưu đoàn VẪN thành công, nhưng BÁO cho user biết sync Booking DV lỗi.
            // (Trước đây nuốt im lặng → dịch vụ không hiện ở tab Booking DV mà không ai hay.)
            console.error("syncDieuTourToBookingDV failed:", e);
            toast.warning(
              `${t("Đồng bộ Booking DV thất bại")}: ${errMsg(e) || t("Thử lưu lại điều tour")}`,
              { duration: 6000 },
            );
          }
        },
        onError: (err: unknown) => {
          setSaveStatus("error");

          // Backstop chặn TRƯỚC khi ghi byte nào → DB nguyên vẹn, thao tác của OP vẫn
          // đúng và còn trên màn hình. Refetch lúc này sẽ xoá sạch mọi sửa đổi khác
          // trong cùng lượt (số khách, cảnh điểm ngày khác…) chỉ vì một dòng vướng ĐNTT.
          // Giữ nguyên `days`; OP đọc thông điệp rồi tự trả cảnh điểm về, hoặc hủy ĐNTT.
          if (err instanceof DieuTourGuardError) {
            // `id` cố định: OP gõ tiếp → autosave lại chặn lại. Không có id thì sonner
            // xếp chồng một toast đỏ 14 giây sau mỗi 1,5 giây gõ.
            toast.error(err.message, { id: "dieu-tour-guard", duration: 12000 });
            // Badge về "idle": lỗi này KHÔNG phải hỏng kỹ thuật, mà là việc OP phải xử
            // (trả cảnh điểm về, hoặc hủy ĐNTT). Để badge đỏ "Lỗi lưu" đứng mãi thì OP
            // tưởng hệ thống hỏng.
            setTimeout(() => setSaveStatus("idle"), 3000);
            return;
          }

          toast.error(errMsg(err) || t("Lỗi khi lưu"));
          // Lỗi KHÔNG phải guard → có thể đã ghi một phần (mạng đứt, race sau backstop).
          // Không biết DB đang ở đâu → refetch kéo UI về đúng sự thật.
          hasPendingChangesRef.current = false;
          queryClient.invalidateQueries({ queryKey: ["doan", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] });
          queryClient.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
          setTimeout(() => setSaveStatus("idle"), 3000);
        },
      }
    );
  }, [doanId, activeNhomId, bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien, soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, doanSoKhachLon, doanSoKhachEm1, doanSoKhachEm2, doanSoKhachTl, coTinhSuatTLNhaHang, chuThichKhach, gifts, ghiChuDieuTour, thuTip, tipRate, tipSoNgayOverride, tipSoKhachOverride, tipLumpSum, days, totalKhach, doan, canhDiemList, nhaHangList, khachSanList, saveMutation, queryClient]);

  // Chạy lại gate SAU khi React đã flush (setState ở trên đã vào state, doSaveRef đã
  // trỏ closure mới).
  //
  // KHÔNG gọi `doSaveRef.current?.()` thẳng: lúc đó React chưa re-render, doSaveRef vẫn
  // trỏ closure CŨ với `ksPhiHuyPending` truthy → doSave early-return → `runSave()`
  // không chạy → `doan_ngay.khach_san_id` không bao giờ được lưu (đổi KS "mất tích").
  // setTimeout(0) là macrotask, luôn chạy sau khi React commit.
  const rerunGateSoon = useCallback(() => {
    setTimeout(() => doSaveRef.current?.(), 0);
  }, []);

  // Gate TRƯỚC autosave: KS cũ rời khỏi lịch trình mà còn ĐNTT sống HOẶC còn booking
  // đã gửi mail → dừng, hỏi (phí hủy / mail hủy) RỒI mới lưu. Nếu chạy save trước thì
  // doan_ngay.khach_san_id flip → dòng chi phí KS cũ bị quy nhầm sang KS mới (mất dấu tiền).
  //
  // Trước 07/2026 gate chỉ mở modal khi paidTotal>0; ca "chỉ có ĐNTT chưa trả" bị tự hủy
  // IM LẶNG, còn ca "booking đã gửi, chưa dính tiền" thì gate bỏ qua hẳn → booking thành
  // mồ côi, khách sạn không hề biết mình bị hủy. Nay mọi pending đều hỏi OP.
  const doSave = useCallback(async () => {
    if (!doanId) return;
    if (ksPhiHuyPending || ksBotDem || ksGateBusyRef.current) return; // modal đang mở / gate đang chạy
    ksGateBusyRef.current = true;
    try {
      const pendings = await checkKsPhiHuyOnChange({ doanId, days, dbNgayRows });
      if (pendings.length > 0) {
        // Xử từng KS một; sau mỗi lần xong gate chạy lại và bắt KS kế (nếu có).
        setKsPhiHuyPending(pendings[0]);
        setSaveStatus("pending"); // giữ trạng thái chờ — modal quyết tiếp
        return;
      }

      // Gate #2 — đêm đang giữ tiền bị gỡ / bị gán sang KS khác. checkKsPhiHuyOnChange
      // BỎ QUA những ca này (nó chỉ lo khi KS biến mất hẳn khỏi tour), nên trước đây OP
      // gỡ một đêm đã trả tiền mà không được báo một chữ nào.
      //
      // Lọc bỏ cảnh báo mà OP ĐÃ xác nhận (mọi đêm của nó nằm trong ksBotDemOkRef) rồi
      // hỏi cái còn lại đầu tiên — gate tự lặp qua từng cảnh báo như gate #1, KHÔNG để
      // "đồng ý 1 cái = đồng ý tất".
      const canhBao = (await checkKsBotDemOnChange({ doanId, days, dbNgayRows })).filter(
        (cb) => !cb.demDinhTien.every((d) => ksBotDemOkRef.current.has(d.dayId)),
      );
      if (canhBao.length > 0) {
        setKsBotDem(canhBao[0]);
        setSaveStatus("pending");
        return;
      }
    } catch (e) {
      // KS dính ĐNTT không thuộc riêng đoàn này (thanh toán định kỳ): KHÔNG đổi được,
      // nhưng cũng KHÔNG được để autosave chết cả tour. Trả riêng những ngày đó về KS
      // cũ rồi lưu tiếp mọi thay đổi khác của OP.
      if (e instanceof KsDnttNgoaiPhamViError) {
        ksGateBusyRef.current = false;
        setDays((prev) => prev.map((d) =>
          d.id && e.dayIds.includes(d.id) ? { ...d, khach_san_id: e.oldKsId } : d,
        ));
        toast.error(e.message, { duration: 14000 });
        rerunGateSoon(); // lưu phần còn lại sau khi days đã revert
        return;
      }
      setSaveStatus("error");
      toast.error(errMsg(e) || t("Lỗi kiểm tra đổi khách sạn"), { duration: 12000 });
      return;
    } finally {
      ksGateBusyRef.current = false;
    }
    ksCommittedRef.current = false; // gate sạch → lượt đổi kết thúc, reset cờ batch
    ksBotDemOkRef.current.clear(); // lượt đổi xong → lần sửa sau phải hỏi lại từ đầu
    runSave();
  }, [doanId, days, dbNgayRows, ksPhiHuyPending, ksBotDem, runSave, rerunGateSoon]);

  // ── Cảnh báo "đêm đang giữ tiền" — 3 lối thoát, không lối nào tự đụng tiền ──────
  const botDemGiuNguyen = useCallback(() => {
    const cb = ksBotDem;
    setKsBotDem(null);
    if (!cb) return;
    // Hoàn tác ĐÚNG những đêm bị cảnh báo, giữ nguyên mọi sửa đổi khác của OP trong
    // cùng lượt (cảnh điểm, số khách…) — không để một cảnh báo giết cả lần lưu.
    const dayIds = cb.demDinhTien.map((d) => d.dayId);
    setDays((prev) => prev.map((d) => {
      if (!d.id || !dayIds.includes(d.id)) return d;
      const db = dbNgayRows.find((r) => r.id === d.id);
      return { ...d, khach_san_id: db?.khach_san_id ?? null };
    }));
    rerunGateSoon();
  }, [ksBotDem, dbNgayRows, rerunGateSoon]);

  const botDemTiepTuc = useCallback(() => {
    // Đánh dấu ĐÚNG những đêm vừa xác nhận (không tắt cả gate) → cảnh báo còn lại vẫn hỏi.
    ksBotDem?.demDinhTien.forEach((d) => ksBotDemOkRef.current.add(d.dayId));
    setKsBotDem(null);
    rerunGateSoon();
  }, [ksBotDem, rerunGateSoon]);

  // Xử tiền trước, đổi lịch sau → hoàn tác lịch trình rồi mới sang tab Chi phí.
  const botDemMoChiPhi = useCallback(() => {
    botDemGiuNguyen();
    setActiveTab("chi-phi");
  }, [botDemGiuNguyen]);

  // Ghi DB cho 1 pending rồi chạy lại gate. Dùng chung cho cả 3 lối: xác nhận, để sau,
  // và "sau khi mail hủy đã gửi xong" (KsHuyMailModal.onSent).
  const applyKsChange = useCallback(async (
    pending: KsPhiHuyPending, phiHuy: number, lyDo: string, mode: "phi_huy" | "de_sau",
  ) => {
    if (!doanId) return;
    // KS cũ không dính ĐNTT nào → chỉ đánh dấu booking, tuyệt đối không đụng chi phí.
    const realMode = pending.hasMoney ? mode : "booking_only";
    const r = await doiKsMut.mutateAsync({
      doanId, pending, phiHuyInput: phiHuy, lyDo: lyDo || null, mode: realMode,
    });
    if (realMode === "booking_only") {
      toast.success(
        `${t("Đã đánh dấu booking")} ${pending.oldKsName} ${t("chờ KS xác nhận hủy")}`,
        { duration: 6000 },
      );
    } else if (realMode === "de_sau") {
      toast.warning(
        `${t("KS")} ${pending.oldKsName} ${t("chuyển sang mục KS ngoài tour — cần xử lý phí hủy ở tab Chi phí.")}`,
        { duration: 8000 },
      );
    } else {
      toast.success(
        `${t("Đã tách KS")} ${pending.oldKsName} — ${t("phí hủy")} ${r.phiHuy.toLocaleString("vi-VN")} ₫` +
        (r.refund > 0 ? ` · ${t("công nợ thu hồi")} ${r.refund.toLocaleString("vi-VN")} ₫` : ""),
        { duration: 8000 },
      );
    }
    // Đã ghi DB cho KS này → không hoàn tác được nữa (booking đổi trạng thái, tiền tách,
    // công nợ tạo). Cờ này chặn "Hủy đổi KS" ở KS kế tiếp revert `days` về DB, vốn sẽ
    // làm KS vừa xử lý HỒI SINH vào lịch trình dù booking đã hủy.
    ksCommittedRef.current = true;
    setKsPhiHuyPending(null);
    setKsHuyMail(null);
    rerunGateSoon();
  }, [doanId, doiKsMut, rerunGateSoon]);

  // Tích "gửi mail hủy" → soạn mail TRƯỚC (bắt soát), ghi DB SAU (onSent). Không tích →
  // ghi DB luôn. Xem lý do thứ tự này ở đầu KsHuyMailModal.
  const dispatchKsChange = useCallback(async (
    args: DoiKsConfirmArgs, mode: "phi_huy" | "de_sau",
  ) => {
    const pending = ksPhiHuyPending;
    if (!doanId || !pending) return;
    if (args.sendHuyMail && pending.booking?.email) {
      setKsHuyMail({ pending, phiHuy: args.phiHuy, lyDo: args.lyDo, mode });
      return;
    }
    try {
      await applyKsChange(pending, args.phiHuy, args.lyDo, mode);
    } catch (e) {
      toast.error(errMsg(e) || t("Lỗi tách phí hủy"));
    }
  }, [doanId, ksPhiHuyPending, applyKsChange]);

  const handleKsPhiHuyConfirm = useCallback(
    (args: DoiKsConfirmArgs) => { void dispatchKsChange(args, "phi_huy"); },
    [dispatchKsChange],
  );

  const handleKsPhiHuyDefer = useCallback(
    (args: DoiKsConfirmArgs) => { void dispatchKsChange(args, "de_sau"); },
    [dispatchKsChange],
  );

  const handleKsPhiHuyCancel = useCallback(() => {
    const pending = ksPhiHuyPending;
    const daCoKsDaXuLy = ksCommittedRef.current;
    setKsPhiHuyPending(null);
    setKsHuyMail(null);

    if (daCoKsDaXuLy && pending) {
      // Đổi NHIỀU KS một lượt và KS trước đã ghi DB (booking hủy, tiền tách, công nợ).
      // KHÔNG được revert toàn bộ `days` về DB — sẽ dựng lại KS đã hủy vào lịch trình.
      // Chỉ trả riêng các ngày của KS đang hỏi về giá trị cũ, rồi lưu tiếp phần còn lại.
      // (Trả về đúng những ngày này cũng khiến gate không hỏi lại chính KS đó → không lặp.)
      setDays((prev) => prev.map((d) =>
        d.id && pending.dayIds.includes(d.id) ? { ...d, khach_san_id: pending.oldKsId } : d,
      ));
      toast.warning(
        `${t("Giữ nguyên")} ${pending.oldKsName}. ${t("Các khách sạn đã xử lý trước đó không hoàn tác được.")}`,
        { duration: 8000 },
      );
      rerunGateSoon();
      return;
    }

    // Chưa xử KS nào: bỏ pending + re-sync days từ DB (KS quay về cũ, không lưu gì)
    hasPendingChangesRef.current = false;
    setSaveStatus("idle");
    queryClient.invalidateQueries({ queryKey: ["doan_ngay", doanId] });
    queryClient.invalidateQueries({ queryKey: ["doan_ngay_item", doanId] });
  }, [doanId, queryClient, ksPhiHuyPending, rerunGateSoon]);

  // Keep ref updated so timer always calls latest doSave
  doSaveRef.current = doSave;

  const scheduleSave = useCallback(() => {
    if (!canEdit || !doanId) return;
    setSaveStatus("pending");
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
  // Quà tặng = HDV mang theo cho khách. Tick quà ở Điều tour → tự thêm 1 row
  // "hdv_ho_tro" "{Quà} tặng khách" để hiện trong section "Khác" của Chi phí
  // HDV; bỏ tick → xóa row. Đơn giá mặc định / khách theo GIFT_DON_GIA (quà
  // chưa có giá → 0, OP nhập sau). Nguồn mặc định HDV (HDV ứng, quyết toán sau).
  const handleSetGifts = useCallback((next: string[]) => {
    const prev = gifts;
    setGifts(next);
    scheduleSave();
    if (!doanId) return;
    const invalidateHdv = () =>
      queryClient.invalidateQueries({ queryKey: ["chi_phi_hdv_section", doanId] });
    const added = next.filter((g) => !prev.includes(g));
    const removed = prev.filter((g) => !next.includes(g));
    const soKhach = totalKhach || doan?.so_khach || 0;
    for (const gift of added) {
      const moTa = giftMoTa(gift);
      const exists = chiPhiRows.some((c) => c.mo_ta === moTa && c.danh_muc === "hdv_ho_tro");
      if (exists || soKhach <= 0) continue;
      const donGia = GIFT_DON_GIA[gift] ?? 0;
      upsertChiPhi.mutate({
        doan_id: doanId,
        mo_ta: moTa,
        danh_muc: "hdv_ho_tro",
        loai: "khac",
        so_luong: soKhach,
        don_gia: donGia,
        tien_cong_ty: 0,
        tien_hdv: donGia * soKhach,
      }, { onSuccess: invalidateHdv });
    }
    for (const gift of removed) {
      const moTa = giftMoTa(gift);
      const row = chiPhiRows.find((c) => c.mo_ta === moTa && c.danh_muc === "hdv_ho_tro");
      if (row) {
        deleteChiPhi.mutate(
          { id: row.id, doanId, mo_ta: row.mo_ta, danh_muc: row.danh_muc },
          {
            onSuccess: invalidateHdv,
            // Row đã nằm trong ĐNTT → useDeleteChiPhi chặn (giữ row). Báo OP.
            onError: (e: unknown) => toast.error(errMsg(e) || t("Không xóa được quà đã có ĐNTT")),
          },
        );
      }
    }
  }, [gifts, scheduleSave, doanId, totalKhach, doan?.so_khach, chiPhiRows, upsertChiPhi, deleteChiPhi, queryClient]);
  const handleSetGhiChuDieuTour = useCallback((v: string) => { setGhiChuDieuTour(v); scheduleSave(); }, [scheduleSave]);
  const handleSetThuTip = useCallback((v: boolean) => { setThuTip(v); scheduleSave(); }, [scheduleSave]);
  const handleSetTipRate = useCallback((v: number | null) => { setTipRate(v); scheduleSave(); }, [scheduleSave]);
  const handleSetTipSoNgayOverride = useCallback((v: number | null) => { setTipSoNgayOverride(v); scheduleSave(); }, [scheduleSave]);
  const handleSetTipSoKhachOverride = useCallback((v: number | null) => { setTipSoKhachOverride(v); scheduleSave(); }, [scheduleSave]);
  const handleSetTipLumpSum = useCallback((v: number | null) => { setTipLumpSum(v); scheduleSave(); }, [scheduleSave]);
  const handleSetDays = useCallback((v: DayLocal[]) => {
    hasPendingChangesRef.current = true;
    setDays(v);
    scheduleSave();
  }, [scheduleSave]);

  // Ghép HDV chính + phụ thành 1 chuỗi cho export Word + mail. Format:
  //   "A — sdt | B — sdt" (chỉ A nếu không có phụ; "" nếu không có ai).
  const hdvDisplayStr = useMemo(() => {
    if (!doan) return "";
    type HdvJoin = { ten?: string | null; so_dien_thoai?: string | null } | null | undefined;
    const fmt = (h: HdvJoin) =>
      h?.so_dien_thoai?.trim() ? `${h.ten} — ${h.so_dien_thoai.trim()}` : h?.ten ?? "";
    return ([doan.huong_dan_vien, doan.huong_dan_vien_2] as HdvJoin[])
      .filter((h) => h?.ten)
      .map(fmt)
      .join(" | ");
  }, [doan]);

  // OP phụ trách (doan.assigned_to) → "Tên — SĐT" cho bảng điều tour in ra.
  const opDisplayStr = useMemo(() => {
    if (!doan?.assigned_to) return "";
    const u = userRoles?.find((r) => r.user_id === doan.assigned_to);
    if (!u) return "";
    const sdt = u.so_dien_thoai?.trim();
    return sdt ? `${u.ho_ten} — ${sdt}` : u.ho_ten ?? "";
  }, [doan?.assigned_to, userRoles]);

  const dieuTourExportData = useMemo((): DieuTourExportData | null => {
    if (!doan) return null;
    return {
      days,
      canhDiemList,
      nhaHangList,
      khachSanList,
      tenDoan: doan.ten_doan ?? "",
      hdv: hdvDisplayStr,
      op: opDisplayStr,
      xe: doan.xe ?? null,
      xe_2: doan.xe_2 ?? null,
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
      setMenuList: allSetMenus,
      coTinhSuatTLNhaHang,
      thuTip,
      tipRate,
    };
  }, [doan, hdvDisplayStr, opDisplayStr, days, canhDiemList, nhaHangList, khachSanList, allSetMenus, bangDon, shopping, truongDoan, chuyenBayDon, chuyenBayTien, soKhachLon, soKhachEm1, soKhachEm2, soKhachTl, totalKhach, chuThichKhach, coTinhSuatTLNhaHang, gifts, ghiChuDieuTour, thuTip, tipRate]);

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
          <ArrowLeft className="h-4 w-4 mr-1.5" /> {t("Danh sách đoàn")}
        </Button>
        <p className="mt-8 text-center text-muted-foreground">{t("Không tìm thấy đoàn.")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Tabs defaultValue="dieu-tour" value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Sticky bar: header + tabs — luôn thấy khi scroll xuống */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border print-hide">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-2 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => navigate("/doan")}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> {t("Danh sách đoàn")}
                </Button>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold">{doan.ten_doan}</span>
              </div>
              <div className="flex items-center gap-2">
                {!canEdit && (
                  <span className="text-xs text-muted-foreground border rounded px-2 py-1">{t("Chỉ xem")}</span>
                )}
                {canEdit && saveStatus !== "idle" && (
                  <span className={cn(
                    "text-xs px-2 py-1 rounded",
                    saveStatus === "pending" && "text-muted-foreground/70",
                    saveStatus === "saving" && "text-muted-foreground",
                    saveStatus === "saved" && "text-green-600",
                    saveStatus === "error" && "text-red-600"
                  )}>
                    {saveStatus === "pending" && t("Chờ lưu…")}
                    {saveStatus === "saving" && t("Đang lưu...")}
                    {saveStatus === "saved" && `✓ ${t("Đã lưu")}`}
                    {saveStatus === "error" && t("Lỗi lưu")}
                  </span>
                )}
              </div>
            </div>

            <TabsList>
              <TabsTrigger value="dieu-tour">{t("Điều Tour")}</TabsTrigger>
              <TabsTrigger value="booking-ks">{t("Booking KS")}<TabBadge count={bookingKSBadgeCount} /></TabsTrigger>
              <TabsTrigger value="menu">{t("Booking NH")}<TabBadge count={bookingNHBadgeCount} /></TabsTrigger>
              <TabsTrigger value="booking-visa-xe">{t("Visa & Xe")}</TabsTrigger>
              <TabsTrigger value="booking-dv">{t("Booking DV")}</TabsTrigger>
              {doan?.kieu_gom === "ghep" && (
                <TabsTrigger value="khach-le">{t("Khách lẻ")}</TabsTrigger>
              )}
              {canViewChiPhi && (
                <TabsTrigger value="chi-phi">{t("Chi phí")}<TabBadge count={chiPhiBadgeCount} /></TabsTrigger>
              )}
              <TabsTrigger value="tai-lieu">{t("Tài liệu")}</TabsTrigger>
              <TabsTrigger value="log">{t("Log")}</TabsTrigger>
              <TabsTrigger value="khao-sat">{t("Khảo sát khách")}</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">

          <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0 [&:disabled]:opacity-100">
          <TabsContent value="dieu-tour" className="mt-4 space-y-6">
            {doanId != null && (
              <DoanNhomTabs
                doanId={doanId}
                activeNhomId={activeNhomId}
                onActiveNhomChange={setActiveNhomId}
                doanTotal={doanSoKhachLon + doanSoKhachEm1 + doanSoKhachEm2 + doanSoKhachTl}
                doanSoKhachLon={doanSoKhachLon}
                doanSoKhachEm1={doanSoKhachEm1}
                doanSoKhachEm2={doanSoKhachEm2}
                doanSoKhachTl={doanSoKhachTl}
              />
            )}
            <div className="flex justify-end gap-2 print-hide">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowRemap(true)}
                disabled={days.length === 0}
                title="Dời nhà hàng đã đặt sang ngày khác, giữ nguyên booking & thanh toán"
              >
                <CalendarCog className="h-3.5 w-3.5" />
                Xếp lại NH theo ngày
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowWordPreview(true)}
                disabled={days.length === 0}
              >
                <FileDown className="h-3.5 w-3.5" />
                {t("Xuất Word")}
              </Button>
            </div>
            <CompanyHeader />
            <DoanInfoSection
              doan={doan}
              op={opDisplayStr}
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
              totalFromDoan={totalKhach}
              chuThichKhach={chuThichKhach}
              setChuThichKhach={handleSetChuThichKhach}
              coTinhSuatTLNhaHang={coTinhSuatTLNhaHang}
              setCoTinhSuatTLNhaHang={handleSetCoTinhSuatTLNhaHang}
            />
            <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <GiftTagsSection gifts={gifts} setGifts={handleSetGifts} />
            <TipSection
              soKhach={totalKhach || doan?.so_khach || 0}
              soKhachTl={soKhachTl}
              ngayDi={doan?.ngay_di ?? null}
              ngayVe={doan?.ngay_ve ?? null}
              thuTip={thuTip}
              tipRate={tipRate}
              tipSoNgayOverride={tipSoNgayOverride}
              tipSoKhachOverride={tipSoKhachOverride}
              tipLumpSum={tipLumpSum}
              onThuTipChange={handleSetThuTip}
              onTipRateChange={handleSetTipRate}
              onTipSoNgayOverrideChange={handleSetTipSoNgayOverride}
              onTipSoKhachOverrideChange={handleSetTipSoKhachOverride}
              onTipLumpSumChange={handleSetTipLumpSum}
            />
            </div>
            <DayScheduleTable
              days={days}
              setDays={handleSetDays}
              canhDiemList={canhDiemList}
              nhaHangList={nhaHangList}
              khachSanList={khachSanList}
              doanId={doanId}
              allowDayMutation={false}
            />
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">📝 {t("Ghi chú điều tour")}</h3>
              <Textarea
                value={ghiChuDieuTour}
                onChange={(e) => handleSetGhiChuDieuTour(e.target.value)}
                placeholder={t("Nhập ghi chú...")}
                rows={4}
                className="resize-none text-sm"
              />
            </div>
            <DieuTourWordPreviewModal
              open={showWordPreview}
              data={dieuTourExportData}
              onClose={() => setShowWordPreview(false)}
              onGhiChuSave={handleSetGhiChuDieuTour}
            />
            {doanId != null && (
              <RemapNgayModal doanId={doanId} open={showRemap} onClose={() => setShowRemap(false)} />
            )}
            <DoiKsPhiHuyModal
              /* Ẩn khi bản nháp mail đang mở — 2 dialog chồng nhau. */
              pending={ksHuyMail ? null : ksPhiHuyPending}
              submitting={doiKsMut.isPending}
              onConfirm={handleKsPhiHuyConfirm}
              onDefer={handleKsPhiHuyDefer}
              onCancel={handleKsPhiHuyCancel}
            />
            {ksHuyMail?.pending.booking && (
              <KsHuyMailModal
                target={{
                  bookingId: ksHuyMail.pending.booking.bookingId,
                  khachSanTen: ksHuyMail.pending.oldKsName,
                  email: ksHuyMail.pending.booking.email,
                  emailThreadId: ksHuyMail.pending.booking.emailThreadId,
                  emailSubject: ksHuyMail.pending.booking.emailSubject,
                  roomDates: ksHuyMail.pending.booking.roomDates,
                }}
                tenDoan={doan?.ten_doan ?? ""}
                lyDo={ksHuyMail.lyDo}
                onSent={() => applyKsChange(
                  ksHuyMail.pending, ksHuyMail.phiHuy, ksHuyMail.lyDo, ksHuyMail.mode,
                )}
                /* Đóng bản nháp = quay lại modal phí hủy, KHÔNG hủy cả thao tác đổi KS
                   (OP thường chỉ muốn sửa lý do rồi soạn lại). */
                onCancel={() => setKsHuyMail(null)}
              />
            )}
          </TabsContent>

          <TabsContent value="booking-ks" className="mt-4">
            <BookingKSTab doanId={doanId} tenDoan={doan.ten_doan ?? ""} ngayDi={doan.ngay_di} soKhach={doan.so_khach ?? undefined} />
          </TabsContent>

          <TabsContent value="menu" className="mt-4">
            <BookingNHTab
              doanId={doanId}
              tenDoan={doan.ten_doan ?? ""}
              soKhach={coTinhSuatTLNhaHang ? (totalKhach || doan.so_khach || 0) : ((totalKhach - soKhachTl) || doan.so_khach || 0)}
              soNoidBo={soKhachTl > 0 && !coTinhSuatTLNhaHang ? 3 : 2}
              soKhachLon={coTinhSuatTLNhaHang ? soKhachLon + soKhachTl : soKhachLon}
              soKhachEm1={soKhachEm1}
              soKhachEm2={soKhachEm2}
              hdvTen={hdvDisplayStr}
            />
          </TabsContent>

          <TabsContent value="booking-visa-xe" className="mt-4">
            <BookingVisaXeTab
              doanId={doanId}
              tenDoan={doan.ten_doan ?? ""}
              ngayDi={doan.ngay_di}
              ngayVe={doan.ngay_ve}
              chuyenBayDon={doan.chuyen_bay_don}
              chuyenBayTien={doan.chuyen_bay_tien}
              hdvName={hdvDisplayStr || null}
              soKhach={doan.so_khach}
              soKhachLon={soKhachLon}
              soKhachEm1={soKhachEm1}
              soKhachEm2={soKhachEm2}
              soKhachTl={soKhachTl}
              xe={doan.xe ?? null}
              xe2={doan.xe_2 ?? null}
              dieuTourExportData={dieuTourExportData}
              loaiTour={doan.loai_tour}
            />
          </TabsContent>

          <TabsContent value="booking-dv" className="mt-4">
            <BookingDVTab
              doanId={doanId}
              tenDoan={doan.ten_doan ?? ""}
              ngayDi={doan.ngay_di}
            />
          </TabsContent>

          {canViewChiPhi && (
            <TabsContent value="chi-phi" className="mt-4">
              {/* Phase 3: KHÔNG hiện DoanNhomTabs ở Chi phí tab.
                  Chi phí query cả 2 nhóm gộp lại, merge same NH-bữa hoặc same cảnh điểm. */}
              <ChiPhiTab
                doanId={doanId}
                doan={doan}
                coTinhSuatTLNhaHang={coTinhSuatTLNhaHang}
              />
            </TabsContent>
          )}

          <TabsContent value="tai-lieu" className="mt-4">
            <DoanTaiLieuTab doanId={doanId} />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <DoanLogTab doanId={doanId} />
          </TabsContent>

          {doan?.kieu_gom === "ghep" && (
            <TabsContent value="khach-le" className="mt-4">
              {doanId != null && (
                <KhachLeTab doanId={doanId} canEdit={canEdit} />
              )}
            </TabsContent>
          )}
          </fieldset>

          <TabsContent value="khao-sat" className="mt-4">
            {doanId != null && <KhaoSatTab doanId={doanId} />}
          </TabsContent>
        </div>
      </Tabs>

      {/* Cảnh báo "đêm giữ tiền" render Ở CẤP TRANG (ngoài Tabs): nếu để trong TabsContent
          "dieu-tour", Radix unmount nó khi OP sang tab khác → autosave (debounce 1500ms) nổ
          gate #2 lúc đó sẽ set ksBotDem nhưng dialog KHÔNG hiện, mà ksBotDem lại chặn mọi
          save tiếp → thay đổi kẹt/mất im lặng. */}
      <KsBotDemCanhBaoDialog
        canhBao={ksBotDem}
        onTiepTuc={botDemTiepTuc}
        onGiuNguyen={botDemGiuNguyen}
        onMoChiPhi={botDemMoChiPhi}
      />
    </div>
  );
}
