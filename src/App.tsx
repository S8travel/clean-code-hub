import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
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
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/doan" element={<Index />} />
            <Route path="/doan/:id" element={<DoanDetail />} />
            <Route path="/quan-ly/nha-hang" element={<NhaHangPage />} />
            <Route path="/quan-ly/khach-san" element={<KhachSanPage />} />
            <Route path="/quan-ly/canh-diem" element={<CanhDiemPage />} />
            <Route path="/quan-ly/nha-cung-cap" element={<NhaCungCapPage />} />
            <Route path="/de-nghi-thanh-toan" element={<DNTTPage />} />
            <Route path="/thanh-toan-dinh-ky" element={<ThanhToanDinhKyPage />} />
            <Route path="/cong-no" element={<CongNoPage />} />
            <Route path="/quan-ly/hdv" element={<HDVPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
