import { useEffect } from "react";
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

// ── Schemas ──

const hotelSchema = z.object({
  id: z.number().optional(),
  khach_san_id: z.number({ required_error: "Chọn khách sạn" }),
  check_in: z.string().min(1, "Bắt buộc"),
  check_out: z.string().min(1, "Bắt buộc"),
  so_phong: z.string().optional(),
  ghi_chu: z.string().optional(),
});

// Create: nhiều code đoàn, cùng danh sách hotel (mỗi hotel có ngày riêng)
const createSchema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ghi_chu: z.string().optional(),
  doans: z.array(
    z.object({
      ten_doan: z.string().min(1, "Bắt buộc"),
      ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
    })
  ).min(1),
  hotels: z.array(hotelSchema).min(1, "Thêm ít nhất 1 khách sạn"),
});

// Edit: sửa 1 record
const editSchema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ten_doan: z.string().min(1, "Bắt buộc"),
  ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
  ghi_chu: z.string().optional(),
  hotels: z.array(hotelSchema).min(1),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: LockPhongDisplay | null;
}

// ── Shared hotel list section ──

function HotelList({
  control,
  register,
  ksOptions,
  namePrefix = "hotels",
}: {
  control: any;
  register: any;
  ksOptions: { value: string; label: string }[];
  namePrefix?: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: namePrefix });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold">
            Khách sạn <span className="text-destructive">*</span>
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Mỗi KS có ngày check-in / check-out riêng. Áp dụng cho tất cả code đoàn.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 shrink-0"
          onClick={() =>
            append({ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" })
          }
        >
          <Plus className="h-3 w-3" />
          Thêm KS
        </Button>
      </div>

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div
            key={field.id}
            className="border border-border rounded-lg p-3 space-y-2 bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">KS {idx + 1}</span>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Khách sạn</Label>
              <Controller
                control={control}
                name={`${namePrefix}.${idx}.khach_san_id`}
                render={({ field: cf }) => (
                  <SearchableSelect
                    options={ksOptions}
                    value={cf.value ? String(cf.value) : ""}
                    onChange={(val) => cf.onChange(val ? Number(val) : 0)}
                    placeholder="Chọn khách sạn..."
                    className="h-9 text-sm"
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Check-in</Label>
                <Input
                  {...register(`${namePrefix}.${idx}.check_in`)}
                  type="date"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Check-out</Label>
                <Input
                  {...register(`${namePrefix}.${idx}.check_out`)}
                  type="date"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Số phòng</Label>
                <Input
                  {...register(`${namePrefix}.${idx}.so_phong`)}
                  placeholder="vd: 6 TWN, 1 DBL"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Input
                {...register(`${namePrefix}.${idx}.ghi_chu`)}
                placeholder="Ghi chú cho KS này..."
                className="h-9 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create form: batch ──

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      ten_seri: "",
      ghi_chu: "",
      doans: [{ ten_doan: "", ngay_xuat_phat: "" }],
      hotels: [{ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" }],
    },
  });

  const {
    fields: doanFields,
    append: appendDoan,
    remove: removeDoan,
  } = useFieldArray({ control, name: "doans" });

  const doanCount = watch("doans")?.length ?? 1;

  const onSubmit = async (values: CreateValues) => {
    try {
      const hotels = values.hotels.map((h) => ({
        id: h.id,
        khach_san_id: h.khach_san_id,
        check_in: h.check_in,
        check_out: h.check_out,
        so_phong: h.so_phong || undefined,
        ghi_chu: h.ghi_chu || undefined,
      }));

      await Promise.all(
        values.doans.map((d) =>
          createMut.mutateAsync({
            header: {
              ten_seri: values.ten_seri,
              seri_id: null,
              ten_doan: d.ten_doan,
              ngay_xuat_phat: d.ngay_xuat_phat,
              ghi_chu: values.ghi_chu || undefined,
            },
            hotels,
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
          <Input
            {...register("ten_seri")}
            placeholder="vd: Trung Quốc 6N5Đ"
            className="h-9 text-sm"
          />
          {errors.ten_seri && (
            <p className="text-xs text-destructive">{errors.ten_seri.message}</p>
          )}
        </div>

        {/* Code đoàn — dạng bảng compact */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              Code đoàn <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => appendDoan({ ten_doan: "", ngay_xuat_phat: "" })}
            >
              <Plus className="h-3 w-3" />
              Thêm đoàn
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_160px_32px] bg-muted/40 border-b border-border px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Code đoàn</span>
              <span className="text-xs font-medium text-muted-foreground">Ngày xuất phát</span>
              <span />
            </div>
            {doanFields.map((field, idx) => (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_160px_32px] items-center border-b border-border last:border-0 px-3 py-1"
              >
                <div className="pr-2">
                  <Input
                    {...register(`doans.${idx}.ten_doan`)}
                    placeholder="vd: TQ250501"
                    className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
                  />
                  {errors.doans?.[idx]?.ten_doan && (
                    <p className="text-xs text-destructive">{errors.doans[idx]?.ten_doan?.message}</p>
                  )}
                </div>
                <div className="pr-2">
                  <Input
                    {...register(`doans.${idx}.ngay_xuat_phat`)}
                    type="date"
                    className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
                  />
                  {errors.doans?.[idx]?.ngay_xuat_phat && (
                    <p className="text-xs text-destructive">{errors.doans[idx]?.ngay_xuat_phat?.message}</p>
                  )}
                </div>
                <div className="flex justify-center">
                  {doanFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDoan(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Khách sạn — dùng HotelList component */}
        <HotelList control={control} register={register} ksOptions={ksOptions} namePrefix="hotels" />

        {/* Ghi chú chung */}
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
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          Hủy
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Đang tạo..."
            : doanCount > 1
            ? `Tạo ${doanCount} đoàn`
            : "Tạo mới"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Edit form: single record ──

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

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      ten_seri: initialData.ten_seri,
      ten_doan: initialData.ten_doan,
      ngay_xuat_phat: initialData.ngay_xuat_phat,
      ghi_chu: initialData.ghi_chu || "",
      hotels:
        initialData.hotels.length > 0
          ? initialData.hotels.map((h) => ({
              id: h.id,
              khach_san_id: h.khach_san_id,
              check_in: h.check_in,
              check_out: h.check_out,
              so_phong: h.so_phong || "",
              ghi_chu: h.ghi_chu || "",
            }))
          : [{ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" }],
    },
  });

  useEffect(() => {
    reset({
      ten_seri: initialData.ten_seri,
      ten_doan: initialData.ten_doan,
      ngay_xuat_phat: initialData.ngay_xuat_phat,
      ghi_chu: initialData.ghi_chu || "",
      hotels:
        initialData.hotels.length > 0
          ? initialData.hotels.map((h) => ({
              id: h.id,
              khach_san_id: h.khach_san_id,
              check_in: h.check_in,
              check_out: h.check_out,
              so_phong: h.so_phong || "",
              ghi_chu: h.ghi_chu || "",
            }))
          : [{ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" }],
    });
  }, [initialData, reset]);

  const onSubmit = async (values: EditValues) => {
    try {
      await updateMut.mutateAsync({
        id: initialData.id,
        header: {
          ten_seri: values.ten_seri,
          seri_id: initialData.seri_id,
          ten_doan: values.ten_doan,
          ngay_xuat_phat: values.ngay_xuat_phat,
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
            <Label className="text-xs">
              Tên seri <span className="text-destructive">*</span>
            </Label>
            <Input {...register("ten_seri")} className="h-9 text-sm" />
            {errors.ten_seri && (
              <p className="text-xs text-destructive">{errors.ten_seri.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Code đoàn <span className="text-destructive">*</span>
            </Label>
            <Input {...register("ten_doan")} className="h-9 text-sm" />
            {errors.ten_doan && (
              <p className="text-xs text-destructive">{errors.ten_doan.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">
              Ngày xuất phát <span className="text-destructive">*</span>
            </Label>
            <Input {...register("ngay_xuat_phat")} type="date" className="h-9 text-sm" />
            {errors.ngay_xuat_phat && (
              <p className="text-xs text-destructive">{errors.ngay_xuat_phat.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea {...register("ghi_chu")} rows={2} className="text-sm resize-none" />
        </div>

        <HotelList control={control} register={register} ksOptions={ksOptions} namePrefix="hotels" />
      </div>

      <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
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
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
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
