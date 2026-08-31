import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Trash2, FileDown, FileText, Settings, Copy, Inbox, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useRef, useState } from "react";
import { BangGiaImport } from "@/components/bao-gia/BangGiaImport";
import { BangGiaTable } from "@/components/bao-gia/BangGiaTable";
import { BaoGiaCreateModal, type BaoGiaCreatePrefill } from "@/components/bao-gia/BaoGiaCreateModal";
import { YeuCauBaoGiaTab, type YeuCauChonBaoGia } from "@/components/bao-gia/YeuCauBaoGiaTab";
import {
  useBaoGiaList,
  useCloneBaoGia,
  useDeleteBaoGia,
  type BaoGiaKetQua,
} from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { useBaoGiaLogTatCa } from "@/hooks/use-bao-gia-phien-ban";
import { nhomYeuCauChuaTraLoi } from "@/lib/bao-gia-phien-ban";
import { useLeadsList } from "@/hooks/use-leads";
import { useAuth } from "@/hooks/use-auth";
import { useGanBaoGiaVaoYeuCau, useYeuCauBaoGiaList } from "@/hooks/use-yeu-cau-bao-gia";
import { soNgayTuNgay, tenChuongTrinhTuYeuCau } from "@/lib/yeu-cau-bao-gia";
import { exportBaoGiaWord, exportBaoGiaGiaCuoiWord, type TierPrice } from "@/lib/export-bao-gia-word";
import { baoGiaCode, costBreakdown, liveKetQua, liveTierBreakdown } from "@/components/bao-gia/detail/helpers";
import { giaCuoiTierLines, giaCuoiBrackets } from "@/lib/bao-gia-calc";
import { toast } from "sonner";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

