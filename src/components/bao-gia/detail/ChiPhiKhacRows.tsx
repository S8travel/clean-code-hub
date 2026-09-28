import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BaoGiaKetQua, ChiPhiKhacItem } from "@/hooks/use-bao-gia";
import {
  CACH_TINH_CHI_PHI_KHAC, VUNG_MAU, daChotChiPhiKhac, doiCachTinh, dongChiPhiKhacMoi, dsChiPhiKhacGoc,
  mauConThieu, type CachTinhChiPhiKhac, type VungMau,
} from "@/lib/bao-gia-chi-phi-khac";
import { fmtVnd, fmtUsd, type CostingGroup, type CostingRow } from "./helpers";

// Nhóm "Chi phí khác" của bảng chi phí: nón lá, nước suối, công tác phí tài xế…
// Tách khỏi CostingRows vì dòng ở đây không phải item theo ngày: không có ngày,
// không FOC, sửa vào ket_qua.chi_phi_khac chứ không vào ket_qua.items.
//
// Chưa ai sửa → danh sách do hệ thống tự đặt theo tuyến (miền Trung / miền Nam có
// mẫu). Sửa bất kỳ ô nào là chốt CẢ danh sách vào báo giá — xem
// lib/bao-gia-chi-phi-khac.ts.

const numInput = "h-7 w-full text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const N_THEO_NHAN = { ngay: "số ngày", dem: "số đêm", bua: "số bữa" } as const;
const MOI_VUNG: VungMau[] = ["mien_trung", "mien_nam"];

