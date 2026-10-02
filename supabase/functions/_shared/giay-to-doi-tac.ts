// Logic thuần cho luồng "đại lý tải giấy tờ của một đoàn từ cổng": 分房表 (chia phòng)
// và 合約 (hợp đồng). Tách khỏi edge function để test được mà không cần dựng request.
//
// Dữ liệu từ NGOÀI CRM đi vào nên mặc định là từ chối: thiếu thì báo, lạ thì chặn.

import { laLinkCongHopLe, MAX_CO_CHU, MIME_CHO_PHEP, mimeTuDuoi } from "./yeu-cau-doi-tac.ts";

/**
 * Loại giấy tờ đại lý được tự tải. CHỈ hai loại này — danh sách khách / tài liệu khác /
 * báo giá vẫn do S8 quản; mở rộng danh sách là mở cho bên ngoài ghi đè thêm chỗ.
 */
export const LOAI_DOI_TAC_TAI = ["chia_phong", "hop_dong"] as const;
export type LoaiDoiTacTai = (typeof LOAI_DOI_TAC_TAI)[number];

/** Tên hiện trong chuông của OP. */
export const TEN_LOAI: Record<LoaiDoiTacTai, string> = {
  chia_phong: "chia phòng",
  hop_dong: "hợp đồng",
};

export interface GiayToGui {
  crm_agent_id: number;
  crm_doan_id: number;
  loai: LoaiDoiTacTai;
  /** Tài khoản cổng đã bấm gửi — ghi vào chuông cho OP biết ai bên đại lý gửi. */
  tai_khoan_email: string | null;
  tai_khoan_ten: string | null;
  tep: {
    /** Tên gốc đại lý đặt — giữ nguyên để hiện. */
    ten: string;
    /** Link ký hạn ngắn do cổng tạo; chỉ nhận link trỏ về chính project cổng. */
    url: string;
    mime: string;
    co_chu: number | null;
  };
}

export type KetQuaGiayTo = { ok: true; data: GiayToGui } | { ok: false; loi: string };

const cat = (v: unknown, n: number): string | null => {
  const s = String(v ?? "").trim().slice(0, n);
  return s || null;
};

const soDuong = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function laLoaiDoiTacTai(v: unknown): v is LoaiDoiTacTai {
  return typeof v === "string" && (LOAI_DOI_TAC_TAI as readonly string[]).includes(v);
}

/**
 * Chuẩn hoá + kiểm payload cổng gửi sang. Khác yêu cầu báo giá: ở đây file CHÍNH
 * LÀ nội dung, nên file hỏng là hỏng cả lượt gửi — báo lỗi để đại lý gửi lại.
 */
export function chuanHoaGiayTo(body: Record<string, unknown>, portalUrl: string): KetQuaGiayTo {
  const crmAgentId = soDuong(body.crm_agent_id);
  if (!crmAgentId) return { ok: false, loi: "Thiếu crm_agent_id" };
  const crmDoanId = soDuong(body.crm_doan_id);
  if (!crmDoanId) return { ok: false, loi: "Thiếu crm_doan_id" };
  const loai = body.loai;
  if (!laLoaiDoiTacTai(loai)) return { ok: false, loi: "Loại giấy tờ không hợp lệ" };

  const raw = body.tep && typeof body.tep === "object" ? (body.tep as Record<string, unknown>) : null;
  if (!raw) return { ok: false, loi: "Thiếu file" };

  const url = String(raw.url ?? "");
  // Hàng rào SSRF: hàm chạy service_role, đưa URL lạ vào là bắt nó đi tải hộ.
  if (!laLinkCongHopLe(url, portalUrl)) return { ok: false, loi: "Link file không hợp lệ" };

  const ten = cat(raw.ten, 300) ?? "file";
  const coChuRaw = Number(raw.co_chu);
  const coChu = Number.isFinite(coChuRaw) ? coChuRaw : null;
  if (coChu !== null && coChu > MAX_CO_CHU) return { ok: false, loi: "File quá 10MB" };

  // Kiểu khai từ cổng, rồi tới đuôi tên. Không suy ra được kiểu được phép là chặn:
  // bucket chỉ nhận đúng mấy kiểu tài liệu/ảnh.
  const mime = cat(raw.mime, 100) ?? mimeTuDuoi(ten);
  if (!mime || !MIME_CHO_PHEP.includes(mime as (typeof MIME_CHO_PHEP)[number])) {
    return { ok: false, loi: "Chỉ nhận file PDF, Word, Excel hoặc ảnh" };
  }

  return {
    ok: true,
    data: {
      crm_agent_id: crmAgentId,
      crm_doan_id: crmDoanId,
      loai,
      tai_khoan_email: cat(body.tai_khoan_email, 200),
      tai_khoan_ten: cat(body.tai_khoan_ten, 200),
      tep: { ten, url, mime, co_chu: coChu },
    },
  };
}

/**
 * Đường dẫn trong bucket tài liệu đoàn — cùng khuôn với useUploadDoanTaiLieu bên CRM
 * (`doan-<id>/<loai>/<mốc>.<đuôi>`) để file OP tải và file đại lý tải nằm chung chỗ.
 */
export function duongDanGiayTo(doanId: number, loai: LoaiDoiTacTai, tenGoc: string, moc: number): string {
  const duoi = (tenGoc.includes(".") ? tenGoc.split(".").pop() ?? "" : "").replace(/[^a-zA-Z0-9]/g, "") || "bin";
  return `doan-${doanId}/${loai}/${moc}.${duoi.toLowerCase()}`;
}
