import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { usePermission, useBoPhan } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { format } from "date-fns";
import {
  ChevronLeft, ChevronRight, Loader2, Share2, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useHoaDonUNCList, useHoaDonUNCSummary,
  type HoaDonUNCRow, type TrangThaiDoc,
} from "@/hooks/use-hoa-don-unc";
import { useDoanScope } from "@/hooks/use-doan-scope";
import UncEmailModal from "@/components/hoa-don-unc/UncEmailModal";
import BatchUncDialog from "@/components/hoa-don-unc/BatchUncDialog";
import { HoaDonUNCFilters } from "@/components/hoa-don-unc/HoaDonUNCFilters";
import { HoaDonUNCRow as HoaDonUNCTableRow } from "@/components/hoa-don-unc/HoaDonUNCRow";
import { useDoanOptions, useMarkPaidWithDate } from "@/hooks/use-dntt";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

function HoaDonUNCPageContent() {
  useTranslate();

  // Deep-link từ DNTTPage ("Đi tới thanh toán"): /hoa-don-unc?doan=<id>&tt=chua_tt
  // → filter dựng sẵn, kế toán không phải chọn lại đoàn/trạng thái.
  const [searchParams] = useSearchParams();
  const [doanId, setDoanId] = useState<string>(searchParams.get("doan") ?? "");
  const [loai, setLoai] = useState<string>("");
  const [trangThaiTT, setTrangThaiTT] = useState<string>(() => {
    const tt = searchParams.get("tt");
    return tt === "chua_tt" || tt === "da_tt" ? tt : "";
  });
  const [trangThaiHD, setTrangThaiHD] = useState<string>("");
  const [trangThaiUNC, setTrangThaiUNC] = useState<string>("");
  const [nguonMap, setNguonMap] = useState<Record<number, string>>({});
  // Email modal sau khi upload UNC — state ở page-level để không mất khi
  // list refetch (invalidate ["hoa-don-unc"]) làm DocCell remount.
  const [uncEmailRow, setUncEmailRow] = useState<HoaDonUNCRow | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const markPaidMut = useMarkPaidWithDate();

  const filters = useMemo(() => ({
    doanId: doanId ? Number(doanId) : null,
    loai: loai || null,
    trangThaiTT: (trangThaiTT || "all") as "chua_tt" | "da_tt" | "all",
    trangThaiHoaDon: (trangThaiHD || "all") as TrangThaiDoc | "all",
    trangThaiUNC: (trangThaiUNC || "all") as TrangThaiDoc | "all",
  }), [doanId, loai, trangThaiTT, trangThaiHD, trangThaiUNC]);

  const { data: rowsRaw = [], isLoading } = useHoaDonUNCList(filters);
  const scope = useDoanScope();
  const rows = useMemo(() => scope.filterByDoanId(rowsRaw), [scope, rowsRaw]);
  const { data: summary } = useHoaDonUNCSummary();
  const { data: doanOpts = [] } = useDoanOptions();

  const mainRows = rows;

  // Pagination — 20 row/trang, reset về 1 khi filter đổi
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [doanId, loai, trangThaiTT, trangThaiHD, trangThaiUNC]);
  const totalPages = Math.max(1, Math.ceil(mainRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = mainRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Load can_tru payments per visible DNTT
  const visibleDnttIds = useMemo(() => mainRows.map((r) => r.id), [mainRows]);
  const { data: canTruByDntt = {} as Record<number, number> } = useQuery({
    queryKey: ["hoadon-unc-can-tru", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, so_tien")
        .eq("method", "can_tru")
        .in("dntt_id", visibleDnttIds);
      const m: Record<number, number> = {};
      (data || []).forEach((p) => {
        m[p.dntt_id] = (m[p.dntt_id] || 0) + Number(p.so_tien);
      });
      return m;
    },
  });

  // Load voucher payments per visible DNTT — hiển thị "đã trả bằng voucher X" +
  // cash thực còn phải trả (so_tien − voucher − cấn trừ) trên cột Số tiền.
  const { data: voucherByDntt = {} as Record<number, number> } = useQuery({
    queryKey: ["hoadon-unc-voucher", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, so_tien")
        .eq("method", "voucher")
        .in("dntt_id", visibleDnttIds);
      const m: Record<number, number> = {};
      (data || []).forEach((p) => {
        m[p.dntt_id] = (m[p.dntt_id] || 0) + Number(p.so_tien);
      });
      return m;
    },
  });

  // Load nguồn TT (cash payment có nguon != null) per visible DNTT.
  // Key share prefix với "hoa-don-unc" để tự refetch khi mutation invalidate.
  const { data: nguonByDntt = {} as Record<number, string> } = useQuery({
    queryKey: ["hoa-don-unc", "nguon", visibleDnttIds.join(",")],
    enabled: visibleDnttIds.length > 0,
    queryFn: async () => {
      const { data } = await externalSupabase
        .from("payments")
        .select("dntt_id, nguon, ngay_thanh_toan")
        .eq("method", "cash")
        .in("dntt_id", visibleDnttIds)
        .not("nguon", "is", null)
        .order("ngay_thanh_toan", { ascending: false });
      const m: Record<number, string> = {};
      // Lấy nguồn của payment mới nhất per dntt_id
      (data || []).forEach((p) => { if (!m[p.dntt_id] && p.nguon) m[p.dntt_id] = p.nguon; });
      return m;
    },
  });

  // Load các ĐNTT cọc cùng (doan_id, ref) — để hiển thị "Đã cọc: X".
  // Phải filter cả doan_id: 1 KS có thể được nhiều đoàn cọc → không cross-đoàn.
  const refTriples = useMemo(() => {
    const set = new Set<string>();
    mainRows.forEach((r) => {
      if (r.doan_id != null && r.ref_loai && r.ref_id != null) {
        set.add(`${r.doan_id}|${r.ref_loai}|${r.ref_id}`);
      }
    });
    return [...set];
  }, [mainRows]);

  type SiblingDnttRow = {
    id: number;
    doan_id: number | null;
    ref_loai: string | null;
    ref_id: number | null;
    so_tien: number | null;
    paid_amount: number | null;
    la_coc: boolean | null;
  };
  // Lấy MỌI ĐNTT hiệu lực cùng (đoàn, ref) — NCC xuất 1 hóa đơn gộp cho cả chi phí
  // dù tách nhiều ĐNTT (cọc + [Bổ sung] phát sinh). Trước đây chỉ lấy la_coc=true
  // → mốc so sánh hóa đơn bỏ sót ĐNTT bổ sung → báo lệch giả.
  const { data: siblingDntts = [] as SiblingDnttRow[] } = useQuery({
    queryKey: ["hoadon-unc-ref-siblings", refTriples.join(",")],
    enabled: refTriples.length > 0,
    queryFn: async (): Promise<SiblingDnttRow[]> => {
      const doanIds = [...new Set(refTriples.map((p) => Number(p.split("|")[0])).filter(Number.isFinite))];
      const refLoais = [...new Set(refTriples.map((p) => p.split("|")[1]))];
      const refIds = [...new Set(refTriples.map((p) => Number(p.split("|")[2])).filter(Number.isFinite))];
      if (doanIds.length === 0 || refLoais.length === 0 || refIds.length === 0) return [];
      const { data } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("id, doan_id, ref_loai, ref_id, so_tien, paid_amount, la_coc")
        .in("doan_id", doanIds)
        .in("ref_loai", refLoais)
        .in("ref_id", refIds)
        .not("trang_thai_duyet", "eq", "da_huy")
        .not("trang_thai_duyet", "eq", "tu_choi");
      const validKeys = new Set(refTriples);
      return ((data || []) as SiblingDnttRow[]).filter((d) => validKeys.has(`${d.doan_id}|${d.ref_loai}|${d.ref_id}`));
    },
  });
  // Cọc đã trả (cho hiển thị "Đã cọc") — chỉ ĐNTT la_coc, theo paid_amount.
  const cocByRef = useMemo(() => {
    const m: Record<string, number> = {};
    siblingDntts.forEach((d) => {
      if (!d.la_coc) return;
      const k = `${d.doan_id}|${d.ref_loai}|${d.ref_id}`;
      m[k] = (m[k] || 0) + (d.paid_amount || 0);
    });
    return m;
  }, [siblingDntts]);
  // Tổng so_tien MỌI ĐNTT cùng ref (mốc so sánh hóa đơn gộp — gồm cọc + bổ sung).
  const refSoTienByRef = useMemo(() => {
    const m: Record<string, number> = {};
    siblingDntts.forEach((d) => {
      const k = `${d.doan_id}|${d.ref_loai}|${d.ref_id}`;
      m[k] = (m[k] || 0) + (d.so_tien || 0);
    });
    return m;
  }, [siblingDntts]);

  // Metric cards luôn hiển thị tổng toàn DB, không phụ thuộc filter của list bên dưới.
  const metrics = {
    chuaTT: summary?.chuaTT ?? 0,
    daTT: summary?.daTT ?? 0,
    thieu_hd: summary?.thieu_hd ?? 0,
    thieu_unc: summary?.thieu_unc ?? 0,
  };

  const handleMarkPaid = (id: number, nguon?: string) => {
    markPaidMut.mutate(
      { id, ngayThanhToan: format(new Date(), "yyyy-MM-dd"), nguon: nguon ?? null },
      {
        onSuccess: () => toast({ title: nguon ? `${t("Đã xác nhận TT")} — ${nguon}` : t("Đã xác nhận thanh toán") }),
        onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err) || t("Không thể xác nhận")}`, variant: "destructive" }),
      },
    );
  };

  const resetFilters = () => {
    setDoanId("");
    setLoai("");
    setTrangThaiTT("");
    setTrangThaiHD("");
    setTrangThaiUNC("");
  };

  // Sync sang Google Sheet — gọi edge function sync-dntt-to-sheet
  const [syncing, setSyncing] = useState(false);
  const handleSyncSheet = async () => {
    setSyncing(true);
    try {
      const { data, error } = await externalSupabase.functions.invoke("sync-dntt-to-sheet");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const n = data?.synced ?? 0;
      toast({
        title: n > 0 ? `${t("Đã đồng bộ")} ${n} ${t("DNTT sang Sheet")}` : t("Không có DNTT mới cần sync"),
      });
    } catch (err: unknown) {
      toast({
        title: `${t("Lỗi đồng bộ Sheet")}: ${errMsg(err) || t("Vui lòng thử lại")}`,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const doanSelectOpts = doanOpts.map((d) => ({
    value: String(d.id),
    label: d.ten_doan ?? "",
  }));

  // Gắn UNC nhanh: tất cả ĐNTT chưa có UNC theo bộ lọc hiện tại (mọi đoàn).
  // Nếu đang chọn 1 đoàn thì danh sách đã lọc sẵn → tự thu về đoàn đó.
  const batchRows = useMemo(
    () => mainRows.filter((r) => r.trang_thai_unc === "chua_co"),
    [mainRows],
  );
  const batchScopeLabel = doanId
    ? (doanSelectOpts.find((o) => o.value === doanId)?.label ?? "")
    : `${t("Tất cả")} (${new Set(batchRows.map((r) => r.doan_id)).size} ${t("đoàn")})`;

  const openBatch = () => {
    if (batchRows.length === 0) {
      toast({ title: t("Không còn ĐNTT nào thiếu UNC (theo bộ lọc hiện tại)") });
      return;
    }
    setBatchOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t("Thanh Toán, Hóa Đơn & UNC")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncSheet}
          disabled={syncing}
          className="gap-1.5"
          title={t("Đồng bộ các DNTT đã thanh toán nhưng chưa export sang Google Sheet")}
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {syncing ? t("Đang đồng bộ...") : t("Đồng bộ Sheet")}
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t("Chờ thanh toán"), value: metrics.chuaTT, cls: "text-amber-600" },
          { label: t("Đã thanh toán"), value: metrics.daTT, cls: "text-emerald-600" },
          { label: t("Thiếu hóa đơn"), value: metrics.thieu_hd, cls: "text-red-600" },
          { label: t("Thiếu UNC"), value: metrics.thieu_unc, cls: "text-orange-600" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className={cn("text-2xl font-bold", m.cls)}>{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <HoaDonUNCFilters
        doanSelectOpts={doanSelectOpts}
        doanId={doanId} setDoanId={setDoanId}
        loai={loai} setLoai={setLoai}
        trangThaiHD={trangThaiHD} setTrangThaiHD={setTrangThaiHD}
        trangThaiUNC={trangThaiUNC} setTrangThaiUNC={setTrangThaiUNC}
        trangThaiTT={trangThaiTT} setTrangThaiTT={setTrangThaiTT}
        onReset={resetFilters}
        onOpenBatch={openBatch}
        batchCount={batchRows.length}
      />

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">{t("STT")}</TableHead>
              <TableHead className="min-w-[130px]">{t("Đoàn")}</TableHead>
              <TableHead className="w-[60px]">{t("Loại")}</TableHead>
              <TableHead className="min-w-[180px]">{t("Mô tả")}</TableHead>
              <TableHead className="min-w-[280px]">{t("Nội dung thanh toán")}</TableHead>
              <TableHead className="min-w-[110px] text-right">{t("Số tiền")}</TableHead>
              <TableHead className="w-[100px]">{t("Ngày cần TT")}</TableHead>
              <TableHead className="min-w-[180px]">{t("Thanh toán")}</TableHead>
              <TableHead className="min-w-[160px]">{t("Hóa đơn")}</TableHead>
              <TableHead className="min-w-[160px]">UNC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  {t("Đang tải...")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  {t("Không có dữ liệu")}
                </TableCell>
              </TableRow>
            ) : pageRows.map((row, idx) => {
              const refKey = row.doan_id != null && row.ref_loai && row.ref_id != null
                ? `${row.doan_id}|${row.ref_loai}|${row.ref_id}`
                : null;
              const cocSibling = refKey
                ? Math.max(0, (cocByRef[refKey] || 0) - (row.la_coc ? (row.paid_amount || 0) : 0))
                : 0;
              // Mốc so sánh hóa đơn = tổng MỌI ĐNTT cùng ref (gồm bổ sung) − dòng này.
              const siblingTotal = refKey
                ? Math.max(0, (refSoTienByRef[refKey] || 0) - (row.so_tien || 0))
                : 0;
              return (
                <HoaDonUNCTableRow
                  key={row.id}
                  row={row}
                  stt={(currentPage - 1) * PAGE_SIZE + idx + 1}
                  canTru={canTruByDntt[row.id] || 0}
                  voucherPaid={voucherByDntt[row.id] || 0}
                  cocSibling={cocSibling}
                  siblingTotal={siblingTotal}
                  paidNguon={nguonByDntt[row.id]}
                  selectedNguon={nguonMap[row.id] ?? ""}
                  onSelectNguon={(v) => {
                    setNguonMap(prev => ({ ...prev, [row.id]: v }));
                    // Chọn nguồn = xác nhận TT luôn (yêu cầu user 2026-06-12,
                    // khỏi bấm thêm nút). Nút "Xác nhận TT" giữ làm retry khi lỗi.
                    handleMarkPaid(row.id, v);
                  }}
                  onMarkPaid={() => handleMarkPaid(row.id, nguonMap[row.id])}
                  markPaidPending={markPaidMut.isPending}
                  onUncUploaded={(r, url) =>
                    setUncEmailRow({ ...r, unc_url: url, trang_thai_unc: "da_co" })
                  }
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && mainRows.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {t("Hiển thị")} {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, mainRows.length)} / {mainRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              <ChevronLeft className="h-3 w-3" />
              {t("Trước")}
            </button>
            <span className="px-2 text-muted-foreground">{t("Trang")} {currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
            >
              {t("Sau")}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* UNC email modal — page-level, mở sau khi upload UNC thành công */}
      {uncEmailRow && (
        <UncEmailModal
          row={uncEmailRow}
          open={!!uncEmailRow}
          onClose={() => setUncEmailRow(null)}
        />
      )}

      <BatchUncDialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        doanLabel={batchScopeLabel}
        rows={batchRows}
      />
    </div>
  );
}

export default function HoaDonUNCPage() {
  const canView = usePermission("hoa_don_unc", "view");
  const isKeToan = useBoPhan("ke_toan"); // điều hành/sales không được xem trang này
  if (!canView || !isKeToan) return <AccessDenied />;
  return <HoaDonUNCPageContent />;
}
