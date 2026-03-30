export default function CompanyHeader() {
  const today = new Date();
  const dayStr = today.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="print:break-inside-avoid">
      {/* Company + National header */}
      <div className="grid grid-cols-2 border border-border rounded-t-lg overflow-hidden">
        {/* Left: Company */}
        <div className="flex items-center gap-3 p-4 border-r border-border">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white font-bold text-xl shrink-0" style={{ backgroundColor: "#185FA5" }}>
            S8
          </div>
          <div className="text-center flex-1">
            <p className="font-bold text-sm">CÔNG TY TNHH DU LỊCH S8</p>
            <p className="text-xs text-muted-foreground">S8 TRAVEL COMPANY</p>
            <p className="text-xs text-muted-foreground">MST: 0402021137</p>
          </div>
        </div>
        {/* Right: National */}
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p className="text-sm font-semibold">Độc lập – Tự do – Hạnh phúc</p>
          <hr className="w-24 border-t border-foreground my-1" />
          <p className="text-xs text-muted-foreground italic">Hà Nội, ngày {dayStr}</p>
        </div>
      </div>
      {/* Title bar */}
      <div className="border border-t-0 border-border bg-muted/30 py-3 text-center rounded-b-lg">
        <h2 className="text-lg font-bold tracking-[0.15em] uppercase">BẢNG ĐIỀU TOUR</h2>
      </div>
    </div>
  );
}
