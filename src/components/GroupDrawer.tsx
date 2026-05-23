import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TravelGroup, TravelGroupInsert } from "@/hooks/use-travel-groups";
import { t, useTranslate } from "@/lib/i18n";

const transition = { duration: 0.25, ease: [0.2, 0, 0, 1] as const };

interface Props {
  open: boolean;
  group: TravelGroup | null;
  onClose: () => void;
  onSave: (data: TravelGroupInsert) => void;
  isSaving: boolean;
}

export function GroupDrawer({ open, group, onClose, onSave, isSaving }: Props) {
  useTranslate();
  const [form, setForm] = useState<TravelGroupInsert>({
    ten_doan: "",
    hdv: "",
    so_khach: 0,
    ngay_di: "",
    ngay_ve: "",
    ghi_chu: "",
  });

  useEffect(() => {
    if (group) {
      setForm({
        ten_doan: group.ten_doan,
        hdv: group.hdv || "",
        so_khach: group.so_khach ?? 0,
        ngay_di: group.ngay_di || "",
        ngay_ve: group.ngay_ve || "",
        ghi_chu: group.ghi_chu || "",
      });
    } else {
      setForm({ ten_doan: "", hdv: "", so_khach: 0, ngay_di: "", ngay_ve: "", ghi_chu: "" });
    }
  }, [group, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={transition}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-xl border-l border-border/40 flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
              <h2 className="text-display font-semibold">{group ? t("Edit Group") : t("New Group")}</h2>
              <button onClick={onClose} className="p-2 rounded-md hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-label uppercase text-muted-foreground">{t("Tên Đoàn *")}</Label>
                <Input
                  required
                  value={form.ten_doan}
                  onChange={(e) => setForm({ ...form, ten_doan: e.target.value })}
                  placeholder={t("VD: Tour Đà Nẵng T3")}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-label uppercase text-muted-foreground">{t("Hướng dẫn viên")}</Label>
                <Input
                  value={form.hdv ?? ""}
                  onChange={(e) => setForm({ ...form, hdv: e.target.value })}
                  placeholder={t("Tên HDV")}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-label uppercase text-muted-foreground">{t("Số Khách")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.so_khach ?? 0}
                  onChange={(e) => setForm({ ...form, so_khach: parseInt(e.target.value) || 0 })}
                  className="rounded-lg tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-label uppercase text-muted-foreground">{t("Ngày Đi")}</Label>
                  <DatePicker
                    value={form.ngay_di ?? ""}
                    onChange={(v) => setForm({ ...form, ngay_di: v })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-label uppercase text-muted-foreground">{t("Ngày Về")}</Label>
                  <DatePicker
                    value={form.ngay_ve ?? ""}
                    onChange={(v) => setForm({ ...form, ngay_ve: v })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-label uppercase text-muted-foreground">{t("Ghi Chú")}</Label>
                <Textarea
                  value={form.ghi_chu ?? ""}
                  onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })}
                  placeholder={t("Notes...")}
                  rows={3}
                  className="rounded-lg resize-none"
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isSaving || !form.ten_doan.trim()}
                  className="w-full active:scale-[0.98] transition-transform"
                >
                  {isSaving ? t("Saving...") : group ? t("Update Group") : t("Add Group")}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
