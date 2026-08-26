import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Ban,
  Calendar,
  FileText,
  Inbox,
  Loader2,
  RotateCcw,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import {
  moTepYeuCau,
  useDoiTrangThaiYeuCau,
  useTepTheoYeuCau,
  useYeuCauBaoGiaList,
  type TepYeuCauRow,
  type YeuCauBaoGiaRow,
} from "@/hooks/use-yeu-cau-bao-gia";
import { YeuCauChiTietDialog } from "@/components/bao-gia/YeuCauChiTietDialog";
import {
  coChuGon,
  demTheoTrangThai,
  YEU_CAU_TRANG_THAI_COLOR,
  YEU_CAU_TRANG_THAI_LABEL,
  type YeuCauTrangThai,
} from "@/lib/yeu-cau-bao-gia";

// Tab "Yêu cầu báo giá" — mọi yêu cầu đối tác gửi từ cổng 外網 đổ về đây.
//
// Một dòng trả lời đúng 4 câu người dùng cần: ĐỐI TÁC nào, TÀI KHOẢN nào bên họ
// bấm gửi, gửi LÚC NÀO, và đã XỬ LÝ chưa. Nút "Báo giá" mở thẳng bảng tạo báo
// giá đã điền sẵn — không phải gõ lại thứ đối tác vừa gõ.

type BoLoc = "tat_ca" | YeuCauTrangThai;

export interface YeuCauChonBaoGia {
  yeuCau: YeuCauBaoGiaRow;
  tep: TepYeuCauRow[];
}

interface Props {
  /** Bấm "Báo giá" → trang cha mở modal tạo báo giá với dữ liệu điền sẵn. */
  onTaoBaoGia: (chon: YeuCauChonBaoGia) => void;
}

