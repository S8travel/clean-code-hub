import { useEffect, useState, useRef } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Copy, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
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
import { DatePicker } from "@/components/ui/date-picker";
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
  return subDaysISO(ngayXuatPhat, 45);
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
            <Controller
              control={control}
              name={`doans.${doanIdx}.hotels.${hIdx}.check_in`}
              render={({ field: cf }) => (
                <DatePicker value={cf.value ?? ""} onChange={cf.onChange} className="h-8 text-xs w-full" />
              )}
            />
          </div>
          {/* Check-out */}
          <div>
            <Controller
              control={control}
              name={`doans.${doanIdx}.hotels.${hIdx}.check_out`}
              render={({ field: cf }) => (
                <DatePicker value={cf.value ?? ""} onChange={cf.onChange} className="h-8 text-xs w-full" />
              )}
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
  check_in: string;
  so_dem: number;
  cau_hinh_phong: string;
  tinh_trang_phong: string;
  code_ncc: string;
  deadline: string;
  ghi_chu: string;
}

const emptyCreateRow = (): CreateRow => ({
  ten_doan: "",
  check_in: "",
  so_dem: 1,
  cau_hinh_phong: "",
  tinh_trang_phong: "",
  code_ncc: "",
  deadline: "",
  ghi_chu: "",
});

function addOneDay(yyyymmdd: string): string {
  return addDaysISO(yyyymmdd, 1);
}

