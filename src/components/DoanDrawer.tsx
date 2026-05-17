import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAgents,
  useCreateAgent,
  useDiaDiem,
  useHuongDanVien,
  useXeList,
  useUserRoles,
} from "@/hooks/use-doan";
import type { DoanInsert } from "@/hooks/use-doan";
import { externalSupabase } from "@/lib/supabase-external";
import { useSeriList, checkSeriApplyConflict } from "@/hooks/use-seri";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { t, useTranslate } from "@/lib/i18n";

const transition = { duration: 0.25, ease: [0.2, 0, 0, 1] as const };

const LOAI_TOUR_OPTS = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "noi_dia", label: "Nội địa" },
] as const;

const EMPTY_FORM: DoanInsert = {
  ten_doan: "",
  loai_tour: null,
  thi_truong: null,
  agent_id: null,
  dia_diem_id: null,
  huong_dan_vien_id: null,
  xe_id: null,
  seri_id: null,
  chuyen_bay_don: "",
  chuyen_bay_tien: "",
  so_khach_lon: 0,
  so_khach_em1: 0,
  so_khach_em2: 0,
  so_khach_tl: 0,
  ngay_di: "",
  ngay_ve: "",
  assigned_to: null,
  ghi_chu: "",
};

interface Props {
  open: boolean;
  doan: any | null;
  onClose: () => void;
  onSave: (data: DoanInsert) => void;
  isSaving: boolean;
}