export function ChiPhiKhacBlock({
  group, ket, vung, metaIcon, metaTint, nTier, matchIdx, updateDraftKetQua, saveKetQua,
}: {
  group: CostingGroup;
  ket: BaoGiaKetQua;
  /** Vùng tour chạm tới (vungChiPhiKhac) → chưa chốt thì đang chạy bộ mẫu của vùng đó. */
  vung: VungMau[];
  metaIcon: React.ReactNode;
  metaTint: string;
  nTier: number;
  matchIdx: number;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}) {
  const totalCols = 6 + nTier * 2;
  const daChot = daChotChiPhiKhac(ket);
  // Danh sách GỐC đang hiệu lực (mẫu theo tuyến là bản sao) — mọi thao tác sửa
  // dựng danh sách mới từ đây rồi ghi vào ket_qua.chi_phi_khac.
  const goc = dsChiPhiKhacGoc(ket, vung);
  const tenVung = vung.map((v) => VUNG_MAU[v].nhan).join(" + ");
  // Nút nạp mẫu: tour dò ra vùng nào thì chỉ mời mẫu vùng đó (khỏi rác nút ở mọi
  // báo giá); dò không ra vùng nào (Phú Quốc, tour lạ…) thì mời đủ các vùng.
  const napDuoc = (vung.length ? vung : MOI_VUNG)
    .map((v) => ({ v, thieu: mauConThieu(goc, v) }))
    .filter((x) => x.thieu.length > 0);

  // Gõ (onChange) → chỉ đổi bản nháp; rời ô (onBlur) → lưu. Chưa đổi gì thì rời ô
  // KHÔNG ghi: ghi lúc đó là lặng lẽ chốt danh sách mẫu vào báo giá.
  const live = (next: ChiPhiKhacItem[]) => updateDraftKetQua({ ...ket, chi_phi_khac: next });
  const luu = (next: ChiPhiKhacItem[]) => saveKetQua({ ...ket, chi_phi_khac: next });
  const commit = () => { if (daChot) saveKetQua(ket); };
  const sua = (k: number, patch: Partial<ChiPhiKhacItem>) =>
    live(goc.map((r, i) => (i === k ? { ...r, ...patch } : r)));

  const xoa = (k: number, row: CostingRow) => {
    const ten = row.mo_ta.trim() || "(chưa đặt tên)";
    const coTien = row.cells.some((c) => c.total > 0);
    if (coTien && !window.confirm(`Xoá "${ten}" khỏi chi phí khác của báo giá này?`)) return;
    luu(goc.filter((_, i) => i !== k));
  };
  const veTuDat = () => {
    if (!window.confirm("Bỏ các dòng chi phí khác đã sửa, để hệ thống tự điền lại theo tuyến?")) return;
    saveKetQua({ ...ket, chi_phi_khac: null });
  };

  return (
    <>
      <tr>
        <td colSpan={totalCols} className="border border-slate-200 px-2 py-1 bg-slate-100/70">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold", metaTint)}>
              {metaIcon} {group.label}
            </span>
            {!daChot && vung.length > 0 && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800"
                title={`Hệ thống tự điền theo mẫu đoàn ${tenVung}. Sửa bất kỳ ô nào là chốt danh sách cho riêng báo giá này.`}
              >
                tự đặt theo tuyến {tenVung}
              </span>
            )}
            {daChot && (
              <button
                type="button"
                onClick={veTuDat}
                className="text-[10px] text-blue-600 hover:underline whitespace-nowrap"
                title="Bỏ danh sách đã sửa, để hệ thống tự điền lại theo tuyến (miền Trung / miền Nam có mẫu, tuyến khác để trống)"
              >
                ↺ về tự đặt theo tuyến
              </button>
            )}
          </span>
        </td>
      </tr>
      {group.rows.length === 0 && (
        <tr>
          <td colSpan={totalCols} className="border border-slate-200 px-2 py-1 text-[11px] text-slate-400 italic">
            (chưa có)
          </td>
        </tr>
      )}
      {group.rows.map((r) => r.khac && (
        <KhacRow
          key={r.khac.index}
          row={r}
          goc={goc[r.khac.index]}
          matchIdx={matchIdx}
          onSua={(patch) => sua(r.khac!.index, patch)}
          onDoiCach={(cach) =>
            luu(goc.map((x, i) => (i === r.khac!.index ? doiCachTinh(x, cach, r.so_luong) : x)))}
          onCommit={commit}
          onXoa={() => xoa(r.khac!.index, r)}
        />
      ))}
      <tr>
        <td colSpan={totalCols} className="border border-slate-200 px-2 py-1">
          <span className="inline-flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => luu([...goc, dongChiPhiKhacMoi()])}
              title="Thêm 1 dòng trống — điền tên, giá, cách tính ngay trên dòng vừa thêm"
              className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" /> Thêm dòng chi phí khác
            </button>
            {napDuoc.map(({ v, thieu }) => (
              <button
                key={v}
                type="button"
                onClick={() => luu([...goc, ...thieu])}
                title={`Thêm các khoản của mẫu đoàn ${VUNG_MAU[v].nhan} còn thiếu: ${thieu.map((m) => m.ten).join(", ")}`}
                className="inline-flex items-center gap-1 rounded border border-dashed border-teal-300 px-2 py-0.5 text-[11px] text-teal-700 hover:border-teal-500"
              >
                <Plus className="h-3 w-3" /> Nạp mẫu {VUNG_MAU[v].nhan} ({thieu.length} dòng)
              </button>
            ))}
          </span>
        </td>
      </tr>
      <tr className="bg-slate-50/70 text-[11px]">
        <td colSpan={6} className="sticky left-0 z-10 bg-slate-50/70 border border-slate-200 px-2 py-0.5 text-right font-medium text-slate-600">
          Cộng {group.label.toLowerCase()}
        </td>
        {group.subtotals.map((s, ti) => (
          <td key={ti} colSpan={2} className={cn("border border-slate-200 px-2 py-0.5 text-right font-semibold tabular-nums", ti === matchIdx && "bg-emerald-50")}>
            {fmtVnd(s)}
          </td>
        ))}
      </tr>
    </>
  );
}

