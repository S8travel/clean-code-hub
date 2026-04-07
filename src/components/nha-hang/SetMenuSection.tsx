import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSetMenus,
  useCreateSetMenu,
  useUpdateSetMenu,
  useDeleteSetMenu,
  useSetMenuMons,
  useReplaceMonList,
  type SetMenu,
} from "@/hooks/use-nha-hang";

interface Props {
  nhaHangId: number;
}

export default function SetMenuSection({ nhaHangId }: Props) {
  const { data: setMenus } = useSetMenus(nhaHangId);
  const createMut = useCreateSetMenu();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleAdd = async () => {
    try {
      const created = await createMut.mutateAsync({ nha_hang_id: nhaHangId, ten_set: "Set mới" });
      setExpandedId(created.id);
    } catch {
      toast.error("Lỗi tạo set menu");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Set menu</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAdd}>
          <Plus className="h-3 w-3 mr-1" /> Thêm set
        </Button>
      </div>

      {(setMenus ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có set menu nào</p>
      ) : (
        <div className="space-y-2">
          {(setMenus ?? []).map((sm) => (
            <SetMenuCard
              key={sm.id}
              setMenu={sm}
              expanded={expandedId === sm.id}
              onToggle={() => setExpandedId(expandedId === sm.id ? null : sm.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SetMenuCard({
  setMenu,
  expanded,
  onToggle,
}: {
  setMenu: SetMenu;
  expanded: boolean;
  onToggle: () => void;
}) {
  const updateMut = useUpdateSetMenu();
  const deleteMut = useDeleteSetMenu();

  const handleBlur = (field: string, value: string | number | null) => {
    updateMut.mutate({ id: setMenu.id, nha_hang_id: setMenu.nha_hang_id, [field]: value });
  };

  return (
    <div className="border rounded-md">
      <div className="flex items-center gap-2 p-2">
        <button onClick={onToggle} className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Input
          defaultValue={setMenu.ten_set}
          onBlur={(e) => handleBlur("ten_set", e.target.value)}
          className="h-7 text-xs font-medium flex-1"
          placeholder="Tên set"
        />
        <Input
          type="number"
          defaultValue={setMenu.gia ?? ""}
          onBlur={(e) => handleBlur("gia", e.target.value ? Number(e.target.value) : null)}
          className="h-7 text-xs w-24"
          placeholder="Giá"
        />
        <Select
          defaultValue={setMenu.don_vi ?? "VND"}
          onValueChange={(v) => handleBlur("don_vi", v)}
        >
          <SelectTrigger className="h-7 text-xs w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VND">VND</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => deleteMut.mutate({ id: setMenu.id, nha_hang_id: setMenu.nha_hang_id })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && <MonListEditor setMenuId={setMenu.id} />}
    </div>
  );
}

type MonRow = { ten_mon: string; ten_mon_trung: string };

function MonListEditor({ setMenuId }: { setMenuId: number }) {
  const { data: mons } = useSetMenuMons(setMenuId);
  const replaceMut = useReplaceMonList();
  const [rows, setRows] = useState<MonRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (mons) {
      setRows(mons.map((m) => ({ ten_mon: m.ten_mon, ten_mon_trung: m.ten_mon_trung ?? "" })));
      setDirty(false);
    }
  }, [mons]);

  const updateRow = (i: number, field: keyof MonRow, value: string) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ten_mon: "", ten_mon_trung: "" }]);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await replaceMut.mutateAsync({
        set_menu_id: setMenuId,
        items: rows
          .filter((r) => r.ten_mon.trim())
          .map((r, i) => ({
            ten_mon: r.ten_mon.trim(),
            ten_mon_trung: r.ten_mon_trung.trim() || null,
            thu_tu: i + 1,
          })),
      });
      setDirty(false);
      toast.success("Đã lưu danh sách món");
    } catch {
      toast.error("Lỗi lưu danh sách món");
    }
  };

  const validCount = rows.filter((r) => r.ten_mon.trim()).length;

  return (
    <div className="border-t px-3 py-2 space-y-2">
      {rows.length > 0 && (
        <div className="grid grid-cols-[20px_1fr_1fr_24px] gap-1 text-[10px] text-muted-foreground font-medium pb-0.5">
          <span>#</span>
          <span>Tên món (VN)</span>
          <span>Tiếng Trung</span>
          <span />
        </div>
      )}
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[20px_1fr_1fr_24px] gap-1 items-center">
            <span className="text-[10px] text-muted-foreground/60 text-right pr-0.5">{i + 1}.</span>
            <Input
              value={row.ten_mon}
              onChange={(e) => updateRow(i, "ten_mon", e.target.value)}
              placeholder="Tên món..."
              className="h-7 text-xs"
            />
            <Input
              value={row.ten_mon_trung}
              onChange={(e) => updateRow(i, "ten_mon_trung", e.target.value)}
              placeholder="中文名称..."
              className="h-7 text-xs"
            />
            <button
              onClick={() => removeRow(i)}
              className="h-6 w-6 flex items-center justify-center text-muted-foreground/50 hover:text-destructive rounded"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addRow}>
          <Plus className="h-3 w-3 mr-1" /> Thêm món
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{validCount} món</span>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={replaceMut.isPending || !dirty}
          >
            <Save className="h-3 w-3 mr-1" /> Lưu danh sách
          </Button>
        </div>
      </div>
    </div>
  );
}