export function DoanDrawer({ open, doan, onClose, onSave, isSaving }: Props) {
  useTranslate();
  const [form, setForm] = useState<DoanInsert>({ ...EMPTY_FORM });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ngayVeOpen, setNgayVeOpen] = useState(false);
  const [originalSeriId, setOriginalSeriId] = useState<number | null>(null);
  const [conflictLines, setConflictLines] = useState<string[] | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const { data: agents } = useAgents();
  const createAgentMut = useCreateAgent();
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const { data: diaDiem } = useDiaDiem();
  const { data: hdv } = useHuongDanVien();
  const { data: xeList } = useXeList();
  const { data: userRoles } = useUserRoles();
  const { data: seriList = [] } = useSeriList();

  useEffect(() => {
    externalSupabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const total = useMemo(() => {
    return (form.so_khach_lon ?? 0) + (form.so_khach_em1 ?? 0) + (form.so_khach_em2 ?? 0) + (form.so_khach_tl ?? 0);
  }, [form.so_khach_lon, form.so_khach_em1, form.so_khach_em2, form.so_khach_tl]);

  useEffect(() => {
    if (doan) {
      setForm({
        ten_doan: doan.ten_doan || "",
        loai_tour: doan.loai_tour ?? null,
        thi_truong: doan.thi_truong ?? null,
        agent_id: doan.agent_id ?? null,
        dia_diem_id: doan.dia_diem_id ?? null,
        huong_dan_vien_id: doan.huong_dan_vien_id ?? null,
        xe_id: doan.xe_id ?? null,
        seri_id: doan.seri_id ?? null,
        chuyen_bay_don: doan.chuyen_bay_don || "",
        chuyen_bay_tien: doan.chuyen_bay_tien || "",
        so_khach_lon: doan.so_khach_lon ?? 0,
        so_khach_em1: doan.so_khach_em1 ?? 0,
        so_khach_em2: doan.so_khach_em2 ?? 0,
        so_khach_tl: doan.so_khach_tl ?? 0,
        ngay_di: doan.ngay_di || "",
        ngay_ve: doan.ngay_ve || "",
        assigned_to: doan.assigned_to || null,
        ghi_chu: doan.ghi_chu || "",
      });
      setOriginalSeriId(doan.seri_id ?? null);
    } else {
      setForm({ ...EMPTY_FORM, assigned_to: null, seri_id: null });
      setOriginalSeriId(null);
    }
    setConflictLines(null);
  }, [doan, open, currentUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: DoanInsert = {
      ...form,
      so_khach: total,
      assigned_to: form.assigned_to || null,
    };
    if (!doan) {
      payload.created_by = currentUserId;
    }
    // Edit mode + seri_id mới khác seri cũ → pre-flight check conflict
    if (doan && form.seri_id && form.seri_id !== originalSeriId) {
      setCheckingConflict(true);
      try {
        const res = await checkSeriApplyConflict(doan.id);
        if (res.hasConflict) {
          setConflictLines(res.lines);
          return; // block save
        }
      } catch (err: any) {
        toast.error("Lỗi kiểm tra conflict: " + (err?.message || ""));
        return;
      } finally {
        setCheckingConflict(false);
      }
    }
    onSave(payload);
  };

  const set = (key: keyof DoanInsert, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Build options
  const agentOptions = useMemo(() =>
    (agents ?? []).map((a) => ({ value: a.id.toString(), label: a.ten })), [agents]);

  const diaDiemOptions = useMemo(() =>
    (diaDiem ?? []).map((d) => ({ value: d.id.toString(), label: d.ten })), [diaDiem]);

  const hdvOptions = useMemo(() =>
    [{ value: "", label: "— Không có —" }, ...(hdv ?? []).map((h) => ({ value: h.id.toString(), label: h.ten }))], [hdv]);

  const xeOptions = useMemo(() =>
    (xeList ?? []).map((x: any) => {
      const nhaXe = x.nha_xe?.ten ?? "";
      const socho = x.so_cho ? `${x.so_cho} chỗ` : "";
      const parts = [nhaXe, x.ten_xe, socho].filter(Boolean);
      return { value: x.id.toString(), label: parts.join(" · ") };
    }), [xeList]);

  const seriOptions = useMemo(() =>
    seriList.map((s) => ({ value: s.id.toString(), label: s.ten_seri })), [seriList]);

  const userOptions = useMemo(() =>
    (userRoles ?? []).map((u) => ({ value: u.user_id, label: u.ho_ten })), [userRoles]);

  const handleCreateAgent = async () => {
    const name = newAgentName.trim();
    if (!name) return;
    try {
      const created = await createAgentMut.mutateAsync(name);
      set("agent_id", created.id);
      setAddAgentOpen(false);
      setNewAgentName("");
      toast.success(`Đã thêm Agent "${created.ten}"`);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi thêm Agent");
    }
  };

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={transition}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-xl border-l border-border/40 flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
              <h2 className="text-lg font-semibold">
                {doan ? "Sửa Đoàn" : "Thêm Đoàn"}
              </h2>
              <button onClick={onClose} className="p-2 rounded-md hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/40">
              <Field label="Tên Đoàn / Code Đoàn *">
                <Input
                  required
                  value={form.ten_doan}
                  onChange={(e) => set("ten_doan", e.target.value)}
                  placeholder="VD: HAN05BR260411GS"
                  className="rounded-lg"
                />
              </Field>

              <Field label="Loại tuyến">
                <Select
                  value={form.loai_tour ?? "none"}
                  onValueChange={(v) => set("loai_tour", v === "none" ? null : v)}
                >
                  <SelectTrigger className="rounded-lg h-10">
                    <span>{!form.loai_tour ? "— Chưa phân loại —" : LOAI_TOUR_OPTS.find((o) => o.value === form.loai_tour)?.label ?? "Chọn loại tuyến"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Chưa phân loại —</SelectItem>
                    {LOAI_TOUR_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Ngày Đón *">
                  <DatePicker
                    value={form.ngay_di ?? ""}
                    onChange={(v) => {
                      set("ngay_di", v);
                      // Auto-mở Ngày Tiễn nếu chưa chọn hoặc đang trước Ngày Đón
                      if (v && (!form.ngay_ve || form.ngay_ve < v)) {
                        setTimeout(() => setNgayVeOpen(true), 80);
                      }
                    }}
                    className="w-full rounded-lg h-10"
                  />
                </Field>
                <Field label="Ngày Tiễn *">
                  <DatePicker
                    value={form.ngay_ve ?? ""}
                    onChange={(v) => set("ngay_ve", v)}
                    open={ngayVeOpen}
                    onOpenChange={setNgayVeOpen}
                    defaultMonth={form.ngay_di || undefined}
                    modifiers={form.ngay_di ? { ngayDon: [new Date(form.ngay_di + "T00:00:00")] } : undefined}
                    modifiersClassNames={{
                      ngayDon: "bg-blue-100 text-blue-700 font-bold ring-1 ring-blue-300 rounded-md",
                    }}
                    footer={
                      form.ngay_di ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-sm bg-blue-100 ring-1 ring-blue-300" />
                          <span>Ngày đón: <strong className="text-foreground">{form.ngay_di.split("-").reverse().join("/")}</strong></span>
                        </div>
                      ) : null
                    }
                    className="w-full rounded-lg h-10"
                  />
                </Field>
              </div>

              <Field label="Địa Điểm *">
                <SearchableSelect
                  options={diaDiemOptions}
                  value={form.dia_diem_id?.toString() || ""}
                  onChange={(v) => set("dia_diem_id", v ? parseInt(v) : null)}
                  placeholder="Chọn Địa Điểm"
                />
              </Field>

              <Field label="Agent *">
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      options={agentOptions}
                      value={form.agent_id?.toString() || ""}
                      onChange={(v) => set("agent_id", v ? parseInt(v) : null)}
                      placeholder="Chọn Agent"
                    />
                  </div>
                  <Button
                    type="button" variant="outline" size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Thêm Agent mới"
                    onClick={() => { setNewAgentName(""); setAddAgentOpen(true); }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </Field>

              <Field label="Hướng Dẫn Viên">
                <SearchableSelect
                  options={hdvOptions}
                  value={form.huong_dan_vien_id?.toString() || ""}
                  onChange={(v) => set("huong_dan_vien_id", v ? parseInt(v) : null)}
                  placeholder="Chọn HDV"
                />
              </Field>

              <Field label="Xe">
                <SearchableSelect
                  options={xeOptions}
                  value={form.xe_id?.toString() || ""}
                  onChange={(v) => set("xe_id", v || null)}
                  placeholder="Chọn xe"
                />
              </Field>

              <Field label="Mẫu seri (áp dụng chương trình)">
                <SearchableSelect
                  options={seriOptions}
                  value={form.seri_id?.toString() || ""}
                  onChange={(v) => set("seri_id", v ? parseInt(v) : null)}
                  placeholder="Chọn seri (tuỳ chọn)"
                />
                {doan ? (
                  form.seri_id && form.seri_id !== originalSeriId ? (
                    <p className="text-xs text-amber-600 mt-1">
                      Sẽ áp dụng seri mới khi cập nhật — chỉ thành công nếu đoàn chưa có lịch trình / booking / chi phí.
                    </p>
                  ) : null
                ) : (
                  form.seri_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Lịch trình sẽ được tự động điền sau khi tạo đoàn
                    </p>
                  )
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Chuyến Bay Đến">
                  <Input value={form.chuyen_bay_don ?? ""} onChange={(e) => set("chuyen_bay_don", e.target.value)} placeholder="VD: BR397" className="rounded-lg" />
                </Field>
                <Field label="Chuyến Bay Tiễn">
                  <Input value={form.chuyen_bay_tien ?? ""} onChange={(e) => set("chuyen_bay_tien", e.target.value)} placeholder="VD: BR398" className="rounded-lg" />
                </Field>
              </div>

              <div className="space-y-2 rounded-lg bg-card border border-border/60 p-3">
                <Label className="text-xs uppercase text-foreground font-bold">Số Khách</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Field bare label={t("Người lớn")}>
                    <Input type="number" min={0} value={form.so_khach_lon ?? 0} onChange={(e) => set("so_khach_lon", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field bare label="Trẻ em 50%">
                    <Input type="number" min={0} value={form.so_khach_em1 ?? 0} onChange={(e) => set("so_khach_em1", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field bare label="Trẻ em free">
                    <Input type="number" min={0} value={form.so_khach_em2 ?? 0} onChange={(e) => set("so_khach_em2", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field bare label="T/L">
                    <Input type="number" min={0} value={form.so_khach_tl ?? 0} onChange={(e) => set("so_khach_tl", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground">Tổng khách:</Label>
                  <span className="text-sm font-bold text-primary tabular-nums">{total}</span>
                </div>
              </div>

              <Field label="Phân cho *">
                <SearchableSelect
                  options={userOptions}
                  value={form.assigned_to || ""}
                  onChange={(v) => set("assigned_to", v || null)}
                  placeholder="Chọn người phụ trách"
                />
              </Field>

              <Field label="Ghi Chú">
                <Textarea
                  value={form.ghi_chu ?? ""}
                  onChange={(e) => set("ghi_chu", e.target.value)}
                  placeholder="Ghi chú..."
                  rows={3}
                  className="rounded-lg resize-none"
                />
              </Field>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isSaving || checkingConflict || !form.ten_doan.trim() || !form.ngay_di || !form.ngay_ve || !form.dia_diem_id || !form.agent_id}
                  className="w-full active:scale-[0.98] transition-transform"
                >
                  {checkingConflict ? "Đang kiểm tra..." : isSaving ? "Đang lưu..." : doan ? "Cập Nhật" : "Thêm Đoàn"}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <Dialog open={addAgentOpen} onOpenChange={(o) => !o && setAddAgentOpen(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Thêm Agent mới</DialogTitle></DialogHeader>
        <div className="space-y-2 pt-2">
          <Label className="text-xs">Tên Agent</Label>
          <Input
            value={newAgentName}
            autoFocus
            placeholder="VD: Aurora Travel"
            onChange={(e) => setNewAgentName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateAgent(); } }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAddAgentOpen(false)}>Hủy</Button>
          <Button type="button" onClick={handleCreateAgent} disabled={!newAgentName.trim() || createAgentMut.isPending}>
            {createAgentMut.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!conflictLines} onOpenChange={(o) => { if (!o) setConflictLines(null); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Không thể áp dụng seri mới</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Đoàn đã có dữ liệu trùng với seri:</p>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                {(conflictLines ?? []).join("\n")}
              </div>
              <p className="text-muted-foreground">
                Vui lòng xóa các mục trên (hoặc bỏ chọn seri) trước khi cập nhật.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConflictLines(null)}>Đóng</AlertDialogCancel>
          <AlertDialogAction onClick={() => { set("seri_id", originalSeriId); setConflictLines(null); }}>
            Bỏ chọn seri mới
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function Field({ label, children, bare }: { label: string; children: React.ReactNode; bare?: boolean }) {
  const isZh = document.cookie.includes("googtrans=/vi/zh-TW");
  return (
    <div className={bare ? "space-y-1.5" : "space-y-1.5 rounded-lg bg-card border border-border/60 p-3"}>
      <Label className={`text-xs uppercase text-foreground font-bold${isZh ? " notranslate" : ""}`}>{label}</Label>
      {children}
    </div>
  );
}
