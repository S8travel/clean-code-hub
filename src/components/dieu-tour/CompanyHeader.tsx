export default function CompanyHeader() {
  const today = new Date();
  const dayStr = today.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="print:break-inside-avoid border border-border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-1 md:grid-cols-3 items-center">
        {/* Left: Company */}
        <div className="flex items-center gap-3 p-4 border-b md:border-b-0 md:border-r border-border">
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0">
            <img src="/logo.jpg" alt="S8 Logo" className="w-full h-full object-contain" />
          </div>
          <div className="text-center md:text-left flex-1">
            <p className="font-bold text-sm">CÔNG TY TNHH DU LỊCH S8</p>
            <p className="text-xs text-muted-foreground">S8 TRAVEL COMPANY</p>
            <p className="text-xs text-muted-foreground">MST: 0402021137</p>
          </div>
        </div>
        {/* Center: Title */}
        <div className="flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-border">
          <h2 className="text-xl md:text-2xl font-bold tracking-[0.12em] uppercase text-primary text-center">
            BẢNG ĐIỀU TOUR
          </h2>
        </div>
        {/* Right: National */}
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p className="text-[13px] font-semibold">Độc lập – Tự do – Hạnh phúc</p>
          <hr className="w-24 border-t border-foreground my-1" />
          <p className="text-xs text-muted-foreground italic">Hà Nội, ngày {dayStr}</p>
        </div>
      </div>
    </div>
  );
}
