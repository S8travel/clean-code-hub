import { useState } from "react";
import { Clock, Download, FileText, GitCompare, History, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { usePhienBanList, useBaoGiaLog, type PhienBanRow } from "@/hooks/use-bao-gia-phien-ban";
import { soSanhPhienBan, type KetQuaSoSanh } from "@/lib/bao-gia-phien-ban";
import { exportBaoGiaTaiwanWordTuNoiDung } from "@/lib/export-bao-gia-word";

const LOAI_LABEL: Record<string, string> = {
  gui_ban: "Gửi bản",
  mo_phien_ban: "Mở soạn bản mới",
  thu_hoi: "Thu hồi",
  yeu_cau_sua: "Đối tác yêu cầu sửa",
  doi_tac_xem: "Đối tác xem",
};

const ngay = (s: string | null) => (s ? new Date(s).toLocaleDateString("vi-VN") : "—");
const gio = (s: string) => new Date(s).toLocaleString("vi-VN");

// Lịch sử các bản đã chào + dòng thời gian gửi qua lại.
// Bản đã gửi là bằng chứng: xem lại được, in lại được, nhưng không sửa được —
// DB chặn UPDATE/DELETE nên ở đây cũng không có nút nào để sửa.
export function PhienBanSection({ draft }: { draft: BaoGiaRow }) {
  const { data: dsPhienBan = [], isLoading } = usePhienBanList(draft.id);
  const { data: dsLog = [] } = useBaoGiaLog(draft.id);
  const [xemBang, setXemBang] = useState<PhienBanRow | null>(null);
  const [soSanh, setSoSanh] = useState<{ cu: PhienBanRow; moi: PhienBanRow; kq: KetQuaSoSanh } | null>(null);

  const taiWord = async (pb: PhienBanRow) => {
    try {
      // Dựng thẳng từ nội dung đã đóng băng → tải bản #1 hôm nay vẫn ra đúng con
      // số đã chào hôm đó, kể cả khi đơn giá vốn đã đổi mấy lần.
      await exportBaoGiaTaiwanWordTuNoiDung(pb.noi_dung_chao.noi_dung, pb.ma_hien_thi);
      toast.success(`Đã tải lại bản ${pb.ma_hien_thi}`);
    } catch {
      toast.error("Lỗi tải file");
    }
  };

  const moSoSanh = (moi: PhienBanRow) => {
    const cu = dsPhienBan.find((p) => p.so_phien_ban === moi.so_phien_ban - 1);
    if (!cu) return;
    setSoSanh({ cu, moi, kq: soSanhPhienBan(cu, moi) });
  };

  if (isLoading) return null;
  if (!dsPhienBan.length && !dsLog.length) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Lịch sử phiên bản
      </h2>

      <ul className="space-y-2">
        {dsPhienBan.map((pb) => {
          const gia = pb.noi_dung_chao?.noi_dung?.brackets ?? [];
          const thapNhat = gia.length ? Math.min(...gia.map((b) => b.price_usd)) : null;
          const hienHanh = pb.id === draft.phien_ban_hien_hanh_id;
          return (
            <li
              key={pb.id}
              className={
                "rounded border p-3 " +
                (hienHanh ? "border-violet-300 bg-violet-50/50" : "border-slate-200")
              }
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800">{pb.ma_hien_thi}</span>
                {hienHanh && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                    đang gửi đối tác
                  </span>
                )}
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> chào {ngay(pb.chao_ngay)}
                  {pb.hieu_luc_den && ` · hết hạn ${ngay(pb.hieu_luc_den)}`}
                </span>
                {pb.gui_boi_ten && <span className="text-[11px] text-slate-500">· {pb.gui_boi_ten}</span>}
                {thapNhat !== null && (
                  <span className="ml-auto text-sm font-semibold text-[#1E3A6E]">từ ${thapNhat}</span>
                )}
              </div>

              {pb.ly_do && <p className="text-[11px] text-slate-600 mt-1">Lý do: {pb.ly_do}</p>}

              <div className="flex gap-1.5 mt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setXemBang(pb)}>
                  <FileText className="h-3 w-3" /> Xem bảng giá
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => taiWord(pb)}>
                  <Download className="h-3 w-3" /> Tải lại file Word
                </Button>
                {pb.so_phien_ban > 1 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => moSoSanh(pb)}>
                    <GitCompare className="h-3 w-3" /> So với bản trước
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {dsLog.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">Dòng thời gian</p>
          <ul className="space-y-1">
            {dsLog.map((l) => (
              <li key={l.id} className="text-[11px] text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">{gio(l.tao_luc)}</span>
                <span className="font-medium shrink-0">{LOAI_LABEL[l.loai] ?? l.loai}</span>
                <span className="break-words">{l.noi_dung}{l.tao_boi_ten ? ` · ${l.tao_boi_ten}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Xem lại bảng giá của một bản đã gửi */}
      <Dialog open={!!xemBang} onOpenChange={(o) => !o && setXemBang(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-400" />
              {xemBang?.ma_hien_thi} — bản đã chào {ngay(xemBang?.chao_ngay ?? null)}
            </DialogTitle>
          </DialogHeader>
          {xemBang && (
            <div className="space-y-3 text-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 px-2 py-1 text-left">TOUR FEE (USD/pax)</th>
                      {xemBang.noi_dung_chao.noi_dung.brackets.map((b) => (
                        <th key={b.label} className="border border-slate-200 px-2 py-1">{b.label}</th>
                      ))}
                      <th className="border border-slate-200 px-2 py-1">單房差</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 px-2 py-1 text-slate-600">
                        {xemBang.noi_dung_chao.noi_dung.ten_chuong_trinh}
                      </td>
                      {xemBang.noi_dung_chao.noi_dung.brackets.map((b) => (
                        <td key={b.label} className="border border-slate-200 px-2 py-1 text-center font-semibold text-[#1E3A6E]">
                          ${b.price_usd}
                        </td>
                      ))}
                      <td className="border border-slate-200 px-2 py-1 text-center font-semibold text-[#1E3A6E]">
                        ${xemBang.noi_dung_chao.noi_dung.single_supplement_usd}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-[11px] text-slate-600">
                <div>
                  <p className="font-semibold text-[#C00000] mb-1">報價包含</p>
                  <ul className="space-y-0.5">
                    {xemBang.noi_dung_chao.noi_dung.included.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-[#C00000] mb-1">報價不含</p>
                  <ul className="space-y-0.5">
                    {xemBang.noi_dung_chao.noi_dung.excluded.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* So sánh với bản liền trước */}
      <Dialog open={!!soSanh} onOpenChange={(o) => !o && setSoSanh(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {soSanh?.cu.ma_hien_thi} → {soSanh?.moi.ma_hien_thi}: khác gì?
            </DialogTitle>
          </DialogHeader>
          {soSanh && <BangSoSanh kq={soSanh.kq} coLopVon={!!soSanh.cu.noi_dung_von && !!soSanh.moi.noi_dung_von} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function BangSoSanh({ kq, coLopVon }: { kq: KetQuaSoSanh; coLopVon: boolean }) {
  if (kq.giong_nhau) {
    return <p className="text-sm text-slate-600">Hai bản giống nhau ở mọi mục so sánh được.</p>;
  }
  const dau = (n: number | null) => (n == null ? "" : n > 0 ? `+${n}` : String(n));
  const tien = (n: number | null) => (n == null ? "—" : n.toLocaleString("vi-VN"));

  return (
    <div className="space-y-4 text-sm">
      {kq.bac_gia.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Bậc giá bán (USD/khách)</p>
          <ul className="space-y-0.5 text-xs">
            {kq.bac_gia.map((b) => (
              <li key={b.label} className="flex gap-2">
                <span className="w-28 shrink-0 text-slate-600">{b.label}</span>
                <span>${b.cu ?? "—"} → <b>${b.moi ?? "—"}</b></span>
                {b.chenh != null && (
                  <span className={b.chenh < 0 ? "text-red-600" : "text-emerald-700"}>({dau(b.chenh)})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kq.single_supplement && (
        <p className="text-xs">
          <span className="text-slate-600">單房差: </span>
          ${kq.single_supplement.cu ?? "—"} → <b>${kq.single_supplement.moi ?? "—"}</b>
        </p>
      )}

      {kq.dich_vu.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Dịch vụ</p>
          <ul className="space-y-0.5 text-xs">
            {kq.dich_vu.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-14 shrink-0 text-slate-400">Ngày {d.ngay_so}</span>
                <span className={
                  d.kieu === "them" ? "text-emerald-700 w-16 shrink-0"
                    : d.kieu === "bo" ? "text-red-600 w-16 shrink-0" : "text-amber-700 w-16 shrink-0"
                }>
                  {d.kieu === "them" ? "thêm" : d.kieu === "bo" ? "bỏ" : "đổi giá"}
                </span>
                <span className="break-words">
                  {d.mo_ta}
                  {d.kieu === "doi_gia" && <> · {tien(d.cu)} → <b>{tien(d.moi)}</b></>}
                  {d.kieu !== "doi_gia" && <> · {tien(d.cu ?? d.moi)}</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kq.thong_so.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Thông số chung</p>
          <ul className="space-y-0.5 text-xs">
            {kq.thong_so.map((t) => (
              <li key={t.ten} className="flex gap-2">
                <span className="w-40 shrink-0 text-slate-600">{t.ten}</span>
                <span>{t.cu} → <b>{t.moi}</b></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!coLopVon && (
        <p className="text-[11px] text-slate-500">
          Bản cũ được chuyển vào từ trước khi có tính năng phiên bản nên không chụp phần giá vốn —
          chỉ so được bậc giá bán.
        </p>
      )}
    </div>
  );
}
