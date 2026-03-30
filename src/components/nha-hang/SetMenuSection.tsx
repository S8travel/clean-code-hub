import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

      {expanded && <MonListTextarea setMenuId={setMenu.id} />}
    </div>
  );
}

function MonListTextarea({ setMenuId }: { setMenuId: number }) {
  const { data: mons } = useSetMenuMons(setMenuId);
  const replaceMut = useReplaceMonList();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  // Load existing dishes into textarea
  useEffect(() => {
    if (mons) {
      setText(mons.map((m) => m.ten_mon).join("\n"));
      setDirty(false);
    }
  }, [mons]);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const handleSave = async () => {
    try {
      await replaceMut.mutateAsync({
        set_menu_id: setMenuId,
        items: lines.map((name, i) => ({ ten_mon: name, thu_tu: i + 1 })),
      });
      setDirty(false);
      toast.success("Đã lưu danh sách món");
    } catch {
      toast.error("Lỗi lưu danh sách món");
    }
  };

  return (
    <div className="border-t px-3 py-2 space-y-2">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        placeholder="Nhập mỗi món 1 dòng&#10;VD:&#10;Súp hải sản&#10;Nem rán Hà Nội&#10;Cơm trắng"
        className="text-xs min-h-[100px]"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={replaceMut.isPending || !dirty}
        >
          <Save className="h-3 w-3 mr-1" /> Lưu danh sách
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {lines.length} món
        </span>
      </div>
      {lines.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
          {lines.map((line, i) => (
            <div key={i}>
              <span className="text-muted-foreground/60 w-5 inline-block">{i + 1}.</span>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
