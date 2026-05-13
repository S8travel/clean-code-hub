import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { externalSupabase } from "@/lib/supabase-external";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { BOOKING_CC, type BookingCcType } from "@/lib/booking-cc";
import type { HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";

interface Props {
  row: HoaDonUNCRow;
  open: boolean;
  onClose: () => void;
}

interface EmailTarget {
  email: string;
  threadId: string | null;
  source: "booking" | "ncc" | "none";
}

function fmtVnd(n: number): string {
  return (n ?? 0).toLocaleString("vi-VN") + " VND";
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return format(new Date(s + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return s;
  }
}

function ccForLoai(loai: string): readonly string[] {
  const k: BookingCcType | null =
    loai === "khach_san" ? "ks" :
    loai === "nha_hang"  ? "nh" :
    loai === "dich_vu"   ? "dv" :
    loai === "xe"        ? "xe" :
    loai === "visa"      ? "visa" : null;
  return k ? BOOKING_CC[k] : ["s8travel.hddt@gmail.com"];
}

async function resolveBookingEmail(row: HoaDonUNCRow): Promise<EmailTarget> {
  const { doan_id, nha_cung_cap_id, loai, ten_nha_cung_cap } = row;

  try {
    if (loai === "dich_vu" && doan_id && ten_nha_cung_cap) {
      const { data } = await externalSupabase
        .from("doan_booking_dv")
        .select("email_nha_cung_cap, email_thread_id, sent_at")
        .eq("doan_id", doan_id)
        .eq("ten_nha_cung_cap", ten_nha_cung_cap)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.email_nha_cung_cap)
        return { email: data.email_nha_cung_cap, threadId: data.email_thread_id ?? null, source: "booking" };
    }

    if (loai === "khach_san" && doan_id && nha_cung_cap_id) {
      // KS: 1 đoàn có thể có nhiều khách sạn; match theo nha_cung_cap_id của KS
      const { data } = await externalSupabase
        .from("doan_booking_ks")
        .select("email_thread_id, ks_final_sent_at, khach_san:khach_san_id(email, nha_cung_cap_id)")
        .eq("doan_id", doan_id)
        .order("ks_final_sent_at", { ascending: false, nullsFirst: false });
      const match = (data || []).find(
        (bk: any) => bk?.khach_san?.nha_cung_cap_id === nha_cung_cap_id && bk?.khach_san?.email,
      );
      if (match?.khach_san?.email)
        return { email: match.khach_san.email, threadId: match.email_thread_id ?? null, source: "booking" };
    }

    if (loai === "nha_hang" && doan_id && nha_cung_cap_id) {
      const { data } = await externalSupabase
        .from("doan_booking_nh")
        .select("email_thread_id, final_sent_at, nha_hang:nha_hang_id(email, nha_cung_cap_id)")
        .eq("doan_id", doan_id)
        .order("final_sent_at", { ascending: false, nullsFirst: false });
      const match = (data || []).find(
        (bk: any) => bk?.nha_hang?.nha_cung_cap_id === nha_cung_cap_id && bk?.nha_hang?.email,
      );
      if (match?.nha_hang?.email)
        return { email: match.nha_hang.email, threadId: match.email_thread_id ?? null, source: "booking" };
    }
  } catch {
    // Bỏ qua, dùng fallback NCC
  }

  // Fallback: nha_cung_cap.email
  if (nha_cung_cap_id) {
    const { data: ncc } = await externalSupabase
      .from("nha_cung_cap")
      .select("email")
      .eq("id", nha_cung_cap_id)
      .maybeSingle();
    if (ncc?.email) return { email: ncc.email, threadId: null, source: "ncc" };
  }
  return { email: "", threadId: null, source: "none" };
}

async function fetchAsBase64(url: string, ncc: string | null, id: number) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không tải được file UNC đã upload");
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  const b64 = btoa(bin);
  const cleanUrl = url.split("?")[0];
  const ext = cleanUrl.split(".").pop() || "pdf";
  const safe = (ncc ?? "NCC").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return { filename: `UNC_${safe}_${id}.${ext}`, content: b64 };
}