export default function BaoGiaPage() {
  const navigate = useNavigate();
  // Tab nằm trên URL: chuông "đối tác gửi yêu cầu" mở thẳng /bao-gia?tab=yeu-cau,
  // và F5 không văng về tab đầu.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabHienTai = searchParams.get("tab") ?? "bao-gia";
  const { user } = useAuth();
  const { data: list = [], isLoading } = useBaoGiaList();
  const { data: bangGia = [] } = useBangGiaDichVu();
  const { data: leads = [] } = useLeadsList();
  const { data: yeuCau = [] } = useYeuCauBaoGiaList();
  const { data: dsLog = [] } = useBaoGiaLogTatCa();
  const cloneMutation = useCloneBaoGia();
  const deleteMutation = useDeleteBaoGia();
  const ganYeuCau = useGanBaoGiaVaoYeuCau();
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<BaoGiaCreatePrefill | undefined>(undefined);
  // Yêu cầu đang được làm báo giá — nhớ lại để đánh dấu đã xử lý sau khi tạo.
  // Dùng ref chứ KHÔNG dùng state: modal gọi onClose() rồi mới onCreated(), mà
  // onClose dọn state — đọc state ở bước sau là đọc trúng giá trị đã bị xoá.
  const yeuCauDangLam = useRef<number | null>(null);

  const soChuaXuLy = yeuCau.filter((y) => y.trang_thai_hien_thi === "moi").length;

  // Đối tác nhắn "sửa chương trình" từ cổng thì lời nhắn đó nằm trong dòng thời
  // gian của TỪNG báo giá — ở đây trước giờ không thấy gì. Kéo lên thành dấu ở
  // danh sách: mất một câu hỏi DB, đổi lại không phải mở lần lượt từng báo giá
  // mới biết ai đang chờ mình.
  const dangCho = nhomYeuCauChuaTraLoi(dsLog);
  const soDangCho = dangCho.size;

  // Bấm "Báo giá" ở tab Yêu cầu → mở modal đã điền sẵn thứ đối tác gửi: đối tác,
  // tên chương trình, ngày đi/về, số ngày suy từ ngày, lead, và file họ đính kèm.
  const taoTuYeuCau = ({ yeuCau: y, tep }: YeuCauChonBaoGia) => {
    setPrefill({
      leadId: y.lead_id,
      yeuCauId: y.id,
      agentId: y.agent_id,
      tenChuongTrinh: tenChuongTrinhTuYeuCau(y).ten,
      tenTuGhep: tenChuongTrinhTuYeuCau(y).tu_ghep,
      soNgay: soNgayTuNgay(y.ngay_di_du_kien, y.ngay_ve_du_kien) ?? undefined,
      ngayDi: y.ngay_di_du_kien,
      ngayVe: y.ngay_ve_du_kien,
      tepDoiTac: tep,
    });
    yeuCauDangLam.current = y.id;
    setCreateOpen(true);
  };

  const dongModal = () => {
    setCreateOpen(false);
    setPrefill(undefined);
  };

  // Tạo xong: ghi nốt "ai xử lý, lúc nào" lên yêu cầu rồi mới sang trang chi tiết.
  // Việc NỐI (bao_gia.yeu_cau_id) đã xong ngay trong lệnh tạo, nên bước này hỏng
  // thì tab vẫn hiện đúng "Đã báo giá" — chỉ thiếu tên người xử lý. Vì vậy không
  // chặn: chặn ở đây là bắt làm lại cả cái báo giá vừa tạo.
  const sauKhiTao = async (id: number) => {
    const ycId = yeuCauDangLam.current;
    yeuCauDangLam.current = null;
    setPrefill(undefined);
    if (ycId != null) {
      try {
        await ganYeuCau.mutateAsync({ yeuCauId: ycId, baoGiaId: id, userId: user?.user_id });
      } catch {
        toast.warning("Đã tạo báo giá. Chưa ghi được người xử lý lên yêu cầu — không ảnh hưởng, tab Yêu cầu vẫn tính là đã báo giá.");
      }
    }
    navigate(`/bao-gia/${id}`);
  };

  const handleClone = (id: number) => {
    cloneMutation.mutate(
      { id },
      {
        onSuccess: ({ id: newId }) => { toast.success("Đã nhân bản"); navigate(`/bao-gia/${newId}`); },
        onError: () => toast.error("Lỗi nhân bản"),
      },
    );
  };

  // Map lead_id → tên khách (hiển thị cột "Khách" trong list báo giá).
  const leadName: Record<number, string> = {};
  leads.forEach((l) => { leadName[l.id] = l.ho_ten; });

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Đã xóa báo giá"),
      onError: () => toast.error("Lỗi xóa"),
    });
  };

  const handleExportWord = async (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number, tiers?: TierPrice[]) => {
    try { await exportBaoGiaWord(ketQua, exchangeRate, profitUsd, undefined, tiers); toast.success("Đã xuất file Word!"); }
    catch { toast.error("Lỗi xuất Word"); }
  };

  const handleExportGiaCuoi = async (ketQua: BaoGiaKetQua, exchangeRate: number) => {
    try {
      const tiers = giaCuoiBrackets(ketQua.gia_cuoi_tiers, exchangeRate).map((b) => ({
        guests: b.guests_from,
        gia_ban_vnd: b.gia_ban_vnd,
        gia_ban_usd: b.gia_ban_usd,
        label: b.label,
      }));
      await exportBaoGiaGiaCuoiWord(ketQua, exchangeRate, tiers);
      toast.success("Đã xuất file Word!");
    } catch { toast.error("Lỗi xuất Word"); }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Báo Giá Tour</h1>
        <Button size="sm" onClick={() => { setPrefill(undefined); yeuCauDangLam.current = null; setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />Tạo báo giá
        </Button>
      </div>

      <BaoGiaCreateModal
        open={createOpen}
        onClose={dongModal}
        onCreated={sauKhiTao}
        prefill={prefill}
      />

      <Tabs
        value={tabHienTai}
        onValueChange={(v) => setSearchParams(v === "bao-gia" ? {} : { tab: v }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="bao-gia">
            <FileText className="h-4 w-4 mr-1" />Danh sách báo giá
            {list.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{list.length}</span>}
            {soDangCho > 0 && (
              <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5" title="Đối tác đang chờ mình trả lời">
                {soDangCho} chờ
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="yeu-cau">
            <Inbox className="h-4 w-4 mr-1" />Yêu cầu báo giá
            {soChuaXuLy > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5">{soChuaXuLy}</span>}
          </TabsTrigger>
          <TabsTrigger value="bang-gia">
            <Settings className="h-4 w-4 mr-1" />Bảng Giá
            {bangGia.length > 0 && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{bangGia.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Danh sách báo giá ─────────────────────────────────── */}
        <TabsContent value="bao-gia" className="mt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : list.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Chưa có báo giá nào</p>
              <p className="text-xs text-muted-foreground mt-1">Nhấn "Tạo báo giá" để bắt đầu</p>
            </div>
          ) : (
            <div className="space-y-2">
              {soDangCho > 0 && (
                // Nói thẳng ra là danh sách vừa bị xếp lại — dòng tự nhảy lên đầu
                // mà không giải thích thì lần sau OP tưởng hệ thống loạn thứ tự.
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <MessageSquareWarning className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <b>{soDangCho} báo giá</b> đối tác đã nhắn xin sửa chương trình mà mình chưa chào lại bản nào —
                    đã đưa lên đầu danh sách. Trả lời bằng cách chào một bản mới.
                  </span>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#E6F1FB]">
                    <th className="py-2 px-3 text-left font-semibold whitespace-nowrap">Mã BG</th>
                    <th className="py-2 px-3 text-left font-semibold">Tên chương trình</th>
                    <th className="py-2 px-3 text-left font-semibold">Khách (Lead)</th>
                    <th className="py-2 px-3 text-right font-semibold">Giá TB / pax (VND)</th>
                    <th className="py-2 px-3 text-right font-semibold">Giá TB / pax (USD)</th>
                    <th className="py-2 px-3 text-center font-semibold">Trạng thái</th>
                    <th className="py-2 px-3 text-right font-semibold">Ngày tạo</th>
                    <th className="py-2 px-3 text-center font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Đang chờ trả lời lên đầu; phần còn lại giữ NGUYÊN thứ tự ngày
                      tạo cũ. Dùng sort ổn định của JS nên hai dòng cùng nhóm không
                      đảo chỗ nhau giữa các lần vẽ lại. */}
                  {[...list]
                    .sort((a, b) => Number(dangCho.has(b.id)) - Number(dangCho.has(a.id)))
                    .map((row) => {
                    const xr = row.exchange_rate ?? 26000;
                    const isGiaCuoi = row.loai_bao_gia === "gia_cuoi";
                    // Giá cuối: lấy bậc thấp nhất (số khách nhỏ nhất) làm đại diện.
                    // Tự tính: giá TB 2 phương án — match DETAIL panel.
                    let giaPaxVnd: number | null;
                    let giaPaxUsd: number | null;
                    if (isGiaCuoi) {
                      const lines = giaCuoiTierLines(row.ket_qua?.gia_cuoi_tiers, xr);
                      giaPaxVnd = lines[0]?.gia_ban_vnd ?? null;
                      giaPaxUsd = lines[0]?.gia_ban_usd ?? null;
                    } else {
                      const breakdown = costBreakdown({
                        ket: row.ket_qua,
                        exchangeRate: xr,
                        profitUsd: row.profit_usd ?? 0,
                        xeGia: row.xe_gia,
                        phuThu: row.phu_thu,
                        vcbRate: row.vcb_rate,
                      });
                      giaPaxVnd = breakdown?.gia_ban_tb_per_pax ?? null;
                      giaPaxUsd = breakdown?.gia_ban_tb_per_pax_usd ?? null;
                    }
                    return (
                      <tr key={row.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/bao-gia/${row.id}`)}>
                        {/* Mã BG là tên chung của báo giá này ở MỌI nơi: bản Word gửi
                            khách, cổng đối tác, trang xem qua link. Đối tác nhắn "cho
                            hỏi BG00025-v3" thì OP phải dò ra được ngay ở danh sách —
                            nên hiện cả số bản đang hiệu lực, đúng cách cổng gọi tên. */}
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                          {baoGiaCode(row)}
                          {row.so_phien_ban_cuoi > 0 && (
                            <span className="text-slate-400">-v{row.so_phien_ban_cuoi}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium">{row.tieu_de || "(chưa có tên)"}</span>
                          {dangCho.has(row.id) && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium align-middle"
                              title={dangCho.get(row.id)!.map((l) => l.noi_dung).filter(Boolean).join(" · ")}
                            >
                              <MessageSquareWarning className="h-3 w-3" />
                              Đối tác chờ trả lời
                            </span>
                          )}
                          {isGiaCuoi && (
                            <span className="ml-2 inline-block rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium align-middle">Giá cuối</span>
                          )}
                          {row.ket_qua && <span className="ml-2 text-muted-foreground">{row.ket_qua.so_ngay} ngày</span>}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {row.lead_id != null ? (leadName[row.lead_id] ?? `Lead #${row.lead_id}`) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-blue-700">{giaPaxVnd != null ? fmt(giaPaxVnd) : "—"}</td>
                        <td className="py-2 px-3 text-right text-blue-700">{giaPaxUsd != null ? fmtUsd(giaPaxUsd) : "—"}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={row.trang_thai === "draft" ? "secondary" : "default"}>
                            {row.trang_thai === "sent" ? "Đã gửi" : row.trang_thai === "final" ? "Chính thức" : "Nháp"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </td>
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Nhân bản"
                              onClick={() => handleClone(row.id)} disabled={cloneMutation.isPending}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            {/* CÙNG một nút ra 2 loại file khác hẳn nhau: mode "giá cuối"
                                ra bản gửi khách (chỉ giá bán), mode tự tính ra bản NỘI BỘ
                                có đơn giá vốn + tổng chi phí + lợi nhuận. Tô đỏ + đổi chữ
                                để OP biết TRƯỚC khi bấm mình sắp tải bản nào. */}
                            {row.ket_qua && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-6 w-6${isGiaCuoi ? "" : " text-red-600 hover:text-red-700"}`}
                                title={isGiaCuoi
                                  ? "Xuất Word — bản gửi khách (chỉ giá bán)"
                                  : "Xuất Word NỘI BỘ — có giá vốn, tổng chi phí, lợi nhuận. KHÔNG gửi đối tác."}
                                onClick={() => {
                                  const xr = row.exchange_rate ?? 26000;
                                  if (isGiaCuoi) {
                                    handleExportGiaCuoi(row.ket_qua!, xr);
                                    return;
                                  }
                                  // Export với ket_qua live + ma trận giá theo số khách — match DETAIL
                                  const fresh = liveKetQua(row) ?? row.ket_qua;
                                  if (!fresh) return;
                                  const tiers = liveTierBreakdown(row).map((t) => ({
                                    guests: t.guests,
                                    gia_ban_vnd: t.line.gia_ban_per_pax,
                                    gia_ban_usd: xr > 0 ? t.line.gia_ban_per_pax / xr : 0,
                                  }));
                                  handleExportWord(fresh, xr, row.profit_usd ?? 0, tiers);
                                }}>
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Xóa báo giá?</AlertDialogTitle>
                                  <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(row.id)}>Xóa</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Yêu cầu báo giá (đối tác gửi từ cổng 外網) ────────── */}
        <TabsContent value="yeu-cau" className="mt-3">
          <YeuCauBaoGiaTab onTaoBaoGia={taoTuYeuCau} />
        </TabsContent>

        {/* ── Tab: Bảng Giá ─────────────────────────────────────────── */}
        <TabsContent value="bang-gia" className="mt-3 space-y-4">
          <BangGiaImport />

          {/* Hiện KỂ CẢ khi bảng giá rỗng: nút "Thêm dịch vụ" nằm trong bảng này,
              ẩn đi thì bảng trống chỉ còn đường import file, không gõ tay được. */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Bảng giá hiện tại: <strong>{bangGia.length}</strong> dịch vụ
              <span className="ml-3">
                (KS: {bangGia.filter(r => r.loai === "hotel").length} •
                Ăn uống: {bangGia.filter(r => r.loai === "nha_hang").length} •
                Xe: {bangGia.filter(r => r.loai === "xe").length} •
                Dịch vụ: {bangGia.filter(r => r.loai === "dich_vu").length})
              </span>
              <span className="ml-3">Sửa thẳng trên bảng — gõ xong bấm ra ngoài là lưu.</span>
            </p>
            <BangGiaTable rows={bangGia} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
