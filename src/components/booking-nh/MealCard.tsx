import { useState, useEffect, useRef } from "react";
import { normalizeEmails, getDefaultDeadline, blockWeekendDate } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import {
  Send, Check, X, RotateCcw, ChevronDown, ChevronUp, Plus, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useUpsertBookingNH,
  useUpdateBookingNH,
  useSendNHBookingEmail,
  useSetMenuOptions,
  useSetMenuMons,
  type BookingNHRow,
} from "@/hooks/use-booking-nh";
import { useCurrentUserProfile, useDoanChuThich } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useHdvsByDoanId, formatHdvsForEmail } from "@/hooks/use-hdv";
import { externalSupabase } from "@/lib/supabase-external";
import { cn } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildUpdateEmailHtml, escapeHtml } from "@/lib/email-update";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";

const STATUS_CFG = {
  chua_gui:        { label: "Chưa gửi",      cls: "bg-muted text-muted-foreground" },
  da_gui:          { label: "Đã gửi",         cls: "bg-amber-100 text-amber-700" },
  nh_xac_nhan:     { label: "Đã xác nhận",   cls: "bg-emerald-100 text-emerald-700" },
  cho_xac_nhan_huy:{ label: "Chờ XN hủy",    cls: "bg-orange-100 text-orange-700" },
  da_huy:          { label: "Đã hủy",         cls: "bg-red-100 text-red-700" },
  khong_dat:       { label: "Không đặt",      cls: "bg-slate-100 text-slate-500" },
};

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy (EEE)", { locale: vi }); } catch { return d; }
}

