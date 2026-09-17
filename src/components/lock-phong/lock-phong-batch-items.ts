// Thu thập các đoàn đủ tư cách GỬI RIÊNG TỪNG MAIL tại một khách sạn.
// Nguồn duy nhất cho danh sách trong LockPhongBatchSeparateModal (tick / preview /
// gửi tuần tự). Thuần, không chạm React — test được không cần render.
//
// Khác "Gửi gộp": gộp = 1 mail chứa bảng nhiều đoàn; ở đây MỖI ĐOÀN 1 MAIL riêng,
// subject riêng → KS reply vào đúng đoàn nào, trạng thái theo dõi độc lập từng dòng.
//
// - mode 'first'  : chưa từng gửi → mail đầy đủ, sau khi gửi status → cho_xac_nhan.
// - mode 'update' : đã gửi rồi → mail "Re:" gọn, GIỮ nguyên status (không reset
//   xác nhận của KS chỉ vì gửi lại).
// - Thiếu email KS / đoàn đã hủy: vào danh sách kèm skipReason (không tick được),
//   không chặn cả batch.

import { normalizeEmails } from "@/lib/utils";
import {
  buildLockPhongSubject,
  isLockPhongDirty,
  type LockPhongMailInput,
} from "@/lib/booking-mail/lock-phong-mail";
import type { LockPhongDisplay, LockPhongKSDisplay } from "@/hooks/use-lock-phong";

export interface LockPhongBatchEntry {
  lockPhong: LockPhongDisplay;
  ksRow: LockPhongKSDisplay;
}

export interface LockPhongBatchContext {
  /** Email master của KS — fallback khi row không kèm email. */
  khachSanEmail: string | null;
  senderName: string;
  senderPhone?: string | null;
}

export interface LockPhongBatchItem {
  key: string;
  ksId: number;
  tenDoan: string;
  tenSeri: string;
  checkIn: string;
  checkOut: string;
  soDem: number;
  email: string;
  subject: string;
  mode: "first" | "update";
  emailThreadId: string | null;
  input: LockPhongMailInput;
  /** Tick sẵn khi mở modal: chưa gửi, hoặc đã gửi mà nội dung đã đổi. */
  defaultInclude: boolean;
  /** Không gửi được — lý do (thiếu email, đoàn đã hủy…). */
  skipReason?: string;
  /** Gửi được nhưng nên soát — mặc định KHÔNG tick. */
  warning?: string;
}

export function collectLockPhongBatchItems(
  entries: LockPhongBatchEntry[],
  ctx: LockPhongBatchContext,
): LockPhongBatchItem[] {
  return entries.map(({ lockPhong, ksRow }) => {
    const email = normalizeEmails(ksRow.khach_san_email || ctx.khachSanEmail);
    const mode: "first" | "update" = ksRow.email_sent_at ? "update" : "first";

    let skipReason: string | undefined;
    if (!email) skipReason = "Khách sạn chưa có email";
    else if (ksRow.outcome_status === "da_huy") skipReason = "Đoàn đã hủy";

    let warning: string | undefined;
    if (!skipReason) {
      if (ksRow.outcome_status === "thanh_doan") warning = "Đã thành đoàn — booking chính thức chạy ở màn đoàn";
      else if (!ksRow.so_phong) warning = "Chưa nhập cấu hình phòng";
    }

    const input: LockPhongMailInput = {
      tenDoan: lockPhong.ten_doan,
      tenSeri: lockPhong.ten_seri,
      ngayXuatPhat: lockPhong.ngay_xuat_phat,
      khachSanTen: ksRow.khach_san_ten,
      checkIn: ksRow.check_in,
      checkOut: ksRow.check_out,
      soDem: ksRow.so_dem,
      soPhong: ksRow.so_phong,
      ghiChu: ksRow.ghi_chu ?? lockPhong.ghi_chu,
      senderName: ctx.senderName,
      senderPhone: ctx.senderPhone ?? null,
    };

    return {
      key: String(ksRow.id),
      ksId: ksRow.id,
      tenDoan: lockPhong.ten_doan,
      tenSeri: lockPhong.ten_seri,
      checkIn: ksRow.check_in,
      checkOut: ksRow.check_out,
      soDem: ksRow.so_dem,
      email,
      subject: buildLockPhongSubject(lockPhong.ten_doan, ksRow.khach_san_ten),
      mode,
      emailThreadId: ksRow.email_thread_id,
      input,
      defaultInclude:
        !skipReason && !warning && (ksRow.email_status === "chua_gui" || isLockPhongDirty(ksRow)),
      skipReason,
      warning,
    };
  });
}
