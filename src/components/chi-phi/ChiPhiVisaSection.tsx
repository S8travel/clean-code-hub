import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useChiPhiList, useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { useDonViVisaList, useLoaiVisaList } from "@/hooks/use-visa";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
}

function VisaRow({ row, doanId }: { row: any; doanId: number }) {
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const [soLuong, setSoLuong] = useState(row.so_luong ?? 1);
  const [donGia, setDonGia] = useState(row.don_gia ?? 0);

  useEffect(() => {
    setSoLuong(row.so_luong ?? 1);
    setDonGia(row.don_gia ?? 0);
  }, [row.id]);

  const thanhTien = soLuong * donGia;

  const handleSave = () => {
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: soLuong,
      don_gia: donGia,
      tien_cong_ty: thanhTien,
    } as any, {
      onSuccess: () => toast.success("Đã lưu"),
    });
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 text-sm">{row.mo_ta}</td>
      <td className="px-4 py-2 w-20">
        <Input
          type="number"
          value={soLuong || ""}
          onChange={(e) => setSoLuong(Number(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs text-center px-1"
        />
      </td>
      <td className="px-4 py-2 w-32">
        <Input
          type="number"
          value={donGia || ""}
          onChange={(e) => setDonGia(Number(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs text-center px-1"
        />
      </td>
      <td className="px-4 py-2.5 text-right text-sm font-medium">{thanhTien > 0 ? fmt(thanhTien) + " ₫" : "—"}</td>
      <td className="px-2 py-2.5 w-8">
        <Button
          size="icon" variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => deleteMut.mutate({ id: row.id, doanId }, { onSuccess: () => toast.success("Đã xóa") })}
          disabled={deleteMut.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

function AddVisaRow({ doanId, onAdded }: { doanId: number; onAdded: () => void }) {
  const { data: donViList = [] } = useDonViVisaList();
  const [donViId, setDonViId] = useState("");
  const [loaiVisaId, setLoaiVisaId] = useState("");
  const { data: loaiVisaList = [] } = useLoaiVisaList(donViId ? Number(donViId) : null);
  const upsertMut = useUpsertChiPhi();

  const donViOptions = donViList.map((d) => ({ value: String(d.id), label: d.ten }));
  const loaiOptions = loaiVisaList.map((l) => ({
    value: String(l.id),
    label: [l.quoc_gia, l.loai, l.thoi_han].filter(Boolean).join(" · "),
  }));

  const selectedLoai = loaiVisaList.find((l) => String(l.id) === loaiVisaId);
  const selectedDonVi = donViList.find((d) => String(d.id) === donViId);

  const handleAdd = async () => {
    if (!loaiVisaId) { toast.warning("Vui lòng chọn loại visa"); return; }
    const moTa = [
      selectedDonVi?.ten,
      selectedLoai?.quoc_gia,
      selectedLoai?.loai,
      selectedLoai?.thoi_han,
    ].filter(Boolean).join(" · ");

    await upsertMut.mutateAsync({
      doan_id: doanId,
      danh_muc: "visa",
      loai: "visa",
      mo_ta: moTa,
      don_gia: selectedLoai?.gia ?? 0,
      so_luong: 1,
      tien_cong_ty: selectedLoai?.gia ?? 0,
      tien_hdv: 0,
      nha_cung_cap_id: selectedDonVi?.nha_cung_cap_id ?? null,
    } as any, {
      onSuccess: () => { toast.success("Đã thêm visa"); onAdded(); },
    });
  };

  return (
    <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Đơn vị visa</Label>
          <SearchableSelect
            options={donViOptions}
            value={donViId}
            onChange={(v) => { setDonViId(v); setLoaiVisaId(""); }}
            placeholder="Chọn đơn vị"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Loại visa *</Label>
          <SearchableSelect
            options={loaiOptions}
            value={loaiVisaId}
            onChange={setLoaiVisaId}
            placeholder="Chọn loại visa"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={upsertMut.isPending}>
          Thêm
        </Button>
      </div>
    </div>
  );
}

export default function ChiPhiVisaSection({ doanId }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const [showAdd, setShowAdd] = useState(false);

  const visaRows = chiPhiRows.filter((r) => r.danh_muc === "visa");
  const total = visaRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-sm font-semibold">🛂 Visa</span>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-sm font-semibold">{fmt(total)} ₫</span>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdd(!showAdd)}>
            + Thêm
          </Button>
        </div>
      </div>

      {visaRows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Loại visa</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">SL</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Đơn giá</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Thành tiền</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {visaRows.map((row) => (
              <VisaRow key={row.id} row={row} doanId={doanId} />
            ))}
          </tbody>
        </table>
      )}

      {visaRows.length === 0 && !showAdd && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Bấm "+ Thêm" để thêm chi phí visa.</p>
      )}

      {showAdd && (
        <AddVisaRow doanId={doanId} onAdded={() => setShowAdd(false)} />
      )}
    </div>
  );
}
