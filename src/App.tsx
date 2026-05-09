import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import DashboardPage from "./pages/DashboardPage.tsx";
import Index from "./pages/Index.tsx";
import DoanDetail from "./pages/DoanDetail.tsx";
import NhaHangPage from "./pages/NhaHangPage.tsx";
import KhachSanPage from "./pages/KhachSanPage.tsx";
import CanhDiemPage from "./pages/CanhDiemPage.tsx";
import NhaCungCapPage from "./pages/NhaCungCapPage.tsx";
import DNTTPage from "./pages/DNTTPage.tsx";
import CongNoPage from "./pages/CongNoPage.tsx";
import ThanhToanDinhKyPage from "./pages/ThanhToanDinhKyPage.tsx";
import HDVPage from "./pages/HDVPage.tsx";
import NguoiDungPage from "./pages/NguoiDungPage.tsx";
import NhaXePage from "./pages/NhaXePage.tsx";
import VisaPage from "./pages/VisaPage.tsx";
import HoaDonUNCPage from "./pages/HoaDonUNCPage.tsx";
import SeriPage from "./pages/SeriPage.tsx";
import TheodoiPage from "./pages/TheodoiPage.tsx";
import XepHDVPage from "./pages/XepHDVPage.tsx";
import MyJobPage from "./pages/MyJobPage.tsx";
import LockPhongPage from "./pages/LockPhongPage.tsx";
import InvoicePage from "./pages/InvoicePage.tsx";
import BaoGiaPage from "./pages/BaoGiaPage.tsx";
import TeamAssignmentPage from "./pages/TeamAssignmentPage.tsx";
import LeadsPage from "./pages/LeadsPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import NotFound from "./pages/NotFound.tsx";

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

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

          {/* Protected — yêu cầu đăng nhập */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