function TrackingDot({ label, time, active, by }: { label: string; time?: string | null; active: boolean; by?: string | null }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 min-w-[60px]", active ? "text-foreground" : "text-muted-foreground/40")}>
      <div className={cn("w-2.5 h-2.5 rounded-full border-2 transition-colors", active ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background")} />
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
      {time && <span className="text-[10px] text-muted-foreground">{fmtDatetime(time)}</span>}
      {by && <span className="text-[10px] text-muted-foreground/60">{by}</span>}
    </div>
  );
}

function TrackingLine({ active }: { active: boolean }) {
  return <div className={cn("flex-1 h-0.5 mb-4 transition-colors", active ? "bg-primary" : "bg-muted-foreground/20")} />;
}

interface Props {
  doanId: number;
  doanNgayId: number;
  buaAn: "trua" | "toi";
  nhaHangId: number | null;
  nhaHangTen: string | null;
  nhaHangEmail: string | null;
  nhaHangLoai?: string | null;
  booking: BookingNHRow | null;
  currentUserName: string;
  conTrongDieuTour?: boolean;
  setMenuIdFromDieuTour?: number | null;
  tenDoan?: string;
  soKhach?: number;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soNoidBo?: number;
  ngayDate?: string | null;
}

// Guard ngoài: card "tàu ngày" hoặc chưa gán nhà hàng → return null TRƯỚC mọi hook.
// MealCardInner chỉ mount khi card hoạt động nên hook bên trong luôn chạy đủ.
export default function MealCard(props: Props) {
  if (props.nhaHangLoai === "tau_ngay" || !props.nhaHangId) return null;
  return <MealCardInner {...props} />;
}

function MealCardInner({
  doanId, doanNgayId, buaAn, nhaHangId, nhaHangTen, nhaHangEmail, booking, currentUserName,
  conTrongDieuTour = true, setMenuIdFromDieuTour, tenDoan, soKhach, soKhachLon, soKhachEm1, soKhachEm2, soNoidBo, ngayDate,
}: Props) {
  const upsertMut = useUpsertBookingNH();
  const updateMut = useUpdateBookingNH();

  const sendEmailMut = useSendNHBookingEmail();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const { data: doanHdvs = [] } = useHdvsByDoanId(doanId);
  const { data: chuThichKhach } = useDoanChuThich(doanId);
  const { data: setMenuOptions = [] } = useSetMenuOptions(nhaHangId);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);
  const [zaloModalOpen, setZaloModalOpen] = useState(false);
  const [zaloText, setZaloText] = useState("");

  // Set menu đang chọn: ưu tiên booking đã lưu, fallback về điều tour
  const [selectedSetMenuId, setSelectedSetMenuId] = useState<number | null>(
    booking?.set_menu_id ?? setMenuIdFromDieuTour ?? null,
  );
  const { data: setMenuMons = [] } = useSetMenuMons(selectedSetMenuId);

  const [expanded, setExpanded] = useState(false);
  const [monList, setMonList] = useState<string[]>(booking?.mon_an_snapshot ?? []);
  const [ghiChu, setGhiChu] = useState(booking?.ghi_chu ?? "");
  const [deadline, setDeadline] = useState(booking?.deadline || getDefaultDeadline(ngayDate || ""));
  const [newMon, setNewMon] = useState("");

  // Sync khi booking thay đổi từ bên ngoài (overview modal hoặc Điều tour đổi set menu).
  // Guard theo syncKey (id|set_menu|mon_an) → khi chỉ deadline/ghi_chu đổi (đã
  // blur-save cục bộ) thì bỏ qua, không đè field đang nhập dở.
  const lastBookingSyncRef = useRef<string>("");
  useEffect(() => {
    const syncKey = `${booking?.id}|${booking?.set_menu_id}|${JSON.stringify(booking?.mon_an_snapshot ?? [])}`;
    if (syncKey === lastBookingSyncRef.current) return;
    lastBookingSyncRef.current = syncKey;
    setMonList(booking?.mon_an_snapshot ?? []);
    setGhiChu(booking?.ghi_chu ?? "");
    setDeadline(booking?.deadline || getDefaultDeadline(ngayDate || ""));
    setSelectedSetMenuId(booking?.set_menu_id ?? setMenuIdFromDieuTour ?? null);
  }, [booking, ngayDate, setMenuIdFromDieuTour]);

  // Khi user THỰC SỰ đổi set menu (selectedSetMenuId !== booking.set_menu_id) →
  // tự fill danh sách món từ catalog + save. KHÔNG chạy khi initial mount sync
  // (lúc đó hai giá trị bằng nhau) — tránh đè user edits mon_an_snapshot mỗi
  // lần remount tab.
  useEffect(() => {
    if (setMenuMons.length === 0) return;
    // Skip nếu set menu chưa đổi so với booking đã lưu — user chỉ vừa mở lại tab,
    // không có hành động đổi set, giữ nguyên mons cũ từ DB.
    if (booking && selectedSetMenuId === booking.set_menu_id) return;
    const canOverwrite = !booking || booking.booking_status === "chua_gui";
    if (!canOverwrite) return;
    setMonList(setMenuMons);
    const menu = setMenuOptions.find((m) => m.id === selectedSetMenuId) ?? null;
    const setMenuPayload = {
      set_menu_id: selectedSetMenuId,
      ten_set_snapshot: menu?.ten_set ?? null,
      gia_snapshot: menu?.gia ?? null,
      don_vi_snapshot: menu?.don_vi ?? null,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, mon_an_snapshot: setMenuMons, ...setMenuPayload });
    } else if (selectedSetMenuId) {
      upsertMut.mutate({
        doan_id: doanId, doan_ngay_id: doanNgayId, bua_an: buaAn, nha_hang_id: nhaHangId,
        mon_an_snapshot: setMenuMons, ghi_chu: ghiChu,
        booking_status: booking?.booking_status ?? "chua_gui",
        ...setMenuPayload,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(setMenuMons), selectedSetMenuId]);

  // Fallback: booking đã có set_menu_id nhưng mon_an_snapshot rỗng (legacy data
  // hoặc tạo bằng path không snap mons) → backfill từ catalog + persist. Chạy
  // bất kể status: snapshot rỗng là missing data, nên kể cả da_gui cũng cần phục
  // hồi để UI / print / mail thấy đúng món.
  const monBackfillDone = useRef(false);
  useEffect(() => {
    if (!booking?.id) return;
    if (monBackfillDone.current) return;
    if (!booking.set_menu_id) return;
    if ((booking.mon_an_snapshot?.length ?? 0) > 0) return;
    if (setMenuMons.length === 0) return;
    monBackfillDone.current = true;
    setMonList(setMenuMons);
    updateMut.mutate({ id: booking.id, doan_id: doanId, mon_an_snapshot: setMenuMons });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, booking?.set_menu_id, JSON.stringify(booking?.mon_an_snapshot), JSON.stringify(setMenuMons)]);

  // Sync set menu từ điều tour → DB khi booking chưa có set_menu_id.
  // Fetch luôn mon_an_snapshot từ catalog cùng lúc để mọi nơi (MealCard, MenuOverviewModal,
  // export Word) đều thấy món thật trong DB thay vì fallback fetch riêng.
  const dieuTourSynced = useRef(false);
  useEffect(() => {
    if (!setMenuIdFromDieuTour || !booking?.id) return;
    if (dieuTourSynced.current) return;
    if (booking.set_menu_id != null) { dieuTourSynced.current = true; return; } // đã có set menu (tay hoặc tự động), không ghi đè
    if (!setMenuOptions.length) return;
    const menu = setMenuOptions.find((m) => m.id === setMenuIdFromDieuTour);
    if (!menu) return;
    dieuTourSynced.current = true;
    externalSupabase
      .from("nha_hang_set_menu_mon")
      .select("ten_mon")
      .eq("set_menu_id", setMenuIdFromDieuTour)
      .order("thu_tu", { ascending: true })
      .then(({ data }) => {
        const mons = (data ?? []).map((m) => m.ten_mon);
        updateMut.mutate({
          id: booking.id, doan_id: doanId,
          set_menu_id: setMenuIdFromDieuTour,
          ten_set_snapshot: menu.ten_set,
          gia_snapshot: menu.gia ?? null,
          don_vi_snapshot: menu.don_vi ?? null,
          mon_an_snapshot: mons,
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMenuIdFromDieuTour, booking?.id, booking?.set_menu_id, setMenuOptions]);

  const status = booking?.booking_status as keyof typeof STATUS_CFG | undefined;
  const statusCfg = STATUS_CFG[status ?? "chua_gui"];
  const isCancelled = booking?.booking_status === "da_huy" || booking?.booking_status === "cho_xac_nhan_huy";

  const selectedMenu = setMenuOptions.find((m) => m.id === selectedSetMenuId) ?? null;

  // Key fields đưa vào mail — hash để detect dirty.
  const buildMailFields = () => ({
    ngay_date: ngayDate,
    bua_an: buaAn,
    nha_hang_id: nhaHangId,
    set_menu_id: selectedSetMenuId,
    ten_set: selectedMenu?.ten_set ?? booking?.ten_set_snapshot ?? null,
    gia: selectedMenu?.gia ?? booking?.gia_snapshot ?? null,
    mon_an: monList,
    so_khach: soKhach,
    so_khach_lon: soKhachLon,
    so_khach_em1: soKhachEm1,
    so_khach_em2: soKhachEm2,
    so_noi_bo: soNoidBo,
  });

  const isDirty =
    !!booking &&
    !isCancelled &&
    ["da_gui", "nh_xac_nhan"].includes(booking.booking_status) &&
    isMailDirty(booking.sent_at, booking.mail_content_hash, buildMailFields());

  const saveBooking = (overrides: Partial<BookingNHRow> = {}) => {
    const setMenuPayload = selectedSetMenuId
      ? {
          set_menu_id: selectedSetMenuId,
          ten_set_snapshot: selectedMenu?.ten_set ?? null,
          gia_snapshot: selectedMenu?.gia ?? null,
          don_vi_snapshot: selectedMenu?.don_vi ?? null,
        }
      : { set_menu_id: null, ten_set_snapshot: null, gia_snapshot: null, don_vi_snapshot: null };

    const payload = {
      doan_id: doanId,
      doan_ngay_id: doanNgayId,
      bua_an: buaAn,
      nha_hang_id: nhaHangId,
      mon_an_snapshot: monList,
      ghi_chu: ghiChu,
      booking_status: booking?.booking_status ?? "chua_gui",
      ...setMenuPayload,
      ...overrides,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, ...setMenuPayload, ...overrides });
    } else {
      upsertMut.mutate(payload);
    }
  };

  useEffect(() => {
    if (!booking?.deadline && ngayDate) {
      const def = getDefaultDeadline(ngayDate);
      if (def) saveBooking({ deadline: def });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeadlineChange = (val: string) => {
    const corrected = blockWeekendDate(val);
    setDeadline(corrected);
    if (corrected) saveBooking({ deadline: corrected });
  };

  const handleSetMenuChange = (id: number | null) => {
    setSelectedSetMenuId(id);
    const menu = setMenuOptions.find((m) => m.id === id) ?? null;
    const setMenuPayload = {
      set_menu_id: id,
      ten_set_snapshot: menu?.ten_set ?? null,
      gia_snapshot: menu?.gia ?? null,
      don_vi_snapshot: menu?.don_vi ?? null,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, ...setMenuPayload });
    } else {
      upsertMut.mutate({
        doan_id: doanId,
        doan_ngay_id: doanNgayId,
        bua_an: buaAn,
        nha_hang_id: nhaHangId,
        mon_an_snapshot: monList,
        ghi_chu: ghiChu,
        booking_status: "chua_gui",
        ...setMenuPayload,
      });
    }
  };

  const handleAddMon = () => {
    if (!newMon.trim()) return;
    const next = [...monList, newMon.trim()];
    setMonList(next);
    setNewMon("");
    saveBooking({ mon_an_snapshot: next });
  };

  const handleRemoveMon = (i: number) => {
    const next = monList.filter((_, idx) => idx !== i);
    setMonList(next);
    saveBooking({ mon_an_snapshot: next });
  };

  const handleMonBlur = () => saveBooking({ mon_an_snapshot: monList });

  const buildEmailHtml = (mode: "first" | "update" = "first", note = "") => {
    const buaLabel = buaAn === "trua" ? "Ăn trưa" : "Ăn tối";
    // Chú thích khách (ăn chay / dị ứng / VIP…) từ tab Điều tour — quan trọng
    // với nhà hàng nên hiển thị nổi bật.
    const ctClean = (chuThichKhach ?? "").trim();
    const ctHtml = escapeHtml(ctClean).replace(/\n/g, "<br>");

    // Update mode: minimal layout
    if (mode === "update") {
      const senderName = userProfile?.ho_ten || currentUserName;
      // Diff đánh dấu THẲNG trong từng dòng (old → new) — KHÔNG mục riêng,
      // KHÔNG callout đầu mail. prev null (gửi trước feature) → chỉ hiện giá trị
      // hiện tại, không có mũi tên.
      const prev = booking?.mail_sent_snapshot as Record<string, unknown> | null | undefined;
      const num = (v: unknown) => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);
      const arrow = (label: string, p: number, c: number) =>
        p !== c ? `${label} ${p} → ${c}` : `${label} ${c}`;

      // Số khách: Người lớn (+ Trẻ em chỉ khi có — hoặc vừa đổi về 0 để thấy đổi)
      const curLon = num(soKhachLon);
      const curEm = num(soKhachEm1) + num(soKhachEm2);
      const prevLon = prev ? num(prev.so_khach_lon) : curLon;
      const prevEm = prev ? num(prev.so_khach_em1) + num(prev.so_khach_em2) : curEm;
      const soKhachVal =
        curEm > 0 || prevEm > 0
          ? `${arrow("Người lớn", prevLon, curLon)} + ${arrow("Trẻ em", prevEm, curEm)}`
          : arrow("Người lớn", prevLon, curLon);

      // Ngày
      const ngayChanged = !!prev && (prev.ngay_date ?? "") !== (ngayDate ?? "");
      const ngayVal = ngayChanged
        ? `${fmtDate(String(prev!.ngay_date))} → ${fmtDate(ngayDate)}`
        : fmtDate(ngayDate);

      // Set menu (fallback booking snapshot khi selectedMenu chưa resolve)
      const curSetName = selectedMenu?.ten_set ?? booking?.ten_set_snapshot ?? null;
      const curSetPrice = selectedMenu?.gia ?? booking?.gia_snapshot ?? null;
      const curSetUnit = selectedMenu?.don_vi ?? booking?.don_vi_snapshot ?? null;
      const fmtSet = (n: string | null, g: number | null, u: string | null) =>
        n ? `${n}${g != null ? ` — ${g.toLocaleString("vi-VN")}${u ? `/${u}` : ""}` : ""}` : "—";
      const curSet = fmtSet(curSetName, curSetPrice, curSetUnit);
      const setChanged =
        !!prev &&
        ((prev.ten_set ?? "") !== (curSetName ?? "") ||
          num(prev.gia) !== num(curSetPrice));
      const setMenuVal = setChanged
        ? `${fmtSet((prev!.ten_set as string | null) ?? null, (prev!.gia as number | null) ?? null, null)} → ${curSet}`
        : curSet;

      // Món ăn thay đổi: ghép "từ món → sang món", list NGAY DƯỚI Set menu.
      // Không đổi → 1 dòng "Món ăn: N món".
      const prevMon = prev && Array.isArray(prev.mon_an) ? (prev.mon_an as string[]) : [];
      const curMon = monList;
      const removedMon = prev ? prevMon.filter((m) => !curMon.includes(m)) : [];
      const addedMon = prev ? curMon.filter((m) => !prevMon.includes(m)) : [];
      const monChangeItems: string[] = [];
      const pairs = Math.min(removedMon.length, addedMon.length);
      for (let i = 0; i < pairs; i++)
        monChangeItems.push(`${escapeHtml(removedMon[i])} → <strong>${escapeHtml(addedMon[i])}</strong>`);
      for (const m of addedMon.slice(pairs))
        monChangeItems.push(`Thêm: <strong>${escapeHtml(m)}</strong>`);
      for (const m of removedMon.slice(pairs))
        monChangeItems.push(`Bỏ: <strong>${escapeHtml(m)}</strong>`);

      const liSt = `style="margin:4px 0;font-size:14px"`;
      const lbl = (s: string) => `<span style="color:#64748b">${escapeHtml(s)}:</span>`;
      const row = (label: string, value: string) =>
        `<li ${liSt}>${lbl(label)} <strong>${escapeHtml(value)}</strong></li>`;
      // Đổi cả set menu → diff từng món vô nghĩa, liệt kê NGUYÊN menu mới.
      // Chỉ sửa món trong cùng set → ghép "từ → sang". Không đổi → "N món".
      const monBlock = setChanged
        ? curMon.length > 0
          ? `<li ${liSt}>${lbl("Danh sách món (set menu mới)")}<ul style="margin:4px 0;padding-left:18px;list-style:decimal">${curMon
              .map((m) => `<li style="margin:2px 0;font-size:14px">${escapeHtml(m)}</li>`)
              .join("")}</ul></li>`
          : row("Món ăn", "—")
        : monChangeItems.length > 0
          ? `<li ${liSt}>${lbl("Món ăn thay đổi")}<ul style="margin:4px 0;padding-left:18px;list-style:circle">${monChangeItems
              .map((it) => `<li style="margin:2px 0;font-size:14px">${it}</li>`)
              .join("")}</ul></li>`
          : row("Món ăn", `${curMon.length} món`);

      const keyFields = `<ul style="margin:0 0 8px;padding-left:18px;list-style:disc">${[
        row("Đoàn", tenDoan || "—"),
        row("Ngày", ngayVal),
        row("Bữa ăn", buaLabel),
        row("Số khách", soKhachVal),
        row("Set menu", setMenuVal),
        monBlock,
        ctClean
          ? `<li ${liSt}><span style="color:#b45309">⚠ Lưu ý khách:</span> <strong style="color:#b45309">${ctHtml}</strong></li>`
          : "",
        row("HDV", formatHdvsForEmail(doanHdvs)),
      ].join("")}</ul>`;
      return buildUpdateEmailHtml({
        greeting: `Kính gửi ${nhaHangTen || "Quý nhà hàng"},`,
        intro: `Cập nhật booking ${buaLabel.toLowerCase()} đoàn ${tenDoan || "—"}:`,
        keyFieldsHtml: keyFields,
        note,
        senderName,
        senderPhone: userProfile?.so_dien_thoai ?? null,
      });
    }

    const monRows = monList.map((m, i) => `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px">${i + 1}</td><td style="border:1px solid #e2e8f0;padding:6px 12px">${m}</td></tr>`).join("");
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${nhaHangTen || "Quý nhà hàng"}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt <strong>${buaLabel}</strong> cho đoàn <strong>${tenDoan || "—"}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Đoàn</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${tenDoan || "—"}</strong></td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(ngayDate)}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Bữa ăn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${buaLabel}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Số khách</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soKhach ?? "—"} khách</td></tr>
        ${soKhachLon ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">Người lớn</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${soKhachLon} khách</td></tr>` : ""}
        ${soKhachEm1 ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">TE 6–10 tuổi</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${soKhachEm1} khách</td></tr>` : ""}
        ${soKhachEm2 ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">TE dưới 6 tuổi</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${soKhachEm2} khách</td></tr>` : ""}
        ${soNoidBo ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Nội bộ</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soNoidBo} suất (${soNoidBo === 3 ? "T/L · HDV · Lái xe" : "HDV · Lái xe"})</td></tr>` : ""}
        ${selectedMenu ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Set menu</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${selectedMenu.ten_set}${selectedMenu.gia != null ? ` — ${selectedMenu.gia.toLocaleString("vi-VN")}/${selectedMenu.don_vi}` : ""}</td></tr>` : ""}
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">HDV</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${formatHdvsForEmail(doanHdvs)}</td></tr>
        ${ctClean ? `<tr><td style="border:1px solid #fcd34d;background:#fffbeb;padding:8px 12px;color:#b45309;font-weight:600">⚠ Lưu ý khách</td><td style="border:1px solid #fcd34d;background:#fffbeb;padding:8px 12px;color:#b45309;font-weight:600">${ctHtml}</td></tr>` : ""}
      </table>
      ${monList.length > 0 ? `
      <p style="font-weight:600;margin:0 0 8px">Danh sách món:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:6px 12px;width:40px">#</th>
          <th style="border:1px solid #e2e8f0;padding:6px 12px;text-align:left">Tên món</th>
        </tr>
        ${monRows}
      </table>` : ""}
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý nhà hàng xác nhận booking trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${userProfile?.ho_ten || currentUserName}</strong>${userProfile?.so_dien_thoai ? `<br>${userProfile.so_dien_thoai}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
  };

  const [emailMode, setEmailMode] = useState<"first" | "update">("first");
  const openEmailModal = (mode: "first" | "update" = "first") => {
    setEmailMode(mode);
    // updateNote = lời nhắn tự do (tùy chọn). Diff thay đổi KHÔNG prefill vào
    // đây nữa — đã ghép thẳng vào nội dung mail (mục "Nội dung thay đổi…").
    setUpdateNote("");
    const buaLabel = buaAn === "trua" ? "ăn trưa" : "ăn tối";
    const ngayStr = ngayDate ? format(new Date(ngayDate + "T00:00:00"), "dd/MM", { locale: vi }) : "";
    setEmailTo(normalizeEmails(nhaHangEmail));
    const baseSubject = `[S8 Travel] Đặt ${buaLabel}${tenDoan ? ` – ${tenDoan}` : ""}${ngayStr ? ` – ${ngayStr}` : ""} – ${nhaHangTen || "Nhà hàng"}`;
    // KEEP subject IDENTICAL khi update — Gmail strip "Re:" rồi match subject để group thread.
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setEmailHtml(buildEmailHtml(mode, ""));
    setEmailModalOpen(true);
  };

  // Rebuild HTML khi: user nhập lời nhắn (update mode) HOẶC các input async
  // resolve sau khi mở modal (doanHdvs/selectedMenu) → tránh kẹt "Bổ sung sau"
  // do HDV query chưa về lúc openEmailModal. Edit body của user không trigger
  // (chỉ phụ thuộc các giá trị nguồn, KHÔNG phụ thuộc emailHtml).
  useEffect(() => {
    if (!emailModalOpen) return;
    setEmailHtml(buildEmailHtml(emailMode, updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote, doanHdvs, chuThichKhach, selectedMenu, emailMode, emailModalOpen]);

  const buildMailtoBody = () => {
    const buaLabel = buaAn === "trua" ? "Ä‚n trÆ°a" : "Ä‚n tá»‘i";
    const userPhone = userProfile?.so_dien_thoai || "";
    const userName = userProfile?.ho_ten || currentUserName;
    return [
      `KÃ­nh gá»­i ${nhaHangTen},`,
      ``,
      `CÃ´ng ty TNHH Du lá»‹ch S8 xin Ä‘áº·t ${buaLabel.toLowerCase()} cho Ä‘oÃ n ${tenDoan || ""}:`,
      ngayDate ? `- NgÃ y: ${fmtDate(ngayDate)}` : "",
      `- Bá»¯a Äƒn: ${buaLabel}`,
      soKhach != null ? `- Sá»‘ khÃ¡ch: ${soKhach} khÃ¡ch` : "",
      selectedMenu ? `- Set menu: ${selectedMenu.ten_set}` : "",
      monList.length > 0 ? `\nDanh sÃ¡ch mÃ³n:` : "",
      ...monList.map((m, i) => `${i + 1}. ${m}`),
      ...(ghiChu ? [`\nGhi chÃº: ${ghiChu}`] : []),
      ``,
      `KÃ­nh nhá» xÃ¡c nháº­n trong 24 giá».`,
      ``,
      userName,
      userPhone,
      ``,
      `CÃ”NG TY TNHH DU Lá»ŠCH S8`,
      `MST: 0402021137`,
      `Ä/C: Táº§ng 2, TÃ²a nhÃ  Kim SÆ¡n, Sá»‘ 18 Phan ThÃ nh TÃ i, PhÆ°á»ng HÃ²a CÆ°á»ng, ThÃ nh Phá»‘ ÄÃ  Náºµng, Viá»‡t Nam`,
      `Email: s8travel.hddt@gmail.com`,
    ].filter(Boolean).join("\n");
  };

  const handleSendViaServer = async () => {
    if (!booking?.id) {
      // Upsert booking trước nếu chưa có
      await new Promise<void>((resolve) => {
        upsertMut.mutate({
          doan_id: doanId, doan_ngay_id: doanNgayId, bua_an: buaAn,
          nha_hang_id: nhaHangId, mon_an_snapshot: monList, ghi_chu: ghiChu,
          booking_status: "chua_gui",
        }, { onSuccess: () => resolve(), onError: () => resolve() });
      });
    }
    setSending(true);
    try {
      if (!booking?.id) throw new Error("Chưa có booking ID");
      await sendEmailMut.mutateAsync({
        bookingId: booking.id, doanId, to: emailTo, subject: emailSubject, html: emailHtml, sentBy: currentUserName, replyTo: userProfile?.email || currentUserEmail || undefined, emailThreadId: booking.email_thread_id,
        mode: emailMode,
        mailContentHash: hashMailContent(buildMailFields()),
        mailSentSnapshot: buildMailFields(),
      });
      setEmailModalOpen(false);
      toast.success(emailMode === "update" ? "Đã gửi email cập nhật" : "Đã gửi email booking");
    } catch (err: unknown) {
      toast.error("Lỗi gửi email: " + (errMsg(err) || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const mailtoBody = buildMailtoBody();
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mailtoBody)}`;
    const snap = buildMailFields();
    const hash = hashMailContent(snap);
    if (emailMode === "update") {
      saveBooking({ sent_at: new Date().toISOString(), sent_by: currentUserName, mail_content_hash: hash, mail_sent_snapshot: snap } as Partial<BookingNHRow>);
    } else {
      saveBooking({ booking_status: "da_gui", sent_at: new Date().toISOString(), sent_by: currentUserName, mail_content_hash: hash, mail_sent_snapshot: snap } as Partial<BookingNHRow>);
    }
    setEmailModalOpen(false);
    toast.success("Đã mở email client");
  };

  const buildZaloText = () => {
    const buaLabel = buaAn === "trua" ? "Ăn trưa" : "Ăn tối";
    const userName = userProfile?.ho_ten || currentUserName;
    const phone = userProfile?.so_dien_thoai;
    const parts: string[] = [
      `Kính gửi ${nhaHangTen || "Quý nhà hàng"},`,
      "",
      `Công ty TNHH Du lịch S8 xin đặt ${buaLabel.toLowerCase()} cho đoàn ${tenDoan || "—"}:`,
      "",
      ...(ngayDate ? [`- Ngày: ${fmtDate(ngayDate)}`] : []),
      `- Bữa ăn: ${buaLabel}`,
      ...(soKhach != null ? [`- Số khách: ${soKhach} khách`] : []),
      ...(soKhachLon ? [`  • Người lớn: ${soKhachLon} khách`] : []),
      ...(soKhachEm1 ? [`  • TE 6–10 tuổi: ${soKhachEm1} khách`] : []),
      ...(soKhachEm2 ? [`  • TE dưới 6 tuổi: ${soKhachEm2} khách`] : []),
      ...(soNoidBo ? [`- Nội bộ: ${soNoidBo} suất`] : []),
      ...(selectedMenu ? [`- Set menu: ${selectedMenu.ten_set}${selectedMenu.gia != null ? ` — ${selectedMenu.gia.toLocaleString("vi-VN")}/${selectedMenu.don_vi}` : ""}`] : []),
      ...(monList.length > 0 ? ["", "Danh sách món:", ...monList.map((m, i) => `${i + 1}. ${m}`)] : []),
      ...(ghiChu ? ["", `Ghi chú: ${ghiChu}`] : []),
      "",
      "Kính nhờ quý nhà hàng xác nhận trong vòng 24 giờ.",
      "Trân trọng cảm ơn!",
      "",
      userName,
      ...(phone ? [phone] : []),
      "",
      "CÔNG TY TNHH DU LỊCH S8",
      "MST: 0402021137",
      "Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam",
      "Email: s8travel.hddt@gmail.com",
    ];
    return parts.join("\n");
  };

  // Status actions
  const handleSend = () => openEmailModal();
  const handleSendZalo = () => {
    setZaloText(buildZaloText());
    setZaloModalOpen(true);
  };
  const handleConfirmZaloSent = () => {
    const now = new Date().toISOString();
    const snap = buildMailFields();
    const hash = hashMailContent(snap);
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, booking_status: "da_gui", sent_at: now, sent_by: currentUserName, mail_content_hash: hash, mail_sent_snapshot: snap } as Partial<BookingNHRow> & { id: number; doan_id: number });
    } else {
      upsertMut.mutate({
        doan_id: doanId, doan_ngay_id: doanNgayId, bua_an: buaAn,
        nha_hang_id: nhaHangId, mon_an_snapshot: monList, booking_status: "da_gui",
        sent_at: now, sent_by: currentUserName, mail_content_hash: hash, mail_sent_snapshot: snap,
      });
    }
    setZaloModalOpen(false);
  };
  const handleConfirm = () => {
    saveBooking({ booking_status: "nh_xac_nhan" });
    toast.success("Đã xác nhận");
  };
  const handleCancel = () => {
    saveBooking({ booking_status: "cho_xac_nhan_huy" });
    toast("Đã cập nhật trạng thái hủy");
  };
  const handleReset = () => {
    saveBooking({ booking_status: "chua_gui", sent_at: null, sent_by: null });
    toast("Đã đặt lại");
  };

  return (
    <>
    <div className={cn("rounded-lg border bg-card overflow-hidden", isCancelled && "opacity-60", !conTrongDieuTour ? "border-amber-300" : "border-border")}>
      {/* Orphaned warning */}
      {!conTrongDieuTour && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-xs text-amber-700">
          <X className="h-3 w-3 shrink-0" />
          Nhà hàng này đã bị xóa khỏi điều tour — booking vẫn được giữ lại
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
        {/* Row 1: bữa ăn + tên + status + toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase w-14 shrink-0">
            {buaAn === "trua" ? "🍱 Trưa" : "🍽 Tối"}
          </span>
          <span className="text-sm font-medium truncate flex-1">{nhaHangTen || "—"}</span>
          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0", statusCfg.cls)}>
            {statusCfg.label}
          </span>
          {isDirty && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 bg-orange-100 text-orange-700 flex items-center gap-1" title="Nội dung đã thay đổi so với mail booking gần nhất — gửi cập nhật để đồng bộ">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Có thay đổi
            </span>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {/* Row 2: set menu badge (always rendered for consistent height) */}
        <div className="flex items-center gap-2 mt-1 pl-[3.5rem] min-h-[20px]">
          {(booking?.ten_set_snapshot || selectedMenu) ? (
            <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0 max-w-[200px] truncate">
              {booking?.ten_set_snapshot ?? selectedMenu!.ten_set}
              {(booking?.gia_snapshot ?? selectedMenu?.gia) != null && (
                <span className="opacity-70">
                  · {(booking?.gia_snapshot ?? selectedMenu?.gia)!.toLocaleString("vi-VN")}
                  {(booking?.don_vi_snapshot ?? selectedMenu?.don_vi) ? `/${booking?.don_vi_snapshot ?? selectedMenu?.don_vi}` : ""}
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40 italic">Chưa chọn set menu</span>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Set menu */}
          {(setMenuOptions.length > 0 || setMenuIdFromDieuTour != null) && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs text-muted-foreground mb-1.5">Set menu</p>
              {setMenuIdFromDieuTour != null ? (
                <p className="text-sm font-medium text-foreground">
                  {selectedMenu?.ten_set ?? "—"}
                  {selectedMenu?.gia != null ? ` — ${selectedMenu.gia.toLocaleString("vi-VN")}/${selectedMenu.don_vi}` : ""}
                </p>
              ) : (
                <select
                  className="w-full text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedSetMenuId ?? ""}
                  disabled={isCancelled}
                  onChange={(e) => handleSetMenuChange(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">-- Không chọn --</option>
                  {setMenuOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.ten_set}{m.gia != null ? ` — ${m.gia.toLocaleString("vi-VN")}/${m.don_vi}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Danh sách món */}
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">Danh sách món</p>
            {monList.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic">Chưa có món nào</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {monList.map((mon, i) => (
                  <li key={i} className="flex items-center gap-1.5 group">
                    <span className="text-muted-foreground text-xs w-4 shrink-0">{i + 1}.</span>
                    <input
                      className="flex-1 text-sm bg-transparent border-none outline-none hover:bg-muted/50 focus:bg-muted/50 px-1 rounded"
                      value={mon}
                      disabled={isCancelled}
                      onChange={(e) => {
                        const next = [...monList];
                        next[i] = e.target.value;
                        setMonList(next);
                      }}
                      onBlur={handleMonBlur}
                    />
                    {!isCancelled && (
                      <button
                        onClick={() => handleRemoveMon(i)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isCancelled && (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  className="flex-1 text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Thêm món..."
                  value={newMon}
                  onChange={(e) => setNewMon(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMon()}
                />
                <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleAddMon}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Tracking + actions */}
          <div className="px-4 py-2.5 bg-muted/10 border-t border-border">
            <div className="flex items-center mb-3">
              <TrackingDot label="Tạo" time={null} active={true} />
              <TrackingLine active={!!booking?.sent_at} />
              <TrackingDot label="Gửi" time={booking?.sent_at} active={!!booking?.sent_at} by={booking?.sent_by} />
              <TrackingLine active={booking?.booking_status === "nh_xac_nhan"} />
              <TrackingDot label="Xác nhận" time={null} active={booking?.booking_status === "nh_xac_nhan"} />
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <Textarea
                  placeholder="Ghi chú..."
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  onBlur={() => saveBooking({ ghi_chu: ghiChu })}
                  disabled={isCancelled}
                  className="text-xs min-h-[40px] resize-none w-full"
                  rows={1}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Deadline:</span>
                  <DatePicker
                    value={deadline}
                    onChange={(v) => { handleDeadlineChange(v); saveBooking({ deadline: v || null }); }}
                    className="h-7 w-36 text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1 shrink-0">
                {(!booking || booking.booking_status === "chua_gui") && (
                  <>
                    <Button size="sm" className="h-7 text-xs" onClick={handleSend}>
                      <Send className="h-3 w-3 mr-1" /> Gửi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                      onClick={handleSendZalo}
                      disabled={updateMut.isPending || upsertMut.isPending}
                    >
                      Gửi Zalo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-slate-500 border-slate-300 hover:bg-slate-50"
                      onClick={() => saveBooking({ booking_status: "khong_dat" })}
                      disabled={updateMut.isPending || upsertMut.isPending}
                    >
                      Không đặt
                    </Button>
                  </>
                )}
                {booking?.booking_status === "da_gui" && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleConfirm}>
                      <Check className="h-3 w-3 mr-1" /> Xác nhận
                    </Button>
                    {booking?.sent_at && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => openEmailModal("update")}
                        title="Gửi email cập nhật — thread vào mail booking cũ (Gmail group theo subject)">
                        <Send className="h-3 w-3 mr-1" /> Gửi cập nhật
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                      <X className="h-3 w-3 mr-1" /> Hủy
                    </Button>
                  </>
                )}
                {booking?.booking_status === "nh_xac_nhan" && (
                  <>
                    {booking?.sent_at && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => openEmailModal("update")}
                        title="Gửi email cập nhật — thread vào mail booking cũ (Gmail group theo subject)">
                        <Send className="h-3 w-3 mr-1" /> Gửi cập nhật
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                      <X className="h-3 w-3 mr-1" /> Hủy
                    </Button>
                  </>
                )}
                {booking?.booking_status === "cho_xac_nhan_huy" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300"
                    onClick={() => saveBooking({ booking_status: "da_huy" })}>
                    <Check className="h-3 w-3 mr-1" /> Xác nhận hủy
                  </Button>
                )}
                {booking?.booking_status === "da_huy" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Đặt lại
                  </Button>
                )}
                {booking?.booking_status === "khong_dat" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Đặt lại
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    <EmailPreviewModal
      open={emailModalOpen}
      onOpenChange={setEmailModalOpen}
      title={emailMode === "update"
        ? `Gửi email cập nhật ${buaAn === "trua" ? "ăn trưa" : "ăn tối"} (thread vào mail cũ)`
        : `Gửi email đặt ${buaAn === "trua" ? "ăn trưa" : "ăn tối"}`}
      to={emailTo}
      onToChange={setEmailTo}
      subject={emailSubject}
      onSubjectChange={setEmailSubject}
      html={emailHtml}
      onHtmlChange={setEmailHtml}
      textBody={buildMailtoBody()}
      onSendViaServer={handleSendViaServer}
      onMailtoFallback={handleMailtoFallback}
      sending={sending}
      mode={emailMode}
      updateNote={updateNote}
      onUpdateNoteChange={setUpdateNote}
    />
    <Dialog open={zaloModalOpen} onOpenChange={setZaloModalOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nội dung gửi Zalo</DialogTitle>
        </DialogHeader>
        <textarea
          readOnly
          value={zaloText}
          className="w-full text-sm font-mono border border-input rounded-md px-3 py-2 bg-muted/30 resize-none focus:outline-none min-h-[320px]"
          onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
        />
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(zaloText); toast.success("Đã sao chép"); }}>
            Sao chép
          </Button>
          <Button onClick={handleConfirmZaloSent} disabled={updateMut.isPending || upsertMut.isPending}>
            Đã gửi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
