// Engine Next-Action — THUẦN (deterministic, không network, test được).
// Cadence/script là DATA (bảng lead_cadence) — sửa dần, không hardcode.

export type LnaChannel = "call" | "zalo" | "email" | "meeting" | "note";
export type LnaPriority = "gap" | "binh_thuong" | "khong_gap";
export type LnaOutcome =
  | "rep_interested"
  | "rep_need_info"
  | "rep_objection"
  | "no_response"
  | "refused"
  | "promised_later"
  | "wrong_info";

export interface CadenceRow {
  stage: string;
  step_no: number;
  channel: string;
  offset_hours: number;
  priority: string;
  reason_tpl: string | null;
  max_touches: number;
  active: boolean;
}

export interface NextActionDraft {
  channel: string;
  due_at: string; // ISO
  priority: string;
  reason: string;
  suggested_script: string | null;
}

export const TERMINAL_STAGES = ["chot_deal", "mat_khach"];

export const CHANNEL_LABEL: Record<string, string> = {
  call: "Gọi điện",
  zalo: "Nhắn Zalo",
  email: "Email",
  meeting: "Gặp mặt",
  note: "Ghi chú nội bộ",
};

export const CHANNEL_ICON: Record<string, string> = {
  call: "📞", zalo: "💬", email: "📧", meeting: "🤝", note: "📝",
};

export const PRIORITY_LABEL: Record<string, string> = {
  gap: "Gấp", binh_thuong: "Bình thường", khong_gap: "Không gấp",
};

export const OUTCOME_OPTS: { value: LnaOutcome; label: string }[] = [
  { value: "rep_interested", label: "Có phản hồi — quan tâm tiếp" },
  { value: "rep_need_info",  label: "Có phản hồi — hỏi thêm thông tin" },
  { value: "rep_objection",  label: "Có phản hồi — còn băn khoăn" },
  { value: "promised_later", label: "Hứa quyết định sau" },
  { value: "no_response",    label: "Không phản hồi" },
  { value: "wrong_info",     label: "Sai thông tin liên hệ" },
  { value: "refused",        label: "Từ chối — không mua" },
];

// channel → loai của lead_activity (để timeline cũ hiển thị đúng icon)
export const CHANNEL_TO_LOAI: Record<string, string> = {
  call: "goi_dien",
  zalo: "tin_nhan_zalo",
  email: "email",
  meeting: "meeting",
  note: "ghi_chu_noi_bo",
};

/**
 * Tính next action kế tiếp. THUẦN — cùng input cùng output.
 * Trả null = KHÔNG tạo action (do_not_contact / terminal / từ chối / vượt trần touch).
 */
export function computeNextAction(params: {
  trangThai: string;
  doNotContact: boolean;
  touchesInStage: number; // số touch outbound đã làm trong stage hiện tại
  stageStartAt: string | Date;
  lastOutcome: LnaOutcome | null;
  cadence: CadenceRow[];
  now?: Date;
}): NextActionDraft | null {
  const { trangThai, doNotContact, touchesInStage, stageStartAt, lastOutcome, cadence } = params;
  const now = params.now ?? new Date();

  if (doNotContact) return null;
  if (TERMINAL_STAGES.includes(trangThai)) return null;
  if (lastOutcome === "refused" || lastOutcome === "wrong_info") return null;

  const rows = cadence
    .filter((c) => c.stage === trangThai && c.active)
    .sort((a, b) => a.step_no - b.step_no);
  if (rows.length === 0) return null;

  const maxTouches = rows[0].max_touches;
  const nextStep = touchesInStage + 1;
  if (nextStep > maxTouches) return null; // vượt trần — UI gợi ý park / mất khách

  const row = rows.find((r) => r.step_no === nextStep) ?? rows[rows.length - 1];

  // promised_later → dời thêm 72h; rep_need_info → xử lý sớm (ưu tiên gấp)
  const extraHours =
    lastOutcome === "promised_later" ? 72 :
    lastOutcome === "rep_need_info" ? 2 : 0;

  const base = new Date(stageStartAt);
  let due = new Date(base.getTime() + (row.offset_hours + extraHours) * 3600_000);
  // Nếu mốc tính ra đã quá khứ (vì tính sau khi vừa touch) → +2h từ bây giờ
  if (due.getTime() < now.getTime()) due = new Date(now.getTime() + 2 * 3600_000);

  const priority =
    lastOutcome === "rep_need_info" ? "gap" :
    lastOutcome === "promised_later" ? "khong_gap" :
    row.priority;

  const reason = row.reason_tpl ?? `${CHANNEL_LABEL[row.channel] ?? row.channel} (bước ${row.step_no})`;

  return {
    channel: row.channel,
    due_at: due.toISOString(),
    priority,
    reason,
    suggested_script: row.reason_tpl,
  };
}
