import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useKhachSanList } from "@/hooks/use-khach-san";
import {
  useCreateLockPhong,
  useUpdateLockPhong,
  type LockPhongDisplay,
} from "@/hooks/use-lock-phong";

// ── Helpers ──

function calcDeadline(ngayXuatPhat: string): string {
  const d = new Date(ngayXuatPhat + "T00:00:00");
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

// ── Schemas ──

const hotelSchema = z.object({
  id: z.number().optional(),
  khach_san_id: z.number({ required_error: "Chọn KS" }),
  check_in: z.string().min(1, "Bắt buộc"),
  check_out: z.string().min(1, "Bắt buộc"),
  so_phong: z.string().optional(),
  ghi_chu: z.string().optional(),
});

const editSchema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ten_doan: z.string().min(1, "Bắt buộc"),
  ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
  deadline: z.string().optional(),
  ghi_chu: z.string().optional(),
  hotels: z.array(hotelSchema).min(1),
});

type EditValues = z.infer<typeof editSchema>;

const emptyHotel = () => ({ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: LockPhongDisplay | null;
}

// ── Hotel rows for one đoàn ──

function DoanHotelRows({
  doanIdx,
  control,
  register,
  ksOptions,
}: {
  doanIdx: number;
  control: any;
  register: any;
  ksOptions: { value: string; label: string }[];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `doans.${doanIdx}.hotels`,
  });

  return (
    <div className="space-y-1.5">
      {fields.map((field, hIdx) => (
        <div key={field.id} className="grid grid-cols-[180px_1fr_1fr_140px_28px] gap-1.5 items-center">
          {/* KS name */}
          <Controller
            control={control}
            name={`doans.${doanIdx}.hotels.${hIdx}.khach_san_id`}
            render={({ field: cf }) => (
              <SearchableSelect
                options={ksOptions}
                value={cf.value ? String(cf.value) : ""}
                onChange={(val) => cf.onChange(val ? Number(val) : 0)}
                placeholder="Chọn KS..."
                className="h-8 text-xs"
              />
            )}
          />
          {/* Check-in */}
          <div>
            <Input
              {...register(`doans.${doanIdx}.hotels.${hIdx}.check_in`)}
              type="date"
              className="h-8 text-xs"
            />
          </div>
          {/* Check-out */}
          <div>
            <Input
              {...register(`doans.${doanIdx}.hotels.${hIdx}.check_out`)}
              type="date"
              className="h-8 text-xs"
            />
          </div>
          {/* Số phòng */}
          <Input
            {...register(`doans.${doanIdx}.hotels.${hIdx}.so_phong`)}
            placeholder="6 TWN, 1 DBL"
            className="h-8 text-xs"
          />
          {/* Remove */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => remove(hIdx)}
            disabled={fields.length <= 1}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground px-1"
        onClick={() => append(emptyHotel())}
      >
        <Plus className="h-3 w-3" />
        Thêm KS
      </Button>
    </div>
  );
}

// ── Create form: 1 KS → nhiều đoàn (table inline) ──

interface CreateRow {
  ten_doan: string;
  ngay_xuat_phat: string;
  check_in: string;
  check_out: string;
  so_phong: string;
  ghi_chu: string;
}

const emptyCreateRow = (carryFrom?: CreateRow): CreateRow => ({
  ten_doan: "",
  ngay_xuat_phat: "",
  check_in: carryFrom?.check_out || "",
  check_out: "",
  so_phong: "",
  ghi_chu: "",
});

function addOneDay(yyyymmdd: string): string {
  if (!yyyymmdd) return "";
  const d = new Date(yyyymmdd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function CreateForm({
  onOpenChange,
  ksList,
}: {
  onOpenChange: (v: boolean) => void;
  ksList: { id: number; ten: string }[];
}) {
  const createMut = useCreateLockPhong();
  const ksOptions = ksList.map((k) => ({ value: String(k.id), label: k.ten ?? "" }));

  const [khachSanId, setKhachSanId] = useState<number | null>(null);
  const [tenSeri, setTenSeri] = useState("");
  const [ghiChuChung, setGhiChuChung] = useState("");
  const [rows, setRows] = useState<CreateRow[]>([emptyCreateRow()]);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (idx: number, patch: Partial<CreateRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleNgayXPChange = (idx: number, v: string) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next: CreateRow = { ...r, ngay_xuat_phat: v };
      // Auto-fill check_in / check_out nếu trống
      if (v && !r.check_in) next.check_in = v;
      if (v && !r.check_out) next.check_out = addOneDay(v);
      return next;
    }));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, emptyCreateRow(prev[prev.length - 1])]);
  };

  const handleRemoveRow = (idx: number) => {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  // Validate
  const validRows = rows.filter(
    (r) => r.ten_doan.trim() && r.ngay_xuat_phat && r.check_in && r.check_out && r.so_phong.trim(),
  );
  const canSubmit = !!khachSanId && validRows.length > 0 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!khachSanId) {
      toast.error("Chưa chọn khách sạn");
      return;
    }
    if (validRows.length === 0) {
      toast.error("Chưa có dòng đoàn nào hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      for (const r of validRows) {
        await createMut.mutateAsync({
          header: {
            ten_seri: tenSeri || "",
            seri_id: null,
            ten_doan: r.ten_doan.trim(),
            ngay_xuat_phat: r.ngay_xuat_phat,
            deadline: calcDeadline(r.ngay_xuat_phat),
            ghi_chu: ghiChuChung || undefined,
          },
          hotels: [{
            khach_san_id: khachSanId,
            check_in: r.check_in,
            check_out: r.check_out,
            so_phong: r.so_phong.trim() || undefined,
            ghi_chu: r.ghi_chu.trim() || undefined,
          }],
        });
      }
      toast.success(`Đã tạo ${validRows.length} lock phòng`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
      <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        {/* Top: chọn KS + tên seri */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">
              Khách sạn <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              options={ksOptions}
              value={khachSanId ? String(khachSanId) : ""}
              onChange={(v) => setKhachSanId(v ? Number(v) : null)}
              placeholder="Chọn khách sạn cần lock..."
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tên seri (chung)</Label>
            <Input
              value={tenSeri}
              onChange={(e) => setTenSeri(e.target.value)}
              placeholder="vd: Trung Quốc 6N5Đ"
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Table list đoàn */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase">
              Danh sách đoàn ({rows.length})
            </Label>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAddRow}>
              <Plus className="h-3 w-3" /> Thêm dòng
            </Button>
          </div>

          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[180px]">Code đoàn *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[140px]">Ngày XP *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[140px]">Check-in *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[140px]">Check-out *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[160px]">Số phòng *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Ghi chú</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-1 py-1">
                      <Input
                        value={r.ten_doan}
                        onChange={(e) => updateRow(idx, { ten_doan: e.target.value })}
                        placeholder="TQ250501"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="date"
                        value={r.ngay_xuat_phat}
                        onChange={(e) => handleNgayXPChange(idx, e.target.value)}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="date"
                        value={r.check_in}
                        onChange={(e) => updateRow(idx, { check_in: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="date"
                        value={r.check_out}
                        onChange={(e) => updateRow(idx, { check_out: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={r.so_phong}
                        onChange={(e) => updateRow(idx, { so_phong: e.target.value })}
                        placeholder="6 TWN, 1 DBL"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={r.ghi_chu}
                        onChange={(e) => updateRow(idx, { ghi_chu: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddRow();
                          }
                        }}
                        placeholder="(tuỳ chọn)"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        disabled={rows.length === 1}
                        onClick={() => handleRemoveRow(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground italic">
            Tip: nhập "Ngày XP" → check-in / check-out tự fill. Bấm Enter ở cột Ghi chú để thêm dòng mới (auto copy check-out → check-in).
            Deadline tự tính = ngày XP − 45 ngày.
          </p>
        </div>

        {/* Ghi chú */}
        <div className="space-y-1">
          <Label className="text-xs">Ghi chú chung</Label>
          <Textarea
            value={ghiChuChung}
            onChange={(e) => setGhiChuChung(e.target.value)}
            placeholder="Áp dụng cho tất cả đoàn..."
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
        <div className="flex-1 text-xs text-muted-foreground">
          {validRows.length > 0
            ? `Sẽ tạo ${validRows.length} lock phòng`
            : "Chưa có dòng đoàn nào hợp lệ"}
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          Hủy
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Đang tạo..." : `Tạo Lock${validRows.length > 1 ? ` (${validRows.length})` : ""}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Edit form ──

function EditForm({
  initialData,
  onOpenChange,
  ksList,
}: {
  initialData: LockPhongDisplay;
  onOpenChange: (v: boolean) => void;
  ksList: { id: number; ten: string }[];
}) {
  const updateMut = useUpdateLockPhong();
  const ksOptions = ksList.map((k) => ({ value: String(k.id), label: k.ten ?? "" }));

  const defaultHotels =
    initialData.hotels.length > 0
      ? initialData.hotels.map((h) => ({
          id: h.id,
          khach_san_id: h.khach_san_id,
          check_in: h.check_in,
          check_out: h.check_out,
          so_phong: h.so_phong || "",
          ghi_chu: h.ghi_chu || "",
        }))
      : [emptyHotel()];

  const { register, handleSubmit, control, reset, setValue, formState: { errors, isSubmitting } } =
    useForm<EditValues>({
      resolver: zodResolver(editSchema),
      defaultValues: {
        ten_seri: initialData.ten_seri,
        ten_doan: initialData.ten_doan,
        ngay_xuat_phat: initialData.ngay_xuat_phat,
        deadline: initialData.deadline || (initialData.ngay_xuat_phat ? calcDeadline(initialData.ngay_xuat_phat) : ""),
        ghi_chu: initialData.ghi_chu || "",
        hotels: defaultHotels,
      },
    });

  useEffect(() => {
    reset({
      ten_seri: initialData.ten_seri,
      ten_doan: initialData.ten_doan,
      ngay_xuat_phat: initialData.ngay_xuat_phat,
      deadline: initialData.deadline || (initialData.ngay_xuat_phat ? calcDeadline(initialData.ngay_xuat_phat) : ""),
      ghi_chu: initialData.ghi_chu || "",
      hotels: defaultHotels,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.id]);

  const { fields: hotelFields, append: appendHotel, remove: removeHotel } = useFieldArray({
    control,
    name: "hotels",
  });

  const onSubmit = async (values: EditValues) => {
    try {
      await updateMut.mutateAsync({
        id: initialData.id,
        header: {
          ten_seri: values.ten_seri,
          seri_id: initialData.seri_id,
          ten_doan: values.ten_doan,
          ngay_xuat_phat: values.ngay_xuat_phat,
          deadline: values.deadline || (values.ngay_xuat_phat ? calcDeadline(values.ngay_xuat_phat) : null),
          ghi_chu: values.ghi_chu || undefined,
        },
        hotels: values.hotels.map((h) => ({
          id: h.id,
          khach_san_id: h.khach_san_id,
          check_in: h.check_in,
          check_out: h.check_out,
          so_phong: h.so_phong || undefined,
          ghi_chu: h.ghi_chu || undefined,
        })),
      });
      toast.success("Đã cập nhật lock phòng");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Vui lòng thử lại"));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
      <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tên seri <span className="text-destructive">*</span></Label>
            <Input {...register("ten_seri")} className="h-9 text-sm" />
            {errors.ten_seri && <p className="text-xs text-destructive">{errors.ten_seri.message}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code đoàn <span className="text-destructive">*</span></Label>
            <Input {...register("ten_doan")} className="h-9 text-sm" />
            {errors.ten_doan && <p className="text-xs text-destructive">{errors.ten_doan.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Ngày xuất phát <span className="text-destructive">*</span></Label>
            <Input
              {...register("ngay_xuat_phat", {
                onChange: (e) => {
                  const v = e.target.value;
                  if (v) setValue("deadline", calcDeadline(v));
                },
              })}
              type="date"
              className="h-9 text-sm"
            />
            {errors.ngay_xuat_phat && <p className="text-xs text-destructive">{errors.ngay_xuat_phat.message}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deadline <span className="text-muted-foreground">(mặc định -45 ngày)</span></Label>
            <Input {...register("deadline")} type="date" className="h-9 text-sm" />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea {...register("ghi_chu")} rows={2} className="text-sm resize-none" />
        </div>

        {/* Hotel rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Khách sạn</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => appendHotel(emptyHotel())}
            >
              <Plus className="h-3 w-3" />
              Thêm KS
            </Button>
          </div>
          {/* Column headers */}
          <div className="grid grid-cols-[180px_1fr_1fr_140px_28px] gap-1.5">
            <span className="text-[11px] text-muted-foreground">Khách sạn</span>
            <span className="text-[11px] text-muted-foreground">Check-in</span>
            <span className="text-[11px] text-muted-foreground">Check-out</span>
            <span className="text-[11px] text-muted-foreground">Số phòng</span>
            <span />
          </div>
          {hotelFields.map((field, hIdx) => (
            <div key={field.id} className="grid grid-cols-[180px_1fr_1fr_140px_28px] gap-1.5 items-center">
              <Controller
                control={control}
                name={`hotels.${hIdx}.khach_san_id`}
                render={({ field: cf }) => (
                  <SearchableSelect
                    options={ksOptions}
                    value={cf.value ? String(cf.value) : ""}
                    onChange={(val) => cf.onChange(val ? Number(val) : 0)}
                    placeholder="Chọn KS..."
                    className="h-8 text-xs"
                  />
                )}
              />
              <Input {...register(`hotels.${hIdx}.check_in`)} type="date" className="h-8 text-xs" />
              <Input {...register(`hotels.${hIdx}.check_out`)} type="date" className="h-8 text-xs" />
              <Input {...register(`hotels.${hIdx}.so_phong`)} placeholder="6 TWN, 1 DBL" className="h-8 text-xs" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeHotel(hIdx)}
                disabled={hotelFields.length <= 1}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Hủy
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang lưu..." : "Cập nhật"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Main Dialog ──

export default function LockPhongFormDialog({ open, onOpenChange, initialData }: Props) {
  const { data: ksList = [] } = useKhachSanList();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            {initialData ? "Chỉnh sửa Lock Phòng" : "Thêm Lock Phòng"}
          </DialogTitle>
        </DialogHeader>

        {initialData ? (
          <EditForm initialData={initialData} onOpenChange={onOpenChange} ksList={ksList} />
        ) : (
          <CreateForm onOpenChange={onOpenChange} ksList={ksList} />
        )}
      </DialogContent>
    </Dialog>
  );
}
