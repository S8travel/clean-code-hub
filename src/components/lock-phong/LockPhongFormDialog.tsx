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

const hotelSchema = z.object({
  id: z.number().optional(),
  khach_san_id: z.number({ required_error: "Chọn khách sạn" }),
  check_in: z.string().min(1, "Bắt buộc"),
  check_out: z.string().min(1, "Bắt buộc"),
  so_phong: z.string().optional(),
  ghi_chu: z.string().optional(),
});

const schema = z.object({
  ten_seri: z.string().min(1, "Bắt buộc"),
  ten_doan: z.string().min(1, "Bắt buộc"),
  ngay_xuat_phat: z.string().min(1, "Bắt buộc"),
  ghi_chu: z.string().optional(),
  hotels: z.array(hotelSchema).min(1, "Thêm ít nhất 1 khách sạn"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: LockPhongDisplay | null;
}

export default function LockPhongFormDialog({ open, onOpenChange, initialData }: Props) {
  const isEdit = !!initialData;
  const { data: ksList = [] } = useKhachSanList();

  const createMut = useCreateLockPhong();
  const updateMut = useUpdateLockPhong();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ten_seri: "",
      ten_doan: "",
      ngay_xuat_phat: "",
      ghi_chu: "",
      hotels: [{ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "hotels" });

  useEffect(() => {
    if (!open) return;
    if (initialData) {
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
    } else {
      reset({
        ten_seri: "",
        ten_doan: "",
        ngay_xuat_phat: "",
        ghi_chu: "",
        hotels: [{ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" }],
      });
    }
  }, [open, initialData, reset]);

  const ksOptions = ksList.map((k) => ({ value: String(k.id), label: k.ten }));

  const onSubmit = async (values: FormValues) => {
    try {
      const header = {
        ten_seri: values.ten_seri,
        seri_id: null as null,
        ten_doan: values.ten_doan,
        ngay_xuat_phat: values.ngay_xuat_phat,
        ghi_chu: values.ghi_chu || undefined,
      };
      const hotels = values.hotels.map((h) => ({
        id: h.id,
        khach_san_id: h.khach_san_id,
        check_in: h.check_in,
        check_out: h.check_out,
        so_phong: h.so_phong || undefined,
        ghi_chu: h.ghi_chu || undefined,
      }));

      if (isEdit && initialData) {
        await updateMut.mutateAsync({ id: initialData.id, header, hotels });
        toast.success("Đã cập nhật lock phòng");
      } else {
        await createMut.mutateAsync({ header, hotels });
        toast.success("Đã tạo lock phòng");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Vui lòng thử lại"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            {isEdit ? "Chỉnh sửa Lock Phòng" : "Thêm Lock Phòng"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* Row 1: Tên seri + Code đoàn */}
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label className="text-xs">
                  Code đoàn <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...register("ten_doan")}
                  placeholder="vd: TQ250501"
                  className="h-9 text-sm"
                />
                {errors.ten_doan && (
                  <p className="text-xs text-destructive">{errors.ten_doan.message}</p>
                )}
              </div>
            </div>

            {/* Row 2: Ngày xuất phát */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">
                  Ngày xuất phát <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...register("ngay_xuat_phat")}
                  type="date"
                  className="h-9 text-sm"
                />
                {errors.ngay_xuat_phat && (
                  <p className="text-xs text-destructive">{errors.ngay_xuat_phat.message}</p>
                )}
              </div>
            </div>

            {/* Ghi chú */}
            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                {...register("ghi_chu")}
                placeholder="Ghi chú thêm..."
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Khách sạn */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Khách sạn <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() =>
                    append({ khach_san_id: 0, check_in: "", check_out: "", so_phong: "", ghi_chu: "" })
                  }
                >
                  <Plus className="h-3 w-3" />
                  Thêm KS
                </Button>
              </div>

              {typeof errors.hotels === "object" && "message" in errors.hotels && (
                <p className="text-xs text-destructive">{(errors.hotels as any).message}</p>
              )}

              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="border border-border rounded-lg p-3 space-y-2 bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        KS {idx + 1}
                      </span>
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
                        name={`hotels.${idx}.khach_san_id`}
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
                      {errors.hotels?.[idx]?.khach_san_id && (
                        <p className="text-xs text-destructive">
                          {errors.hotels[idx]?.khach_san_id?.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Check-in</Label>
                        <Input
                          {...register(`hotels.${idx}.check_in`)}
                          type="date"
                          className="h-9 text-sm"
                        />
                        {errors.hotels?.[idx]?.check_in && (
                          <p className="text-xs text-destructive">
                            {errors.hotels[idx]?.check_in?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Check-out</Label>
                        <Input
                          {...register(`hotels.${idx}.check_out`)}
                          type="date"
                          className="h-9 text-sm"
                        />
                        {errors.hotels?.[idx]?.check_out && (
                          <p className="text-xs text-destructive">
                            {errors.hotels[idx]?.check_out?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Số phòng</Label>
                        <Input
                          {...register(`hotels.${idx}.so_phong`)}
                          placeholder="vd: 6 TWN, 1 DBL"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Ghi chú</Label>
                      <Input
                        {...register(`hotels.${idx}.ghi_chu`)}
                        placeholder="Ghi chú cho KS này..."
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
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
              {isSubmitting ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo mới"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
