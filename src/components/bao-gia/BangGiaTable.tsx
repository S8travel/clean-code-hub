import { memo, useCallback, useMemo, useState } from "react";
import { Search, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { errMsg } from "@/lib/error";
import { useIsReadOnly } from "@/hooks/use-permissions";
import {
  useAddBangGiaRow, useDeleteBangGiaRow, useUpdateBangGiaRow,
  type BangGiaDichVu,
} from "@/hooks/use-bang-gia-dich-vu";
import {
  boDau, chuanHoaFoc, chuanHoaGia, locBangGia, tenBiTrung, loiDongBangGia,
  type BangGiaLoai,
} from "@/lib/bang-gia-sua-tay";

const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  nha_hang: "Nhà hàng",
  xe: "Xe",
  dich_vu: "Dịch vụ",
};

const LOAI_COLOR: Record<string, string> = {
  hotel: "bg-blue-100 text-blue-700",
  nha_hang: "bg-green-100 text-green-700",
  xe: "bg-cyan-100 text-cyan-700",
  dich_vu: "bg-orange-100 text-orange-700",
};

const LOAI_LIST: BangGiaLoai[] = ["hotel", "nha_hang", "xe", "dich_vu"];

// Bảng giá có mấy trăm dòng. Dựng sẵn ô nhập cho tất cả làm lần mở tab nào cũng
// khựng, nên chỉ dựng CAP dòng đầu — kèm dòng chữ nói rõ đang giấu bao nhiêu và
// nút mở hết, chứ không cắt lặng lẽ để người dùng tưởng bảng chỉ có ngần đó.
const CAP = 100;

const oNhap = "h-7 text-xs";
const oSelect = "h-7 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus:border-blue-400";

