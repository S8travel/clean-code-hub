import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProtectedLayout } from "@/components/ProtectedLayout";

// EAGER — entry / core pages dùng liên tục
import LoginPage from "./pages/LoginPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import Index from "./pages/Index.tsx";
import DoanDetail from "./pages/DoanDetail.tsx";

// LAZY — split bundle, chỉ tải khi truy cập route
const NhaHangPage          = lazy(() => import("./pages/NhaHangPage.tsx"));
const KhachSanPage         = lazy(() => import("./pages/KhachSanPage.tsx"));
const CanhDiemPage         = lazy(() => import("./pages/CanhDiemPage.tsx"));
const NhaCungCapPage       = lazy(() => import("./pages/NhaCungCapPage.tsx"));
const DNTTPage             = lazy(() => import("./pages/DNTTPage.tsx"));
const CongNoPage           = lazy(() => import("./pages/CongNoPage.tsx"));
const ThanhToanDinhKyPage  = lazy(() => import("./pages/ThanhToanDinhKyPage.tsx"));
const HDVPage              = lazy(() => import("./pages/HDVPage.tsx"));
const NguoiDungPage        = lazy(() => import("./pages/NguoiDungPage.tsx"));
const NhaXePage            = lazy(() => import("./pages/NhaXePage.tsx"));
const VisaPage             = lazy(() => import("./pages/VisaPage.tsx"));
const HoaDonUNCPage        = lazy(() => import("./pages/HoaDonUNCPage.tsx"));
const SeriPage             = lazy(() => import("./pages/SeriPage.tsx"));
const TheodoiPage          = lazy(() => import("./pages/TheodoiPage.tsx"));
const XepHDVPage           = lazy(() => import("./pages/XepHDVPage.tsx"));
const MyJobPage            = lazy(() => import("./pages/MyJobPage.tsx"));
const LockPhongPage        = lazy(() => import("./pages/LockPhongPage.tsx"));
const InvoicePage          = lazy(() => import("./pages/InvoicePage.tsx"));
const BaoGiaPage           = lazy(() => import("./pages/BaoGiaPage.tsx"));
const TeamAssignmentPage   = lazy(() => import("./pages/TeamAssignmentPage.tsx"));
const LeadsPage            = lazy(() => import("./pages/LeadsPage.tsx"));
const LeadReportPage       = lazy(() => import("./pages/LeadReportPage.tsx"));
const NotFound             = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Suspense fallback — spinner gọn cho route load
function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected — yêu cầu đăng nhập */}
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Navigate to="/my-job" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/doan" element={<Index />} />
                <Route path="/doan/:id" element={<DoanDetail />} />
                <Route path="/quan-ly/nha-hang" element={<NhaHangPage />} />
                <Route path="/quan-ly/khach-san" element={<KhachSanPage />} />
                <Route path="/quan-ly/canh-diem" element={<CanhDiemPage />} />
                <Route path="/quan-ly/xe" element={<NhaXePage />} />
                <Route path="/quan-ly/visa" element={<VisaPage />} />
                <Route path="/quan-ly/nha-cung-cap" element={<NhaCungCapPage />} />
                <Route path="/de-nghi-thanh-toan" element={<DNTTPage />} />
                <Route path="/thanh-toan-dinh-ky" element={<ThanhToanDinhKyPage />} />
                <Route path="/cong-no" element={<CongNoPage />} />
                <Route path="/quan-ly/hdv" element={<HDVPage />} />
                <Route path="/quan-ly/nguoi-dung" element={<NguoiDungPage />} />
                <Route path="/hoa-don-unc" element={<HoaDonUNCPage />} />
                <Route path="/quan-ly/seri" element={<SeriPage />} />
                <Route path="/theo-doi" element={<TheodoiPage />} />
                <Route path="/xep-hdv" element={<XepHDVPage />} />
                <Route path="/my-job" element={<MyJobPage />} />
                <Route path="/lock-phong" element={<LockPhongPage />} />
                <Route path="/invoice" element={<InvoicePage />} />
                <Route path="/bao-gia" element={<BaoGiaPage />} />
                <Route path="/settings/teams" element={<TeamAssignmentPage />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/leads/bao-cao" element={<LeadReportPage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