function KhacRow({
  row, goc, matchIdx, onSua, onDoiCach, onCommit, onXoa,
}: {
  row: CostingRow;
  goc: ChiPhiKhacItem | undefined;
  matchIdx: number;
  onSua: (patch: Partial<ChiPhiKhacItem>) => void;
  onDoiCach: (cach: CachTinhChiPhiKhac) => void;
  onCommit: () => void;
  onXoa: () => void;
}) {
  const meta = row.khac!;
  const coTuDong = meta.n_tu_dong != null;
  const nTheo = goc?.n_theo;
  const chuaCoGia = row.don_gia <= 0;

  return (
    <tr className="group border-t border-slate-100 hover:bg-slate-50/50">
      {/* Không gắn ngày */}
      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-1.5 py-1 w-12" />
      {/* Tên Việt + 中文 + cách tính */}
      <td className="border border-slate-200 px-2 py-1 min-w-[230px]">
        <span className="flex items-center gap-1">
          <input
            value={goc?.ten ?? row.mo_ta}
            onChange={(e) => onSua({ ten: e.target.value })}
            onBlur={onCommit}
            placeholder="Tên khoản chi"
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none focus:bg-blue-50/40 rounded px-1"
          />
          <button
            type="button"
            onClick={onXoa}
            title="Xoá dòng này khỏi báo giá"
            className="shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
        <span className="mt-0.5 flex items-center gap-1">
          <input
            value={goc?.ten_zh ?? ""}
            onChange={(e) => onSua({ ten_zh: e.target.value })}
            onBlur={onCommit}
            placeholder="中文名稱"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-400 outline-none focus:bg-blue-50/40 rounded px-1"
          />
          <select
            value={meta.cach_tinh}
            onChange={(e) => onDoiCach(e.target.value as CachTinhChiPhiKhac)}
            title="Cách tính: nhân theo khách (khách + 1 HDV) hay trọn đoàn, và N lấy từ đâu"
            className="h-5 shrink-0 rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-600 outline-none focus:border-blue-300"
          >
            {CACH_TINH_CHI_PHI_KHAC.map((o) => (
              <option key={o.value} value={o.value} title={o.giai_thich}>{o.nhan}</option>
            ))}
          </select>
        </span>
      </td>
      {/* ĐG USD (auto) */}
      <td className="border border-slate-200 px-2 py-1 text-right text-slate-500 tabular-nums">{fmtUsd(row.don_gia_usd)}</td>
      {/* ĐG VND — 0 tô cam: dòng đang tính 0 ₫ mà nhìn như đã có */}
      <td className="border border-slate-200 px-1 py-1 text-right">
        <Input
          type="text"
          inputMode="numeric"
          value={row.don_gia > 0 ? row.don_gia.toLocaleString("vi-VN") : ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "");
            onSua({ don_gia: digits ? parseInt(digits, 10) : 0 });
          }}
          onBlur={onCommit}
          placeholder="chưa có giá"
          title={chuaCoGia ? "Chưa có giá — dòng này đang tính 0 ₫" : undefined}
          className={cn(numInput, chuaCoGia && "border-amber-300 bg-amber-50 placeholder:text-amber-600")}
        />
      </td>
      {/* N — dòng tự tính: trống = theo số ngày/bữa, gõ = chốt đè (tô vàng) */}
      <td className="border border-slate-200 px-1 py-1 text-center">
        <Input
          type="number" min={0} step={1}
          value={meta.n_la_tu_dong ? "" : row.so_luong}
          placeholder={coTuDong ? String(meta.n_tu_dong) : "0"}
          title={coTuDong
            ? (meta.n_la_tu_dong
              ? `Tự tính = ${nTheo ? N_THEO_NHAN[nTheo] : "N"} (${meta.n_tu_dong}). Gõ số để chốt đè.`
              : `Đang dùng số gõ tay ${row.so_luong} (tự tính: ${meta.n_tu_dong}). Xoá trắng để về tự tính.`)
            : "Số lần (N). 0 = không phát sinh."}
          onChange={(e) => {
            const s = e.target.value.trim();
            // Dòng tự tính: xoá trắng = về tự tính. Dòng N cố định: xoá trắng = 0.
            if (s === "") { onSua({ so_lan: coTuDong ? null : 0 }); return; }
            const v = parseFloat(s);
            onSua({ so_lan: Number.isFinite(v) && v >= 0 ? v : 0 });
          }}
          onBlur={onCommit}
          className={cn(
            numInput, "text-center w-12 mx-auto",
            coTuDong && !meta.n_la_tu_dong && "border-amber-300 bg-amber-50 font-medium text-amber-800",
          )}
        />
        {coTuDong && nTheo && (
          <div className="mt-0.5 text-[9px] leading-tight text-slate-400">{N_THEO_NHAN[nTheo]}</div>
        )}
      </td>
      {/* Không có FOC */}
      <td className="border border-slate-200 px-1 py-1 text-center"><span className="text-slate-300">—</span></td>
      {/* Per-tier: SL (số suất nếu tính theo khách) + thành tiền */}
      {row.cells.map((cell, ti) => (
        <td key={ti} colSpan={2} className={cn("border border-slate-200 px-2 py-1", ti === matchIdx && "bg-emerald-50")}>
          <span className="flex items-center justify-between gap-2 tabular-nums">
            <span
              className="w-16 text-center text-slate-400"
              title={row.unit === "pax" ? `${cell.qty} suất = ${cell.guests} khách + 1 HDV` : "Trọn đoàn — không nhân số khách"}
            >
              {row.unit === "pax" ? cell.qty : "—"}
            </span>
            <span className="text-slate-700">{fmtVnd(cell.total)}</span>
          </span>
        </td>
      ))}
    </tr>
  );
}