export function YeuCauBaoGiaTab({ onTaoBaoGia }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useYeuCauBaoGiaList();
  const idsCoTep = useMemo(() => rows.filter((r) => r.so_tep > 0).map((r) => r.id), [rows]);
  const { data: tepMap = {}, isLoading: dangTaiTep } = useTepTheoYeuCau(idsCoTep);
  const doiTrangThai = useDoiTrangThaiYeuCau();

  const [loc, setLoc] = useState<BoLoc>("tat_ca");
  const [boQua, setBoQua] = useState<YeuCauBaoGiaRow | null>(null);
  const [lyDo, setLyDo] = useState("");
  const [dangMoTep, setDangMoTep] = useState<number | null>(null);
  const [xemChiTiet, setXemChiTiet] = useState<YeuCauBaoGiaRow | null>(null);

  const dem = useMemo(() => demTheoTrangThai(rows), [rows]);
  const hienThi = useMemo(
    () => (loc === "tat_ca" ? rows : rows.filter((r) => r.trang_thai_hien_thi === loc)),
    [rows, loc],
  );

  const moTep = async (tep: TepYeuCauRow) => {
    setDangMoTep(tep.id);
    try {
      await moTepYeuCau(tep.duong_dan);
    } catch {
      toast.error("Không mở được file — có thể file đã bị gỡ.");
    } finally {
      setDangMoTep(null);
    }
  };

  const xacNhanBoQua = () => {
    if (!boQua) return;
    const ghi = lyDo.trim();
    if (!ghi) {
      toast.error("Nhập lý do không báo giá — để người sau biết vì sao.");
      return;
    }
    doiTrangThai.mutate(
      { yeuCauId: boQua.id, trangThai: "bo_qua", lyDo: ghi, userId: user?.user_id },
      {
        onSuccess: () => { toast.success("Đã đánh dấu bỏ qua"); setBoQua(null); setLyDo(""); },
        onError: (e) => toast.error(errMsg(e) || "Lỗi cập nhật"),
      },
    );
  };

  const moLai = (row: YeuCauBaoGiaRow) => {
    doiTrangThai.mutate(
      { yeuCauId: row.id, trangThai: "moi" },
      {
        onSuccess: () => toast.success("Đã mở lại yêu cầu"),
        onError: (e) => toast.error(errMsg(e) || "Lỗi cập nhật"),
      },
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;

  return (
    <div className="space-y-3">
      {/* Bộ lọc theo trạng thái xử lý */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["tat_ca", "Tất cả", dem.tat_ca],
          ["moi", YEU_CAU_TRANG_THAI_LABEL.moi, dem.moi],
          ["da_bao_gia", YEU_CAU_TRANG_THAI_LABEL.da_bao_gia, dem.da_bao_gia],
          ["bo_qua", YEU_CAU_TRANG_THAI_LABEL.bo_qua, dem.bo_qua],
        ] as [BoLoc, string, number][]).map(([gt, nhan, so]) => (
          <button
            key={gt}
            type="button"
            onClick={() => setLoc(gt)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              loc === gt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
            )}
          >
            {nhan} <span className="opacity-70">({so})</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Chưa có yêu cầu nào</p>
          <p className="text-xs text-muted-foreground mt-1">
            Yêu cầu đối tác gửi từ cổng sẽ hiện ở đây, kèm file họ đính kèm.
          </p>
        </div>
      ) : hienThi.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có yêu cầu nào ở mục này.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#E6F1FB]">
                <th className="py-2 px-3 text-left font-semibold">Đối tác / tài khoản gửi</th>
                <th className="py-2 px-3 text-left font-semibold">Nội dung yêu cầu</th>
                <th className="py-2 px-3 text-left font-semibold">Khách / ngày đi</th>
                <th className="py-2 px-3 text-left font-semibold">File</th>
                <th className="py-2 px-3 text-right font-semibold">Gửi lúc</th>
                <th className="py-2 px-3 text-center font-semibold">Trạng thái</th>
                <th className="py-2 px-3 text-center font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {hienThi.map((row) => {
                const tep = tepMap[row.id] ?? [];
                const tt = row.trang_thai_hien_thi;
                return (
                  <tr key={row.id} className="border-t align-top hover:bg-muted/20">
                    {/* Đối tác + tài khoản đã bấm gửi */}
                    <td className="py-2 px-3">
                      <span className="font-medium">{row.ten_agent || "(không rõ đối tác)"}</span>
                      <span className="block text-muted-foreground">
                        {row.tai_khoan_ten || row.nguoi_lien_he || "—"}
                        {row.tai_khoan_email ? ` · ${row.tai_khoan_email}` : ""}
                      </span>
                      {row.so_dien_thoai && (
                        <span className="block text-muted-foreground">☎ {row.so_dien_thoai}</span>
                      )}
                    </td>

                    {/* Nội dung — bấm để xem nguyên văn (đối tác hay gõ cả lịch trình) */}
                    <td className="py-2 px-3 max-w-[22rem]">
                      <button
                        type="button"
                        onClick={() => setXemChiTiet(row)}
                        className="block w-full text-left hover:underline"
                        title="Xem đầy đủ"
                      >
                        {row.tieu_de
                          ? <span className="font-medium block break-words">{row.tieu_de}</span>
                          : <span className="font-medium block text-muted-foreground">(không có tiêu đề)</span>}
                        {row.noi_dung && (
                          <span className="block text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">
                            {row.noi_dung}
                          </span>
                        )}
                      </button>
                      {row.lead_id != null && (
                        <button
                          type="button"
                          onClick={() => navigate(`/leads?lead=${row.lead_id}`)}
                          className="mt-0.5 text-[11px] text-primary hover:underline"
                        >
                          Mở lead #{row.lead_id}
                        </button>
                      )}
                    </td>

                    {/* Khách + ngày */}
                    <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                      {row.so_khach ? (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {row.so_khach} khách
                        </span>
                      ) : null}
                      {(row.ngay_di_du_kien || row.ngay_ve_du_kien) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {ngayGon(row.ngay_di_du_kien)} – {ngayGon(row.ngay_ve_du_kien)}
                        </span>
                      )}
                      {!row.so_khach && !row.ngay_di_du_kien && !row.ngay_ve_du_kien && "—"}
                    </td>

                    {/* File đính kèm */}
                    <td className="py-2 px-3">
                      {/* Đối tác gửi 3 file mà kho chỉ có 2 thì phải nói ra: im lặng
                          là người báo giá tưởng họ không gửi, còn họ tưởng đã gửi rồi. */}
                      {thieuTep(row) && (
                        <span className="mb-0.5 block rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-800">
                          Đối tác gửi {row.so_tep_gui} file, hệ thống chỉ lấy được {row.so_tep} — xin lại
                          {tenTepHong(row) ? `: ${tenTepHong(row)}` : ""}
                        </span>
                      )}
                      {tep.length === 0 ? (
                        <span className="text-muted-foreground">{dangTaiTep && row.so_tep > 0 ? "đang tải…" : "—"}</span>
                      ) : (
                        <div className="space-y-0.5">
                          {tep.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => moTep(t)}
                              disabled={dangMoTep === t.id}
                              className="flex items-center gap-1 max-w-[12rem] text-primary hover:underline disabled:opacity-60"
                              title={t.file_name || t.ten || ""}
                            >
                              {dangMoTep === t.id
                                ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                : <FileText className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{t.file_name || t.ten || `#${t.id}`}</span>
                              {t.co_chu ? (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {coChuGon(t.co_chu)}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-2 px-3 text-right whitespace-nowrap text-muted-foreground">
                      {format(new Date(row.tao_luc), "dd/MM/yyyy HH:mm", { locale: vi })}
                    </td>

                    {/* Trạng thái xử lý */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", YEU_CAU_TRANG_THAI_COLOR[tt])}>
                        {YEU_CAU_TRANG_THAI_LABEL[tt]}
                      </span>
                      {tt === "da_bao_gia" && row.bao_gia_moi_nhat_id != null && (
                        <button
                          type="button"
                          onClick={() => navigate(`/bao-gia/${row.bao_gia_moi_nhat_id}`)}
                          className="mt-0.5 block w-full text-[11px] text-primary hover:underline"
                        >
                          {row.so_bao_gia > 1 ? `${row.so_bao_gia} báo giá` : "Mở báo giá"}
                        </button>
                      )}
                      {tt === "da_bao_gia" && (
                        row.bao_gia_da_gui_cong ? (
                          <span className="mt-0.5 block text-[10px] text-emerald-700">Đã gửi cổng</span>
                        ) : (
                          // Bên mình xong rồi nhưng đối tác vẫn CHƯA thấy gì: trên
                          // cổng, yêu cầu này còn nằm ở "chờ báo giá". Không nói ra
                          // thì hai bên tưởng đã trao đổi xong với nhau.
                          <span className="mt-0.5 block text-[10px] text-amber-600">Chưa gửi cổng</span>
                        )
                      )}
                      {tt === "bo_qua" && row.ly_do_bo_qua && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground break-words">
                          {row.ly_do_bo_qua}
                        </span>
                      )}
                      {row.xu_ly_ten && tt !== "moi" && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{row.xu_ly_ten}</span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-2 px-3">
                      <div className="flex flex-col items-stretch gap-1 min-w-[7.5rem]">
                        {/* Chưa tải xong danh sách file thì khoá nút: bấm lúc này
                            tạo ra báo giá KHÔNG kèm file đối tác mà không báo gì. */}
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onTaoBaoGia({ yeuCau: row, tep })}
                          disabled={row.so_tep > 0 && tep.length === 0}
                          title={row.so_tep > 0 && tep.length === 0 ? "Đang tải file đính kèm…" : undefined}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          {tt === "da_bao_gia" ? "Báo giá lại" : "Báo giá"}
                        </Button>
                        {tt === "bo_qua" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => moLai(row)}
                            disabled={doiTrangThai.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />Mở lại
                          </Button>
                        ) : (
                          /* Đã có báo giá thì không cho bỏ qua: bỏ qua thắng mọi
                             trạng thái khác, bấm nhầm là giấu mất việc đã làm.
                             Muốn bỏ thì xoá báo giá trước. */
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => { setBoQua(row); setLyDo(""); }}
                            disabled={row.so_bao_gia > 0}
                            title={row.so_bao_gia > 0 ? "Đã có báo giá cho yêu cầu này" : undefined}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />Bỏ qua
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <YeuCauChiTietDialog
        yeuCau={xemChiTiet}
        tep={xemChiTiet ? (tepMap[xemChiTiet.id] ?? []) : []}
        onClose={() => setXemChiTiet(null)}
        onTaoBaoGia={() => {
          if (!xemChiTiet) return;
          const chon = { yeuCau: xemChiTiet, tep: tepMap[xemChiTiet.id] ?? [] };
          setXemChiTiet(null);
          onTaoBaoGia(chon);
        }}
      />

      {/* Bỏ qua — bắt buộc ghi lý do, không thì tháng sau không ai nhớ vì sao */}
      <Dialog open={!!boQua} onOpenChange={(o) => { if (!o) { setBoQua(null); setLyDo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Không báo giá yêu cầu này?</DialogTitle>
            <DialogDescription className="break-words">
              {boQua?.ten_agent ? `${boQua.ten_agent} — ` : ""}
              {boQua?.tieu_de || boQua?.noi_dung?.slice(0, 120) || "(không có nội dung)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Lý do</label>
            <Textarea
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              rows={3}
              placeholder="VD: trùng với yêu cầu hôm qua / đối tác báo hủy qua LINE"
              className="text-xs resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBoQua(null); setLyDo(""); }}>Hủy</Button>
            <Button onClick={xacNhanBoQua} disabled={doiTrangThai.isPending}>
              {doiTrangThai.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Xác nhận bỏ qua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Đối tác đính kèm nhiều file hơn số file hệ thống lấy được. */
function thieuTep(row: YeuCauBaoGiaRow): boolean {
  return (row.so_tep_gui ?? 0) > row.so_tep;
}

/** Tên các file rớt, để đi xin lại đúng file. */
function tenTepHong(row: YeuCauBaoGiaRow): string {
  return (row.tep_hong ?? []).join(", ");
}

/** "05/11/2026" — chuỗi ngày thuần, ghép T00:00:00 cho khỏi lệch múi giờ. */
function ngayGon(s: string | null): string {
  if (!s) return "—";
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy", { locale: vi });
}
