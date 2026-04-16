import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Copy } from "lucide-react";
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

const doanSchema = z.object({
  ten_doan: z.string().min(1, "Bắt buộc"),
  ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
  deadline: z.string().optional(),
  hotels: z.array(hotelSchema).min(1, "Thêm ít nhất 1 KS"),
});

const createSchema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ghi_chu: z.string().optional(),
  doans: z.array(doanSchema).min(1),
});

const editSchema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ten_doan: z.string().min(1, "Bắt buộc"),
  ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
  deadline: z.string().optional(),
  ghi_chu: z.string().optional(),
  hotels: z.array(hotelSchema).min(1),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const emptyHotel = () => ({ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" });
const emptyDoan = () => ({ ten_doan: "", ngay_xuat_phat: "", deadline: "", hotels: [emptyHotel()] });

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

// ── Create form ──

function CreateForm({
  onOpenChange,
  ksList,
}: {
  onOpenChange: (v: boolean) => void;
  ksList: { id: number; ten: string }[];
}) {
  const createMut = useCreateLockPhong();
  const ksOptions = ksList.map((k) => ({ value: String(k.id), label: k.ten }));

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      ten_seri: "",
      ghi_chu: "",
      doans: [emptyDoan()],
    },
  });

  const { fields: doanFields, append: appendDoan, remove: removeDoan } = useFieldArray({
    control,
    name: "doans",
  });

  // Copy hotel structure (same hotels + so_phong) from last đoàn, empty dates
  const addDoanFromLast = () => {
    const current = getValues("doans");
    const last = current[current.length - 1];
    appendDoan({
      ten_doan: "",
      ngay_xuat_phat: "",
      hotels: last.hotels.map((h) => ({
        khach_san_id: h.khach_san_id,
        check_in: "",
        check_out: "",
        so_phong: h.so_phong || "",
        ghi_chu: h.ghi_chu || "",
      })),
    });
  };

  const onSubmit = async (values: CreateValues) => {
    try {
      await Promise.all(
        values.doans.map((d) =>
          createMut.mutateAsync({
            header: {
              ten_seri: values.ten_seri,
              seri_id: null,
              ten_doan: d.ten_doan,
              ngay_xuat_phat: d.ngay_xuat_phat,
              deadline: d.deadline || (d.ngay_xuat_phat ? calcDeadline(d.ngay_xuat_phat) : null),
              ghi_chu: values.ghi_chu || undefined,
            },
            hotels: d.hotels.map((h) => ({
              id: h.id,
              khach_san_id: h.khach_san_id,
              check_in: h.check_in,
              check_out: h.check_out,
              so_phong: h.so_phong || undefined,
              ghi_chu: h.ghi_chu || undefined,
            })),
          })
        )
      );
      toast.success(
        values.doans.length > 1
          ? `Đã tạo ${values.doans.length} lock phòng`
          : "Đã tạo lock phòng"
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Vui lòng thử lại"));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
      <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
        {/* Tên seri */}
        <div className="space-y-1">
          <Label className="text-xs">
            Tên seri <span className="text-destructive">*</span>
          </Label>
          <Input {...register("ten_seri")} placeholder="vd: Trung Quốc 6N5Đ" className="h-9 text-sm" />
          {errors.ten_seri && <p className="text-xs text-destructive">{errors.ten_seri.message}</p>}
        </div>

        {/* Danh sách đoàn */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              Code đoàn <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={addDoanFromLast}
            >
              <Copy className="h-3 w-3" />
              Copy & thêm đoàn
            </Button>
          </div>

          {doanFields.map((field, dIdx) => (
            <div key={field.id} className="border border-border rounded-lg overflow-hidden">
              {/* Đoàn header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border flex-wrap">
                <span className="text-xs font-medium text-muted-foreground shrink-0">
                  Đoàn {dIdx + 1}
                </span>
                <Input
                  {...register(`doans.${dIdx}.ten_doan`)}
                  placeholder="Code đoàn, vd: TQ250501"
                  className="h-7 text-xs flex-1 min-w-[120px]"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-muted-foreground">Xuất phát</span>
                  <Input
                    {...register(`doans.${dIdx}.ngay_xuat_phat`, {
                      onChange: (e) => {
                        const v = e.target.value;
                        if (v) setValue(`doans.${dIdx}.deadline`, calcDeadline(v));
                      },
                    })}
                    type="date"
                    className="h-7 text-xs w-36"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-muted-foreground">Deadline</span>
                  <Input
                    {...register(`doans.${dIdx}.deadline`)}
                    type="date"
                    className="h-7 text-xs w-36"
                    title="Mặc định ngày xuất phát - 45 ngày"
                  />
                </div>
                {doanFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeDoan(dIdx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Hotel rows */}
              <div className="px-3 py-2 space-y-1">
                {/* Column headers */}
                <div className="grid grid-cols-[180px_1fr_1fr_140px_28px] gap-1.5 mb-1">
                  <span className="text-[11px] text-muted-foreground">Khách sạn</span>
                  <span className="text-[11px] text-muted-foreground">Check-in</span>
                  <span className="text-[11px] text-muted-foreground">Check-out</span>
                  <span className="text-[11px] text-muted-foreground">Số phòng</span>
                  <span />
                </div>
                <DoanHotelRows
                  doanIdx={dIdx}
                  control={control}
                  register={register}
                  ksOptions={ksOptions}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Ghi chú */}
        <div className="space-y-1">
          <Label className="text-xs">Ghi chú chung</Label>
          <Textarea
            {...register("ghi_chu")}
            placeholder="Áp dụng cho tất cả đoàn..."
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Hủy
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Đang tạo..."
            : doanFields.length > 1
            ? `Tạo ${doanFields.length} đoàn`
            : "Tạo mới"}
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
  const ksOptions = ksList.map((k) => ({ value: String(k.id), label: k.ten }));

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
