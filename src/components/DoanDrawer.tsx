import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  useAgents,
  useDiaDiem,
  useHuongDanVien,
  useXeList,
  useUserRoles,
} from "@/hooks/use-doan";
import type { DoanInsert } from "@/hooks/use-doan";
import { externalSupabase } from "@/lib/supabase-external";

const transition = { duration: 0.25, ease: [0.2, 0, 0, 1] as const };

const EMPTY_FORM: DoanInsert = {
  ten_doan: "",
  agent_id: null,
  dia_diem_id: null,
  huong_dan_vien_id: null,
  xe_id: null,
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
  const [form, setForm] = useState<DoanInsert>({ ...EMPTY_FORM });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { data: agents } = useAgents();
  const { data: diaDiem } = useDiaDiem();
  const { data: hdv } = useHuongDanVien();
  const { data: xeList } = useXeList();
  const { data: userRoles } = useUserRoles();

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
        agent_id: doan.agent_id ?? null,
        dia_diem_id: doan.dia_diem_id ?? null,
        huong_dan_vien_id: doan.huong_dan_vien_id ?? null,
        xe_id: doan.xe_id ?? null,
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
    } else {
      setForm({ ...EMPTY_FORM, assigned_to: currentUserId });
    }
  }, [doan, open, currentUserId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: DoanInsert = {
      ...form,
      so_khach: total,
      assigned_to: form.assigned_to || currentUserId,
    };
    if (!doan) {
      payload.created_by = currentUserId;
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
    (hdv ?? []).map((h) => ({ value: h.id.toString(), label: h.ten })), [hdv]);

  const xeOptions = useMemo(() =>
    (xeList ?? []).map((x: any) => ({
      value: x.id.toString(),
      label: x.loai_xe ? `${x.ten_nha_xe} · ${x.so_cho} chỗ · ${x.loai_xe}` : `${x.ten_nha_xe} · ${x.so_cho} chỗ`,
    })), [xeList]);

  const userOptions = useMemo(() =>
    (userRoles ?? []).map((u) => ({ value: u.user_id, label: u.ho_ten })), [userRoles]);

  return (
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

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <Field label="Tên Đoàn / Code Đoàn *">
                <Input
                  required
                  value={form.ten_doan}
                  onChange={(e) => set("ten_doan", e.target.value)}
                  placeholder="VD: HAN05BR260411GS"
                  className="rounded-lg"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Ngày Đón *">
                  <Input type="date" required value={form.ngay_di ?? ""} onChange={(e) => set("ngay_di", e.target.value)} className="rounded-lg tabular-nums" />
                </Field>
                <Field label="Ngày Tiễn *">
                  <Input type="date" required value={form.ngay_ve ?? ""} onChange={(e) => set("ngay_ve", e.target.value)} className="rounded-lg tabular-nums" />
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
                <SearchableSelect
                  options={agentOptions}
                  value={form.agent_id?.toString() || ""}
                  onChange={(v) => set("agent_id", v ? parseInt(v) : null)}
                  placeholder="Chọn Agent"
                />
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

              <div className="grid grid-cols-2 gap-4">
                <Field label="Chuyến Bay Đến">
                  <Input value={form.chuyen_bay_don ?? ""} onChange={(e) => set("chuyen_bay_don", e.target.value)} placeholder="VD: BR397" className="rounded-lg" />
                </Field>
                <Field label="Chuyến Bay Tiễn">
                  <Input value={form.chuyen_bay_tien ?? ""} onChange={(e) => set("chuyen_bay_tien", e.target.value)} placeholder="VD: BR398" className="rounded-lg" />
                </Field>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-medium">Số Khách</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Người lớn">
                    <Input type="number" min={0} value={form.so_khach_lon ?? 0} onChange={(e) => set("so_khach_lon", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field label="Trẻ em 6-10">
                    <Input type="number" min={0} value={form.so_khach_em1 ?? 0} onChange={(e) => set("so_khach_em1", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field label="Trẻ em <6">
                    <Input type="number" min={0} value={form.so_khach_em2 ?? 0} onChange={(e) => set("so_khach_em2", parseInt(e.target.value) || 0)} className="rounded-lg tabular-nums" />
                  </Field>
                  <Field label="T/L">
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
                  disabled={isSaving || !form.ten_doan.trim() || !form.ngay_di || !form.ngay_ve || !form.dia_diem_id || !form.agent_id}
                  className="w-full active:scale-[0.98] transition-transform"
                >
                  {isSaving ? "Đang lưu..." : doan ? "Cập Nhật" : "Thêm Đoàn"}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase text-muted-foreground font-medium">{label}</Label>
      {children}
    </div>
  );
}
