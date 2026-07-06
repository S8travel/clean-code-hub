import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useKhaoSatOverview } from "@/hooks/use-khao-sat";

// Định dạng số 2 chữ số cho ghép 'YYYY-MM-DD'.
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Ngày cuối tháng (month = 0..11) → ngày 0 của tháng kế = ngày cuối tháng hiện tại.
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// dd/MM/YYYY từ chuỗi 'YYYY-MM-DD' (an toàn, không lệ thuộc timezone).
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Trung bình chung → 2 chữ số thập phân hoặc "—".
function fmtAvg(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

export default function KhaoSatOverviewPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0..11

  const { fromDate, toDate } = useMemo(() => {
    const from = `${year}-${pad2(month + 1)}-01`;
    const to = `${year}-${pad2(month + 1)}-${pad2(lastDayOfMonth(year, month))}`;
    return { fromDate: from, toDate: to };
  }, [year, month]);

  const { data: rows = [], isLoading, isError } = useKhaoSatOverview(fromDate, toDate);

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Màu dòng: vàng = chưa ai điền; hồng = có điền nhưng TB < 4.
  const rowClass = (soResponse: number | null, tbChung: number | null): string => {
    const resp = soResponse ?? 0;
    if (resp === 0) return "bg-yellow-50 hover:bg-yellow-100";
    if (tbChung !== null && tbChung < 4) return "bg-pink-50 hover:bg-pink-100";
    return "hover:bg-muted/50";
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header + điều hướng tháng */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Khảo sát khách hàng
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Tháng trước">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[110px] text-center text-sm font-semibold">
            Thg {month + 1}/{year}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Tháng sau">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend màu */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border border-yellow-300 bg-yellow-50" />
          Chưa ai điền
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border border-pink-300 bg-pink-50" />
          Trung bình dưới 4
        </span>
      </div>

      {/* Bảng */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-[#E6F1FB]">
              <TableHead className="w-12 text-center">STT</TableHead>
              <TableHead className="whitespace-nowrap">Ngày đi</TableHead>
              <TableHead className="whitespace-nowrap">Mã đoàn</TableHead>
              <TableHead>Điểm đến</TableHead>
              <TableHead>OP</TableHead>
              <TableHead className="text-center whitespace-nowrap">Số khách</TableHead>
              <TableHead className="text-center whitespace-nowrap">Đã điền</TableHead>
              <TableHead className="text-center whitespace-nowrap">Điểm ≤2</TableHead>
              <TableHead className="text-center whitespace-nowrap">Trung bình</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-red-600">
                  Lỗi tải dữ liệu khảo sát.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  Không có đoàn khởi hành trong tháng {month + 1}/{year}.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow
                  key={r.doan_id ?? `row-${i}`}
                  className={cn("transition-colors", rowClass(r.so_response, r.tb_chung))}
                >
                  <TableCell className="text-center">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.ngay_di)}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {r.doan_id ? (
                      <Link to={`/doan/${r.doan_id}`} className="text-blue-600 hover:underline">
                        {r.ten_doan ?? `#${r.doan_id}`}
                      </Link>
                    ) : (
                      r.ten_doan ?? "—"
                    )}
                  </TableCell>
                  <TableCell>{r.team_name ?? "—"}</TableCell>
                  <TableCell>{r.op_name ?? "—"}</TableCell>
                  <TableCell className="text-center">{r.so_khach ?? "—"}</TableCell>
                  <TableCell className="text-center font-medium">{r.so_response ?? 0}</TableCell>
                  <TableCell className="text-center">
                    {(r.so_thap_diem ?? 0) > 0 ? (
                      <span className="font-semibold text-red-600">{r.so_thap_diem}</span>
                    ) : (
                      r.so_thap_diem ?? 0
                    )}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{fmtAvg(r.tb_chung)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