// UTC-safe để tránh timezone-shift bug ở Vietnam (UTC+7)
function addDaysISO(yyyymmdd: string, days: number): string {
  if (!yyyymmdd) return "";
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subDaysISO(yyyymmdd: string, days: number): string {
  if (!yyyymmdd || !days) return "";
  return addDaysISO(yyyymmdd, -days);
}

// Parse 1 cell ngày → "yyyy-MM-dd" (chấp nhận Excel serial, ISO, dd/MM/yyyy)
function parseDateCell(v: any): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days from 1900-01-01, with 1900 leap bug)
    const date = XLSX.SSF.parse_date_code(v);
    if (date) {
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${date.y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  // ISO yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/MM/yyyy or d/M/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return "";
}

// Header keys của file mẫu (lowercase, no diacritic)
const TEMPLATE_HEADERS = [
  { key: "ten_doan", label: "Code đoàn" },
  { key: "check_in", label: "Ngày check-in (yyyy-mm-dd hoặc dd/mm/yyyy)" },
  { key: "so_dem", label: "Số đêm" },
  { key: "cau_hinh_phong", label: "Cấu hình phòng" },
  { key: "tinh_trang_phong", label: "Tình trạng phòng" },
  { key: "code_ncc", label: "Code NCC" },
  { key: "ghi_chu", label: "Ghi chú" },
] as const;

function downloadTemplateXlsx() {
  const headerRow = TEMPLATE_HEADERS.map((h) => h.label);
  const sampleRows = [
    ["TQ250501", "2026-05-18", 1, "6 TWN, 1 DBL", "Còn", "BK20260518-001", "Khách Đài Loan"],
    ["TQ250502", "25/05/2026", 2, "8 TWN", "Chờ KS xác nhận", "", ""],
  ];
  const aoa = [headerRow, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 8 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lock Phong");
  XLSX.writeFile(wb, "lock_phong_mau.xlsx");
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
  const [daysToDeadline, setDaysToDeadline] = useState<number>(45);
  const [ghiChuChung, setGhiChuChung] = useState("");
  const [rows, setRows] = useState<CreateRow[]>([emptyCreateRow()]);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (idx: number, patch: Partial<CreateRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // Khi check-in đổi → tự fill deadline = check_in − daysToDeadline
  const handleCheckInChange = (idx: number, v: string) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next: CreateRow = { ...r, check_in: v };
      if (v && daysToDeadline > 0) next.deadline = subDaysISO(v, daysToDeadline);
      return next;
    }));
  };

  // Khi đổi daysToDeadline ở header → áp lại tất cả rows có check-in
  const handleDaysToDeadlineChange = (n: number) => {
    setDaysToDeadline(n);
    setRows((prev) => prev.map((r) => {
      if (!r.check_in || n <= 0) return r;
      return { ...r, deadline: subDaysISO(r.check_in, n) };
    }));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, emptyCreateRow()]);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { toast.error("File trống"); return; }
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (aoa.length < 2) { toast.error("File cần ít nhất 1 dòng dữ liệu"); return; }

      // Skip header row, parse rows
      const parsed: CreateRow[] = [];
      for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every((c: any) => c === "" || c == null)) continue;
        const ten_doan = String(r[0] ?? "").trim();
        const check_in = parseDateCell(r[1]);
        const so_dem_raw = Number(r[2]);
        const so_dem = Number.isFinite(so_dem_raw) && so_dem_raw > 0 ? Math.floor(so_dem_raw) : 1;
        const cau_hinh_phong = String(r[3] ?? "").trim();
        const tinh_trang_phong = String(r[4] ?? "").trim();
        const code_ncc = String(r[5] ?? "").trim();
        const ghi_chu = String(r[6] ?? "").trim();
        if (!ten_doan && !check_in && !cau_hinh_phong) continue;
        parsed.push({
          ten_doan,
          check_in,
          so_dem,
          cau_hinh_phong,
          tinh_trang_phong,
          code_ncc,
          deadline: check_in && daysToDeadline > 0 ? subDaysISO(check_in, daysToDeadline) : "",
          ghi_chu,
        });
      }
      if (parsed.length === 0) { toast.error("Không có dòng dữ liệu hợp lệ"); return; }
      setRows(parsed);
      toast.success(`Đã import ${parsed.length} dòng từ file`);
    } catch (err: any) {
      toast.error("Lỗi đọc file: " + (err?.message || "không hỗ trợ định dạng"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDuplicateRow = (idx: number) => {
    setRows((prev) => {
      const src = prev[idx];
      const copy: CreateRow = { ...src };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const handleRemoveRow = (idx: number) => {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  // Validate (deadline auto tính, không bắt buộc nhập)
  const validRows = rows.filter(
    (r) => r.ten_doan.trim() && r.check_in && r.cau_hinh_phong.trim(),
  );
  const canSubmit = !!khachSanId && validRows.length > 0 && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!khachSanId) {
      toast.error("Chưa chọn khách sạn");
      return;
    }
    if (validRows.length === 0) {
      toast.error("Chưa có dòng đoàn nào hợp lệ (cần Code + Check-in + Cấu hình phòng)");
      return;
    }
    setSubmitting(true);
    try {
      for (const r of validRows) {
        const deadline = r.deadline || subDaysISO(r.check_in, daysToDeadline);
        await createMut.mutateAsync({
          header: {
            ten_seri: tenSeri || "",
            seri_id: null,
            ten_doan: r.ten_doan.trim(),
            ngay_xuat_phat: r.check_in, // dùng check-in làm ngày XP
            deadline: deadline || calcDeadline(r.check_in),
            ghi_chu: ghiChuChung || undefined,
          },
          hotels: [{
            khach_san_id: khachSanId,
            check_in: r.check_in,
            check_out: addDaysISO(r.check_in, r.so_dem || 1), // auto = check_in + so_dem
            so_phong: r.cau_hinh_phong.trim() || undefined,
            tinh_trang_phong: r.tinh_trang_phong.trim() || undefined,
            code_ncc: r.code_ncc.trim() || undefined,
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
        {/* Top: chọn KS + tên seri + số ngày deadline */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <div className="space-y-1">
            <Label className="text-xs">
              Số ngày đến deadline
              <span className="text-muted-foreground font-normal"> (deadline = check-in − N)</span>
            </Label>
            <Input
              type="number"
              min={0}
              value={daysToDeadline}
              onChange={(e) => handleDaysToDeadlineChange(Number(e.target.value) || 0)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Table list đoàn */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label className="text-xs font-semibold uppercase">
              Danh sách đoàn ({rows.length})
            </Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={downloadTemplateXlsx}>
                <Download className="h-3 w-3" /> Tải file mẫu
              </Button>
              <Button
                type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" /> Upload file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAddRow}>
                <Plus className="h-3 w-3" /> Thêm dòng
              </Button>
            </div>
          </div>

          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[160px]">Code đoàn *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[150px]">Ngày check-in *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[80px]">Số đêm *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[180px]">Cấu hình phòng *</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[150px]">Tình trạng phòng</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[140px]">Code NCC</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[150px]">Deadline</th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Ghi chú</th>
                  <th className="w-16" />
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
                      <DatePicker
                        value={r.check_in}
                        onChange={(v) => handleCheckInChange(idx, v)}
                        className="h-7 text-xs w-full"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        min={1}
                        value={r.so_dem}
                        onChange={(e) => updateRow(idx, { so_dem: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={r.cau_hinh_phong}
                        onChange={(e) => updateRow(idx, { cau_hinh_phong: e.target.value })}
                        placeholder="6 TWN, 1 DBL"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={r.tinh_trang_phong}
                        onChange={(e) => updateRow(idx, { tinh_trang_phong: e.target.value })}
                        placeholder="vd: Còn / Hết"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={r.code_ncc}
                        onChange={(e) => updateRow(idx, { code_ncc: e.target.value })}
                        placeholder="(NCC cấp)"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <DatePicker
                        value={r.deadline}
                        onChange={(v) => updateRow(idx, { deadline: v })}
                        className="h-7 text-xs w-full"
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
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-blue-600"
                          title="Sao chép dòng"
                          onClick={() => handleDuplicateRow(idx)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Xóa dòng"
                          disabled={rows.length === 1}
                          onClick={() => handleRemoveRow(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground italic">
            Tip: nhập <b>Check-in</b> → <b>Deadline</b> tự fill = check-in − số ngày ở header. Mặc định <b>Số đêm</b> = 1. Bấm <b>Enter</b> ở Ghi chú để thêm dòng mới. Dùng nút <b>copy</b> để nhân bản dòng. Check-out tự tính = check-in + số đêm.
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
            <Controller
              control={control}
              name="ngay_xuat_phat"
              render={({ field: cf }) => (
                <DatePicker
                  value={cf.value ?? ""}
                  onChange={(v) => {
                    cf.onChange(v);
                    if (v) setValue("deadline", calcDeadline(v));
                  }}
                  className="h-9 text-sm w-full"
                />
              )}
            />
            {errors.ngay_xuat_phat && <p className="text-xs text-destructive">{errors.ngay_xuat_phat.message}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deadline <span className="text-muted-foreground">(mặc định -45 ngày)</span></Label>
            <Controller
              control={control}
              name="deadline"
              render={({ field: cf }) => (
                <DatePicker value={cf.value ?? ""} onChange={cf.onChange} className="h-9 text-sm w-full" />
              )}
            />
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
              <Controller
                control={control}
                name={`hotels.${hIdx}.check_in`}
                render={({ field: cf }) => (
                  <DatePicker value={cf.value ?? ""} onChange={cf.onChange} className="h-8 text-xs w-full" />
                )}
              />
              <Controller
                control={control}
                name={`hotels.${hIdx}.check_out`}
                render={({ field: cf }) => (
                  <DatePicker value={cf.value ?? ""} onChange={cf.onChange} className="h-8 text-xs w-full" />
                )}
              />
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
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col overflow-hidden p-0">
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