export function BangGiaTable({ rows }: { rows: BangGiaDichVu[] }) {
  const readOnly = useIsReadOnly();
  const [q, setQ] = useState("");
  const [loai, setLoai] = useState<BangGiaLoai | "tat_ca">("tat_ca");
  const [hienTatCa, setHienTatCa] = useState(false);

  // Lấy riêng mutateAsync: object mutation đổi identity mỗi lần state của nó đổi
  // → callback đổi theo → memo của MỌI dòng vỡ, sửa 1 ô là cả bảng render lại.
  const { mutateAsync: updateAsync } = useUpdateBangGiaRow();
  const { mutateAsync: deleteAsync } = useDeleteBangGiaRow();

  const daLoc = useMemo(() => locBangGia(rows, { q, loai }), [rows, q, loai]);
  const trung = useMemo(() => tenBiTrung(rows), [rows]);
  const hienThi = hienTatCa ? daLoc : daLoc.slice(0, CAP);
  const conAn = daLoc.length - hienThi.length;

  const luu = useCallback(
    async (id: number, patch: Partial<BangGiaDichVu>) => { await updateAsync({ id, patch }); },
    [updateAsync],
  );
  const xoa = useCallback(
    async (id: number) => { await deleteAsync(id); },
    [deleteAsync],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên dịch vụ (không cần gõ dấu)"
            className="h-8 w-64 pl-7 text-xs"
          />
        </div>
        <select
          value={loai}
          onChange={(e) => setLoai(e.target.value as BangGiaLoai | "tat_ca")}
          className="h-8 rounded border border-input bg-background px-2 text-xs outline-none focus:border-blue-400"
        >
          <option value="tat_ca">Tất cả loại</option>
          {LOAI_LIST.map((l) => <option key={l} value={l}>{LOAI_LABEL[l]}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          {daLoc.length}/{rows.length} dịch vụ
        </span>
        <div className="ml-auto">
          <ThemDongForm loaiMacDinh={loai === "tat_ca" ? "dich_vu" : loai} disabled={readOnly} />
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[#E6F1FB]">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Tên dịch vụ</th>
              <th className="w-[120px] px-2 py-1.5 text-center font-semibold">Loại</th>
              <th className="w-[130px] px-2 py-1.5 text-right font-semibold">Giá (VND)</th>
              <th className="w-[70px] px-2 py-1.5 text-center font-semibold" title="Số suất/phòng miễn">FOC</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {hienThi.map((row) => (
              <DongBangGia
                key={row.id}
                row={row}
                trungTen={trung.has(boDau(row.ten))}
                readOnly={readOnly}
                luu={luu}
                xoa={xoa}
              />
            ))}
            {daLoc.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                  Không có dịch vụ nào khớp — thử bỏ bớt từ khoá hoặc đổi loại.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {conAn > 0 && (
        <div className="flex items-center gap-2 rounded bg-slate-50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span>Đang hiện {hienThi.length} dòng đầu, còn <strong>{conAn}</strong> dòng chưa dựng (cho nhẹ máy).</span>
          <button type="button" className="text-primary hover:underline" onClick={() => setHienTatCa(true)}>
            Hiện tất cả {daLoc.length} dòng
          </button>
          <span>hoặc gõ tìm kiếm để lọc.</span>
        </div>
      )}
    </div>
  );
}

// ── 1 dòng sửa tay ──────────────────────────────────────────────────────────
// State cục bộ seed 1 lần lúc mount (key = row.id). KHÔNG seed lại theo props:
// người ghi duy nhất là chính ô này, mà seed lại giữa lúc đang gõ thì chữ nhảy.
// Lưu hỏng → trả ô về đúng giá trị server, không để màn hình nói dối là đã lưu.
interface DongProps {
  row: BangGiaDichVu;
  trungTen: boolean;
  readOnly: boolean;
  luu: (id: number, patch: Partial<BangGiaDichVu>) => Promise<void>;
  xoa: (id: number) => Promise<void>;
}

const DongBangGia = memo(function DongBangGia({ row, trungTen, readOnly, luu, xoa }: DongProps) {
  const [ten, setTen] = useState(row.ten);
  const [loai, setLoai] = useState<string>(row.loai);
  const [giaText, setGiaText] = useState(row.gia ? Number(row.gia).toLocaleString("vi-VN") : "");
  const [focText, setFocText] = useState(row.foc ? String(row.foc) : "");
  const [vuaLuu, setVuaLuu] = useState(false);
  const [dangXoa, setDangXoa] = useState(false);

  const chay = async (patch: Partial<BangGiaDichVu>, hoanTac: () => void) => {
    try {
      await luu(row.id, patch);
      setVuaLuu(true);
      window.setTimeout(() => setVuaLuu(false), 1200);
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Không lưu được — đã trả ô về giá trị cũ");
      hoanTac();
    }
  };

  const luuTen = () => {
    const v = ten.trim();
    if (v === row.ten) { setTen(row.ten); return; }
    if (!v) {
      toast.error(loiDongBangGia({ ten: v, gia: 1 }) ?? "Tên không được để trống");
      setTen(row.ten);
      return;
    }
    chay({ ten: v }, () => setTen(row.ten));
  };

  const luuGia = () => {
    const v = chuanHoaGia(giaText);
    const cu = row.gia == null ? null : Number(row.gia);
    if (v == null) {
      toast.error(loiDongBangGia({ ten: row.ten, gia: v }) ?? "Giá không hợp lệ");
      setGiaText(cu ? cu.toLocaleString("vi-VN") : "");
      return;
    }
    setGiaText(v.toLocaleString("vi-VN"));
    if (v === cu) return;
    chay({ gia: v }, () => setGiaText(cu ? cu.toLocaleString("vi-VN") : ""));
  };

  const luuFoc = () => {
    const v = chuanHoaFoc(focText);
    const cu = Number(row.foc ?? 0);
    setFocText(v ? String(v) : "");
    if (v === cu) return;
    chay({ foc: v }, () => setFocText(cu ? String(cu) : ""));
  };

  const luuLoai = (v: string) => {
    setLoai(v);
    if (v === row.loai) return;
    chay({ loai: v as BangGiaDichVu["loai"] }, () => setLoai(row.loai));
  };

  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="px-2 py-1">
        <div className="flex items-center gap-1.5">
          <Input
            value={ten}
            disabled={readOnly}
            onChange={(e) => setTen(e.target.value)}
            onBlur={luuTen}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className={oNhap}
          />
          {vuaLuu && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          {trungTen && (
            <span
              className="shrink-0 text-amber-600"
              title="Có dòng khác trùng tên này. Hai dòng cùng tên khác giá thì lúc chọn trong báo giá không biết dòng nào đúng."
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1">
        {/* Giữ màu theo loại như bảng cũ — nhìn lướt vẫn phân biệt được nhóm. */}
        <select
          value={loai}
          disabled={readOnly}
          onChange={(e) => luuLoai(e.target.value)}
          className={`${oSelect} font-medium ${LOAI_COLOR[loai] ?? ""}`}
        >
          {LOAI_LIST.map((l) => <option key={l} value={l}>{LOAI_LABEL[l]}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <Input
          value={giaText}
          disabled={readOnly}
          inputMode="numeric"
          onChange={(e) => setGiaText(e.target.value)}
          onBlur={luuGia}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${oNhap} text-right font-mono`}
        />
      </td>
      <td className="px-2 py-1">
        <Input
          value={focText}
          disabled={readOnly}
          inputMode="decimal"
          placeholder="0"
          onChange={(e) => setFocText(e.target.value)}
          onBlur={luuFoc}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${oNhap} text-center`}
        />
      </td>
      <td className="px-1 py-1 text-center">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={readOnly || dangXoa}
              className="text-slate-400 hover:text-red-500 disabled:opacity-30"
              title="Bỏ dịch vụ này khỏi bảng giá"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bỏ “{row.ten}” khỏi bảng giá?</AlertDialogTitle>
              <AlertDialogDescription>
                Dòng này sẽ không còn hiện khi chọn dịch vụ cho báo giá mới. Các báo giá đã
                lập KHÔNG bị ảnh hưởng — chúng giữ giá đã chốt tại thời điểm lập.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setDangXoa(true);
                  try { await xoa(row.id); }
                  catch (e: unknown) { toast.error(errMsg(e) || "Không bỏ được dòng này"); setDangXoa(false); }
                }}
              >
                Bỏ khỏi bảng giá
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
});

// ── Thêm dịch vụ mới ────────────────────────────────────────────────────────
// Chèn xong mới lưu, KHÔNG tạo dòng trống trước rồi điền sau: bảng giá này dùng
// chung cả công ty, một dòng rỗng nằm đó là ai cũng chọn nhầm được.
function ThemDongForm({ loaiMacDinh, disabled }: { loaiMacDinh: BangGiaLoai; disabled: boolean }) {
  const [mo, setMo] = useState(false);
  const [ten, setTen] = useState("");
  const [loai, setLoai] = useState<BangGiaLoai>(loaiMacDinh);
  const [giaText, setGiaText] = useState("");
  const [focText, setFocText] = useState("");
  const add = useAddBangGiaRow();

  const gia = chuanHoaGia(giaText);
  const loi = loiDongBangGia({ ten, gia });

  const dong = () => {
    setMo(false); setTen(""); setGiaText(""); setFocText("");
  };

  const them = () => {
    if (loi) { toast.error(loi); return; }
    add.mutate(
      { ten: ten.trim(), loai, gia, foc: chuanHoaFoc(focText) },
      {
        onSuccess: () => { toast.success(`Đã thêm “${ten.trim()}” vào bảng giá`); dong(); },
        onError: (e) => toast.error(errMsg(e) || "Không thêm được"),
      },
    );
  };

  if (!mo) {
    return (
      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={disabled} onClick={() => { setLoai(loaiMacDinh); setMo(true); }}>
        <Plus className="h-3.5 w-3.5" /> Thêm dịch vụ
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border bg-slate-50 p-1.5">
      <Input
        autoFocus value={ten} onChange={(e) => setTen(e.target.value)}
        placeholder="Tên dịch vụ" className="h-7 w-52 text-xs"
        onKeyDown={(e) => { if (e.key === "Enter") them(); if (e.key === "Escape") dong(); }}
      />
      <select value={loai} onChange={(e) => setLoai(e.target.value as BangGiaLoai)} className={`${oSelect} w-28`}>
        {LOAI_LIST.map((l) => <option key={l} value={l}>{LOAI_LABEL[l]}</option>)}
      </select>
      <Input
        value={giaText} inputMode="numeric" onChange={(e) => setGiaText(e.target.value)}
        placeholder="Giá" className="h-7 w-28 text-right font-mono text-xs"
        onKeyDown={(e) => { if (e.key === "Enter") them(); if (e.key === "Escape") dong(); }}
      />
      <Input
        value={focText} inputMode="decimal" onChange={(e) => setFocText(e.target.value)}
        placeholder="FOC" className="h-7 w-16 text-center text-xs"
        onKeyDown={(e) => { if (e.key === "Enter") them(); if (e.key === "Escape") dong(); }}
      />
      <Button size="sm" className="h-7 text-xs" disabled={!!loi || add.isPending} onClick={them} title={loi ?? "Thêm vào bảng giá"}>
        Thêm
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dong}>Hủy</Button>
    </div>
  );
}
