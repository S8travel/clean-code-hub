import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import {
  useKhachSanGiaPhong,
  useCreateGiaPhong,
  useUpdateGiaPhong,
  useDeleteGiaPhong,
  type GiaPhongRow,
} from "@/hooks/use-khach-san-gia-phong";

interface Props {
  khachSanId: number;
}

// Quản lý giá phòng KS theo GIAI ĐOẠN. Dòng không có ngày = "Mặc định" (quanh năm).
export function GiaPhongSection({ khachSanId }: Props) {
  const { data: rows = [], isLoading } = useKhachSanGiaPhong(khachSanId);
  const createMut = useCreateGiaPhong();

  const handleAdd = async () => {
    try {
      await createMut.mutateAsync({ khach_san_id: khachSanId, ten_giai_doan: "", gia: 0 });
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi thêm giai đoạn");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Giá phòng theo giai đoạn</h3>
          <p className="text-[11px] text-muted-foreground">
            Mỗi giai đoạn (mùa) một mức giá. Dòng <b>không nhập ngày</b> = giá mặc định (quanh năm).
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleAdd} disabled={createMut.isPending}>
          {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Thêm giai đoạn
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          Chưa có giá. Nhấn "Thêm giai đoạn" để thêm.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#E6F1FB]">
                <th className="text-left py-1.5 px-2 font-semibold">Giai đoạn</th>
                <th className="text-left py-1.5 px-2 font-semibold">Từ ngày</th>
                <th className="text-left py-1.5 px-2 font-semibold">Đến ngày</th>
                <th className="text-left py-1.5 px-2 font-semibold">Loại phòng</th>
                <th className="text-right py-1.5 px-2 font-semibold">Giá / phòng (VND)</th>
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <GiaPhongRowEditor key={r.id} row={r} khachSanId={khachSanId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GiaPhongRowEditor({ row, khachSanId }: { row: GiaPhongRow; khachSanId: number }) {
  const updateMut = useUpdateGiaPhong();
  const deleteMut = useDeleteGiaPhong();

  // Local state seed từ row — mỗi keystroke cập nhật local, blur mới persist.
  const [ten, setTen] = useState(row.ten_giai_doan ?? "");
  const [tu, setTu] = useState(row.tu_ngay ?? "");
  const [den, setDen] = useState(row.den_ngay ?? "");
  const [loai, setLoai] = useState(row.loai_phong ?? "");
  const [gia, setGia] = useState<number>(row.gia ?? 0);

  // Re-seed khi row đổi (refetch sau lưu / chọn KS khác).
  useEffect(() => {
    setTen(row.ten_giai_doan ?? "");
    setTu(row.tu_ngay ?? "");
    setDen(row.den_ngay ?? "");
    setLoai(row.loai_phong ?? "");
    setGia(row.gia ?? 0);
  }, [row]);

  const save = (patch: Partial<GiaPhongRow>) => {
    updateMut.mutate(
      { ...patch, id: row.id, khach_san_id: khachSanId },
      { onError: (e) => toast.error(errMsg(e) || "Lỗi lưu") },
    );
  };

  const handleDelete = () => {
    deleteMut.mutate(
      { id: row.id, khach_san_id: khachSanId },
      { onError: (e) => toast.error(errMsg(e) || "Lỗi xóa") },
    );
  };

  const isMacDinh = !tu && !den;

  return (
    <tr className="border-t border-slate-100">
      <td className="py-1 px-2">
        <Input
          value={ten}
          onChange={(e) => setTen(e.target.value)}
          onBlur={() => { if ((ten || null) !== (row.ten_giai_doan ?? null)) save({ ten_giai_doan: ten || null }); }}
          placeholder={isMacDinh ? "Mặc định" : "Tên giai đoạn"}
          className="h-7 text-xs min-w-[140px]"
        />
      </td>
      <td className="py-1 px-2">
        <Input
          type="date"
          value={tu}
          onChange={(e) => setTu(e.target.value)}
          onBlur={() => { if ((tu || null) !== (row.tu_ngay ?? null)) save({ tu_ngay: tu || null }); }}
          className="h-7 text-xs w-[140px]"
        />
      </td>
      <td className="py-1 px-2">
        <Input
          type="date"
          value={den}
          onChange={(e) => setDen(e.target.value)}
          onBlur={() => { if ((den || null) !== (row.den_ngay ?? null)) save({ den_ngay: den || null }); }}
          className="h-7 text-xs w-[140px]"
        />
      </td>
      <td className="py-1 px-2">
        <Input
          value={loai}
          onChange={(e) => setLoai(e.target.value)}
          onBlur={() => { if ((loai || null) !== (row.loai_phong ?? null)) save({ loai_phong: loai || null }); }}
          placeholder="TWN/DBL"
          className="h-7 text-xs w-[110px]"
        />
      </td>
      <td className="py-1 px-2">
        <Input
          type="text"
          inputMode="numeric"
          value={gia > 0 ? gia.toLocaleString("vi-VN") : ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "");
            setGia(digits ? parseInt(digits, 10) : 0);
          }}
          onBlur={() => { if ((gia ?? 0) !== (row.gia ?? 0)) save({ gia }); }}
          placeholder="0"
          className="h-7 text-xs text-right min-w-[120px]"
        />
      </td>
      <td className="py-1 px-1 text-center">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMut.isPending}
          className="text-slate-400 hover:text-red-500 disabled:opacity-40"
          title="Xóa giai đoạn"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
