import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import {
  useDoanKhachLeList,
  useCreateDoanKhachLe,
  useUpdateDoanKhachLe,
  useDeleteDoanKhachLe,
  syncDoanPaxFromRoster,
  type DoanKhachLe,
} from "@/hooks/use-doan-khach-le";
import { sumRosterPax, sumRosterTien, thuStatus } from "@/lib/khach-le-calc";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const NUM_INPUT =
  "h-7 text-xs text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const TT_BADGE: Record<string, { label: string; cls: string }> = {
  chua_thu: { label: "Chưa thu", cls: "bg-red-100 text-red-700" },
  da_coc: { label: "Đã cọc", cls: "bg-amber-100 text-amber-700" },
  da_thu: { label: "Đã thu", cls: "bg-emerald-100 text-emerald-700" },
};

interface Props {
  doanId: number;
  canEdit: boolean;
}

export function KhachLeTab({ doanId, canEdit }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useDoanKhachLeList(doanId);
  const createMut = useCreateDoanKhachLe();
  const deleteMut = useDeleteDoanKhachLe();

  // Sync doan.so_khach_* = tổng roster (plain update, không cascade chi phí).
  const syncPax = useCallback(async () => {
    await syncDoanPaxFromRoster(doanId);
    qc.invalidateQueries({ queryKey: ["doan"] });
  }, [doanId, qc]);

  const handleAdd = async () => {
    try {
      await createMut.mutateAsync({
        doan_id: doanId,
        ho_ten: "Khách mới",
        so_khach_lon: 1,
        created_by: user?.user_id ?? null,
      });
      await syncPax();
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi thêm khách lẻ");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync({ id, doanId });
      await syncPax();
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi xóa khách lẻ");
    }
  };

  const pax = sumRosterPax(rows);
  const tien = sumRosterTien(rows);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Khách lẻ (đoàn ghép)</h3>
          <p className="text-xs text-muted-foreground">
            Số khách của đoàn tự cộng từ danh sách dưới. Theo dõi thu tiền theo từng khách.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAdd} disabled={!canEdit || createMut.isPending}>
          <Plus className="h-3.5 w-3.5" /> Thêm khách
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#E6F1FB] text-left">
              <th className="py-1.5 px-2 font-medium">Tên khách</th>
              <th className="py-1.5 px-2 font-medium">SĐT</th>
              <th className="py-1.5 px-2 font-medium text-right">Lớn</th>
              <th className="py-1.5 px-2 font-medium text-right">Em 50%</th>
              <th className="py-1.5 px-2 font-medium text-right">Em free</th>
              <th className="py-1.5 px-2 font-medium text-right">Giá bán</th>
              <th className="py-1.5 px-2 font-medium text-right">Đã thu</th>
              <th className="py-1.5 px-2 font-medium text-right">Còn lại</th>
              <th className="py-1.5 px-2 font-medium">TT</th>
              <th className="py-1.5 px-2 font-medium">Ghi chú</th>
              <th className="py-1.5 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={11} className="py-3 px-2 text-muted-foreground">Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="py-3 px-2 text-muted-foreground">Chưa có khách lẻ. Bấm "Thêm khách".</td></tr>
            ) : (
              rows.map((row) => (
                <KhachLeRow key={row.id} row={row} doanId={doanId} canEdit={canEdit} onPaxChanged={syncPax} onDelete={() => handleDelete(row.id)} />
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="py-1.5 px-2" colSpan={2}>Tổng {rows.length} khách</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{pax.lon}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{pax.em1}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{pax.em2}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmt(tien.giaBan)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-emerald-700">{fmt(tien.daThu)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-red-700">{fmt(tien.conLai)}</td>
                <td className="py-1.5 px-2" colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

interface RowProps {
  row: DoanKhachLe;
  doanId: number;
  canEdit: boolean;
  onPaxChanged: () => Promise<void>;
  onDelete: () => void;
}

function KhachLeRow({ row, doanId, canEdit, onPaxChanged, onDelete }: RowProps) {
  const updateMut = useUpdateDoanKhachLe();
  const [local, setLocal] = useState(row);
  useEffect(() => setLocal(row), [row]);

  // Lưu 1 field khi blur nếu đổi. paxField=true → sync số khách đoàn (cascade chi phí).
  const save = async (field: keyof DoanKhachLe, isPax = false) => {
    if (local[field] === row[field]) return;
    try {
      await updateMut.mutateAsync({ id: row.id, doanId, [field]: local[field] });
      if (isPax) await onPaxChanged();
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi lưu khách lẻ");
      setLocal(row); // revert
    }
  };

  const setF = <K extends keyof DoanKhachLe>(k: K, v: DoanKhachLe[K]) =>
    setLocal((p) => ({ ...p, [k]: v }));
  const numVal = (s: string) => (s === "" ? 0 : Math.max(0, Number(s) || 0));
  const conLai = (local.gia_ban || 0) - (local.da_thu || 0);
  const tt = TT_BADGE[thuStatus(local)] ?? TT_BADGE.chua_thu;

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="py-1 px-2">
        <Input className="h-7 text-xs" value={local.ho_ten ?? ""} disabled={!canEdit}
          onChange={(e) => setF("ho_ten", e.target.value)} onBlur={() => save("ho_ten")} />
      </td>
      <td className="py-1 px-2">
        <Input className="h-7 text-xs" value={local.so_dien_thoai ?? ""} disabled={!canEdit}
          onChange={(e) => setF("so_dien_thoai", e.target.value)} onBlur={() => save("so_dien_thoai")} />
      </td>
      <td className="py-1 px-2">
        <Input type="number" min={0} className={NUM_INPUT} value={local.so_khach_lon} disabled={!canEdit}
          onChange={(e) => setF("so_khach_lon", numVal(e.target.value))} onBlur={() => save("so_khach_lon", true)} />
      </td>
      <td className="py-1 px-2">
        <Input type="number" min={0} className={NUM_INPUT} value={local.so_khach_em1} disabled={!canEdit}
          onChange={(e) => setF("so_khach_em1", numVal(e.target.value))} onBlur={() => save("so_khach_em1", true)} />
      </td>
      <td className="py-1 px-2">
        <Input type="number" min={0} className={NUM_INPUT} value={local.so_khach_em2} disabled={!canEdit}
          onChange={(e) => setF("so_khach_em2", numVal(e.target.value))} onBlur={() => save("so_khach_em2", true)} />
      </td>
      <td className="py-1 px-2">
        <Input type="number" min={0} className={NUM_INPUT} value={local.gia_ban} disabled={!canEdit}
          onChange={(e) => setF("gia_ban", numVal(e.target.value))} onBlur={() => save("gia_ban")} />
      </td>
      <td className="py-1 px-2">
        <Input type="number" min={0} className={NUM_INPUT} value={local.da_thu} disabled={!canEdit}
          onChange={(e) => setF("da_thu", numVal(e.target.value))} onBlur={() => save("da_thu")} />
      </td>
      <td className="py-1 px-2 text-right tabular-nums text-red-700">{fmt(conLai)}</td>
      <td className="py-1 px-2">
        <span className={`px-1.5 py-px rounded text-[10px] font-medium whitespace-nowrap ${tt.cls}`}>{tt.label}</span>
      </td>
      <td className="py-1 px-2">
        <Input className="h-7 text-xs" value={local.ghi_chu ?? ""} disabled={!canEdit}
          onChange={(e) => setF("ghi_chu", e.target.value)} onBlur={() => save("ghi_chu")} />
      </td>
      <td className="py-1 px-2 text-center">
        <button onClick={onDelete} disabled={!canEdit} className="text-red-500 hover:text-red-700 disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
