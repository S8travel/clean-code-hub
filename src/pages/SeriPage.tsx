import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Hotel, UtensilsCrossed, MapPin, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useSeriList, useCreateSeri, useUpdateSeri, useDeleteSeri,
  useSeriNgayList, useAddSeriNgay, useUpdateSeriNgay, useDeleteSeriNgay,
  useSeriNgayItems, useAddSeriNgayItem, useDeleteSeriNgayItem,
  useSetMenuByNhaHang,
  type SeriTour, type SeriNgay,
} from "@/hooks/use-seri";
import { useNhaHang, useKhachSan, useCanhDiem } from "@/hooks/use-dieu-tour";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── NhaHang set menu inline selector ──
function SetMenuSelect({
  nhaHangId,
  value,
  onChange,
  placeholder,
}: {
  nhaHangId: number | null;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  const { data: menus = [] } = useSetMenuByNhaHang(nhaHangId);
  const opts = menus.map((m) => ({ value: String(m.id), label: `${m.ten_set}${m.gia ? ` (${m.gia.toLocaleString("vi-VN")})` : ""}` }));
  return (
    <SearchableSelect
      options={opts}
      value={value ? String(value) : ""}
      onChange={(v) => onChange(v ? Number(v) : null)}
      placeholder={placeholder}
    />
  );
}

// ── Day editor (one ngay) ──
function DayEditor({
  ngay,
  seriId,
  onDelete,
}: {
  ngay: SeriNgay;
  seriId: number;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newCanhDiemId, setNewCanhDiemId] = useState<string>("");

  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const { data: allItems = [] } = useSeriNgayItems(seriId);
  const { data: canhDiemList = [] } = useCanhDiem();

  const updateNgay = useUpdateSeriNgay();
  const addItem = useAddSeriNgayItem();
  const deleteItem = useDeleteSeriNgayItem();

  const myItems = useMemo(
    () => allItems.filter((it) => it.seri_ngay_id === ngay.id),
    [allItems, ngay.id]
  );

  const nhHangOpts = nhaHangList.map((n) => ({ value: String(n.id), label: n.ten }));
  const ksOpts = khachSanList.map((k) => ({ value: String(k.id), label: k.ten }));
  const canhDiemOpts = canhDiemList.map((c) => ({ value: String(c.id), label: c.ten }));

  const set = (field: string, value: any) => {
    updateNgay.mutate({ id: ngay.id, seri_id: seriId, [field]: value });
  };

  const handleAddItem = () => {
    if (!newCanhDiemId) return;
    const cd = canhDiemList.find((c) => c.id === Number(newCanhDiemId));
    addItem.mutate({
      seri_ngay_id: ngay.id,
      seri_id: seriId,
      canh_diem_id: Number(newCanhDiemId),
      thu_tu: myItems.length,
      co_phi: cd?.co_phi ?? false,
      don_gia: cd?.gia_mac_dinh ?? 0,
      nguoi_thanh_toan: cd?.nguoi_thanh_toan ?? null,
      ghi_chu: null,
    }, {
      onSuccess: () => { setNewCanhDiemId(""); setAddingItem(false); },
    });
  };

  const ksName = khachSanList.find((k) => k.id === ngay.khach_san_id)?.ten;
  const trua = nhaHangList.find((n) => n.id === ngay.an_trua_nha_hang_id)?.ten;
  const toi = nhaHangList.find((n) => n.id === ngay.an_toi_nha_hang_id)?.ten;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-muted/40 cursor-pointer select-none hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-primary w-14 shrink-0">
            Ngày {ngay.ngay_so}
          </span>
          {ngay.thanh_pho && (
            <span className="text-sm text-muted-foreground">{ngay.thanh_pho}</span>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {ksName && (
              <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                <Hotel className="h-3 w-3" /> {ksName}
              </span>
            )}
            {trua && (
              <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded">
                <UtensilsCrossed className="h-3 w-3" /> Trưa: {trua}
              </span>
            )}
            {toi && (
              <span className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded">
                <UtensilsCrossed className="h-3 w-3" /> Tối: {toi}
              </span>
            )}
            {myItems.length > 0 && (
              <span className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded">
                <MapPin className="h-3 w-3" /> {myItems.length} điểm
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="p-4 space-y-4 bg-background">
          {/* Thành phố */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Thành phố / Điểm đến</Label>
              <Input
                className="h-8 text-sm"
                defaultValue={ngay.thanh_pho ?? ""}
                onBlur={(e) => set("thanh_pho", e.target.value || null)}
                placeholder="VD: Hà Nội"
              />
            </div>
          </div>

          {/* Khách sạn */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Hotel className="h-3.5 w-3.5 text-blue-600" /> Khách sạn
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <SearchableSelect
                options={ksOpts}
                value={ngay.khach_san_id ? String(ngay.khach_san_id) : ""}
                onChange={(v) => set("khach_san_id", v ? Number(v) : null)}
                placeholder="Chọn KS"
              />
              <Input
                className="h-9 text-sm"
                defaultValue={ngay.ks_loai_phong ?? ""}
                onBlur={(e) => set("ks_loai_phong", e.target.value || null)}
                placeholder="Loại phòng"
              />
              <Input
                className="h-9 text-sm"
                defaultValue={ngay.ks_ma_code ?? ""}
                onBlur={(e) => set("ks_ma_code", e.target.value || null)}
                placeholder="Mã code"
              />
            </div>
          </div>

          {/* Nhà hàng trưa */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" /> Ăn trưa
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <SearchableSelect
                options={nhHangOpts}
                value={ngay.an_trua_nha_hang_id ? String(ngay.an_trua_nha_hang_id) : ""}
                onChange={(v) => set("an_trua_nha_hang_id", v ? Number(v) : null)}
                placeholder="Chọn nhà hàng"
              />
              <SetMenuSelect
                nhaHangId={ngay.an_trua_nha_hang_id}
                value={ngay.an_trua_set_menu_id}
                onChange={(v) => set("an_trua_set_menu_id", v)}
                placeholder="Chọn set menu"
              />
            </div>
          </div>

          {/* Nhà hàng tối */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" /> Ăn tối
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <SearchableSelect
                options={nhHangOpts}
                value={ngay.an_toi_nha_hang_id ? String(ngay.an_toi_nha_hang_id) : ""}
                onChange={(v) => set("an_toi_nha_hang_id", v ? Number(v) : null)}
                placeholder="Chọn nhà hàng"
              />
              <SetMenuSelect
                nhaHangId={ngay.an_toi_nha_hang_id}
                value={ngay.an_toi_set_menu_id}
                onChange={(v) => set("an_toi_set_menu_id", v)}
                placeholder="Chọn set menu"
              />
            </div>
          </div>

          {/* Cảnh điểm */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-green-600" /> Cảnh điểm tham quan
            </Label>
            <div className="space-y-1">
              {myItems.map((it) => {
                const cd = canhDiemList.find((c) => c.id === it.canh_diem_id);
                return (
                  <div key={it.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-3 py-1.5">
                    <MapPin className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="flex-1">{cd?.ten ?? `ID ${it.canh_diem_id}`}</span>
                    {it.co_phi && (
                      <span className="text-xs text-muted-foreground">
                        {it.don_gia?.toLocaleString("vi-VN")}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive"
                      onClick={() => deleteItem.mutate({ id: it.id, seri_id: seriId })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
            {addingItem ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1">
                  <SearchableSelect
                    options={canhDiemOpts}
                    value={newCanhDiemId}
                    onChange={setNewCanhDiemId}
                    placeholder="Chọn cảnh điểm..."
                  />
                </div>
                <Button size="sm" className="h-9 px-3" onClick={handleAddItem} disabled={!newCanhDiemId || addItem.isPending}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-9 px-3" onClick={() => { setAddingItem(false); setNewCanhDiemId(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs mt-1" onClick={() => setAddingItem(true)}>
                <Plus className="h-3 w-3 mr-1" /> Thêm cảnh điểm
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seri detail panel ──
function SeriDetail({ seri }: { seri: SeriTour }) {
  const { data: ngayList = [], isLoading } = useSeriNgayList(seri.id);
  const addNgay = useAddSeriNgay();
  const deleteNgay = useDeleteSeriNgay();
  const [deletingNgayId, setDeletingNgayId] = useState<number | null>(null);

  const handleAddNgay = () => {
    const nextSo = ngayList.length > 0 ? Math.max(...ngayList.map((n) => n.ngay_so)) + 1 : 1;
    addNgay.mutate(
      { seri_id: seri.id, ngay_so: nextSo },
      { onError: (err: any) => toast({ title: "Lỗi: " + err.message, variant: "destructive" }) }
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{seri.ten_seri}</h2>
          {seri.mo_ta && <p className="text-sm text-muted-foreground mt-0.5">{seri.mo_ta}</p>}
        </div>
        <Badge variant="outline">{ngayList.length} ngày</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : (
        <div className="space-y-2">
          {ngayList.map((ngay) => (
            <DayEditor
              key={ngay.id}
              ngay={ngay}
              seriId={seri.id}
              onDelete={() => setDeletingNgayId(ngay.id)}
            />
          ))}
          <Button variant="outline" className="w-full h-9 text-sm border-dashed" onClick={handleAddNgay} disabled={addNgay.isPending}>
            <Plus className="h-4 w-4 mr-1.5" /> Thêm ngày {ngayList.length + 1}
          </Button>
        </div>
      )}

      <AlertDialog open={deletingNgayId !== null} onOpenChange={(o) => { if (!o) setDeletingNgayId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa ngày này?</AlertDialogTitle>
            <AlertDialogDescription>Các cảnh điểm trong ngày cũng sẽ bị xóa.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deletingNgayId) return;
              deleteNgay.mutate({ id: deletingNgayId, seri_id: seri.id }, {
                onSuccess: () => setDeletingNgayId(null),
              });
            }}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main page ──
export default function SeriPage() {
  const { data: seriList = [], isLoading } = useSeriList();
  const createSeri = useCreateSeri();
  const updateSeri = useUpdateSeri();
  const deleteSeri = useDeleteSeri();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SeriTour | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SeriTour | null>(null);
  const [formName, setFormName] = useState("");
  const [formMoTa, setFormMoTa] = useState("");

  const selectedSeri = useMemo(() => seriList.find((s) => s.id === selectedId) ?? null, [seriList, selectedId]);

  const openCreate = () => {
    setEditTarget(null);
    setFormName("");
    setFormMoTa("");
    setModalOpen(true);
  };

  const openEdit = (s: SeriTour) => {
    setEditTarget(s);
    setFormName(s.ten_seri);
    setFormMoTa(s.mo_ta ?? "");
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    if (editTarget) {
      updateSeri.mutate(
        { id: editTarget.id, ten_seri: formName.trim(), mo_ta: formMoTa.trim() || undefined },
        { onSuccess: () => setModalOpen(false) }
      );
    } else {
      createSeri.mutate(
        { ten_seri: formName.trim(), mo_ta: formMoTa.trim() || undefined },
        {
          onSuccess: (data) => {
            setSelectedId(data.id);
            setModalOpen(false);
          },
        }
      );
    }
  };

  return (
    <div className="flex h-full">
      {/* Left: seri list */}
      <div className="w-72 shrink-0 border-r flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-base font-semibold">Mẫu seri</h1>
          <Button size="sm" className="h-7 text-xs px-2.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Thêm
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground px-2 py-4">Đang tải...</p>
          ) : seriList.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-8 text-center">Chưa có mẫu seri nào</p>
          ) : (
            seriList.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer group transition-colors",
                  selectedId === s.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/60"
                )}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.ten_seri}</p>
                  {s.mo_ta && <p className="text-xs text-muted-foreground truncate">{s.mo_ta}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedSeri ? (
          <SeriDetail seri={selectedSeri} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Chọn một mẫu seri để xem và chỉnh sửa
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Sửa mẫu seri" : "Tạo mẫu seri mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-sm">Tên seri *</Label>
              <Input
                className="mt-1"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="VD: Đài Loan 5N4Đ"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm">Mô tả</Label>
              <Textarea
                className="mt-1 resize-none"
                rows={2}
                value={formMoTa}
                onChange={(e) => setFormMoTa(e.target.value)}
                placeholder="Ghi chú ngắn về chương trình..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || createSeri.isPending || updateSeri.isPending}>
              {editTarget ? "Lưu" : "Tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa mẫu seri "{deleteTarget?.ten_seri}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Toàn bộ lịch trình trong mẫu này sẽ bị xóa. Các đoàn đã áp dụng seri này không bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteSeri.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    if (selectedId === deleteTarget.id) setSelectedId(null);
                    setDeleteTarget(null);
                  },
                });
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