export default function UncEmailModal({ row, open, onClose }: Props) {
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const { data: target, isLoading: loadingTarget } = useQuery({
    queryKey: ["unc-email-target", row.id],
    enabled: open,
    queryFn: () => resolveBookingEmail(row),
  });

  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);

  const buildBody = (): string => {
    const ncc = row.ten_nha_cung_cap || "Quý đối tác";
    const doan = row.ten_doan ? `<br>• Đoàn: <strong>${row.ten_doan}</strong>` : "";
    const ngayTT = fmtDate(row.ngay_can_thanh_toan);
    return `<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
<p>Kính gửi ${ncc},</p>
<p>S8 Travel xin gửi ủy nhiệm chi cho khoản thanh toán sau:</p>
<div style="background:#f8fafc;border-left:3px solid #0a3d7c;padding:12px 16px;margin:12px 0">
  • Nội dung: <strong>${row.mo_ta ?? ""}</strong><br>
  • Số tiền: <strong style="color:#dc2626">${fmtVnd(row.so_tien)}</strong><br>
  • Ngày thanh toán: <strong>${ngayTT}</strong>${doan}
</div>
<p>File ủy nhiệm chi được đính kèm trong email này. Nếu cần đối chiếu hoặc làm rõ vui lòng phản hồi email giúp S8.</p>
<p>Trân trọng,<br><strong>${userProfile?.ho_ten || "S8 Travel"}</strong>${userProfile?.so_dien_thoai ? `<br>${userProfile.so_dien_thoai}` : ""}</p>
</body></html>`;
  };

  // Khi target resolve xong (hoặc modal mở lại) → re-init form
  useEffect(() => {
    if (!open) return;
    setEmailTo(target?.email ?? "");
    const baseSubject = `[S8 Travel] Ủy nhiệm chi – ${row.ten_doan || row.mo_ta || ""} – ${row.ten_nha_cung_cap || ""}`.replace(/\s+/g, " ").trim();
    setEmailSubject(target?.threadId ? `Re: ${baseSubject}` : baseSubject);
    setEmailBody(buildBody());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.email, target?.threadId, row.id]);

  const handleSendViaServer = async () => {
    if (!emailTo.trim()) {
      toast.error("Vui lòng nhập email người nhận");
      return;
    }
    if (!row.unc_url) {
      toast.error("Không tìm thấy file UNC đã upload");
      return;
    }
    setSending(true);
    try {
      const attachment = await fetchAsBase64(row.unc_url, row.ten_nha_cung_cap, row.id);
      await callSendBookingEmail({
        to:       emailTo.trim(),
        cc:       ccForLoai(row.loai),
        subject:  emailSubject,
        html:     emailBody,
        replyTo:  userProfile?.email || currentUserEmail || undefined,
        attachments: [attachment],
      });
      toast.success("Đã gửi UNC cho nhà cung cấp");
      onClose();
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const subj = encodeURIComponent(emailSubject);
    const text = `Ủy nhiệm chi đã upload — xem tại: ${row.unc_url ?? ""}`;
    const body = encodeURIComponent(text);
    window.location.href = `mailto:${emailTo}?subject=${subj}&body=${body}`;
  };

  return (
    <EmailPreviewModal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={loadingTarget ? "Gửi UNC (đang tra email NCC...)" : "Gửi UNC cho nhà cung cấp"}
      to={emailTo}
      onToChange={setEmailTo}
      subject={emailSubject}
      onSubjectChange={setEmailSubject}
      html={emailBody}
      onHtmlChange={setEmailBody}
      onSendViaServer={handleSendViaServer}
      onMailtoFallback={handleMailtoFallback}
      sending={sending}
    />
  );
}
