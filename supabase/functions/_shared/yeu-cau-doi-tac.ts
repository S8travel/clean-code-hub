// Logic thuần cho luồng "đối tác gửi yêu cầu báo giá từ cổng" — tách khỏi edge
// function để test được mà không cần dựng request.
//
// Ba việc: kiểm nội dung yêu cầu, kiểm file đính kèm, dựng đường dẫn kho file.
// Cả ba đều là chỗ dữ liệu NGOÀI CRM đi vào, nên mặc định là từ chối: thiếu thì
// bỏ, lạ thì chặn, thừa thì cắt.

import { lamSachTen } from "./portal-tai-lieu.ts";

/** Đối tác gửi kèm nhiều nhất 3 file (chốt với user 21/08/2026). */
export const MAX_TEP = 3;

/** 10MB/file — khớp giới hạn đặt trên bucket 'lead-files' và bucket bên cổng. */
export const MAX_CO_CHU = 10 * 1024 * 1024;

/** Chặn bơm text nhiều MB qua một endpoint không captcha. */
export const MAX_CHU_NOI_DUNG = 2000;
export const MAX_CHU_TIEU_DE = 200;

/** Đúng danh sách đặt trên bucket: lệch một dòng là upload đổ ở tầng storage. */
export const MIME_CHO_PHEP = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Đuôi file → MIME. Cùng đúng 8 kiểu bucket 'lead-files' nhận. */
const MIME_THEO_DUOI: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Kiểu file suy từ đuôi tên.
 *
 * Cần vì bucket KHÔNG nhận 'application/octet-stream' — mà đó đúng là thứ nhận
 * được khi trình duyệt bên cổng không đoán ra kiểu (hay gặp với .docx trên
 * Windows). Không suy thì file rơi im lặng vào danh sách hỏng.
 */
export function mimeTuDuoi(ten: string): string | null {
  const duoi = ten.toLowerCase().split(".").pop() ?? "";
  return MIME_THEO_DUOI[duoi] ?? null;
}

export interface TepGui {
  /** Tên gốc do đối tác đặt — giữ nguyên để hiện cho sales. */
  ten: string;
  /** Link ký hạn ngắn, do cổng tạo. Chỉ chấp nhận link trỏ về chính project cổng. */
  url: string;
  mime?: string | null;
  co_chu?: number | null;
}

export interface YeuCauGui {
  crm_agent_id: number;
  /** Số file đối tác THỰC SỰ đính kèm (cổng đếm). Có thể lớn hơn `tep.length`
   *  khi file rơi ngay từ bước ký link — chênh lệch đó phải hiện cho người báo giá. */
  so_tep_gui: number | null;
  /** Tên các file cổng đã loại trước khi gửi (sai thư mục, không ký được). */
  tep_hong_cong: string[];
  /** Tài khoản cổng đã đăng nhập để gửi — KHÁC người liên hệ họ gõ trong form.
   *  Tab "Yêu cầu báo giá" bên CRM hiện cột này để biết ai bên đối tác đã gửi. */
  tai_khoan_email: string | null;
  tai_khoan_ten: string | null;
  tieu_de: string | null;
  noi_dung: string | null;
  so_khach: number | null;
  ngay_di_du_kien: string | null;
  ngay_ve_du_kien: string | null;
  nguoi_lien_he: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  tep: TepGui[];
}

const cat = (v: unknown, n: number): string | null => {
  const s = String(v ?? "").trim().slice(0, n);
  return s || null;
};

const ngay = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Link file phải trỏ về chính project cổng, dạng link ký.
 *
 * Đây là hàng rào SSRF: hàm này chạy bằng service_role bên trong hạ tầng CRM, ai
 * đưa được URL vào là sai khiến nó đi tải hộ. Chỉ nhận đúng một origin và đúng
 * tiền tố đường dẫn của link ký; link '/object/public/' cũng từ chối vì file đối
 * tác gửi lên vốn nằm ở bucket private.
 */
export function laLinkCongHopLe(url: string, portalUrl: string): boolean {
  if (!url || !portalUrl) return false;
  let u: URL;
  let goc: URL;
  try {
    u = new URL(url);
    goc = new URL(portalUrl);
  } catch {
    return false;
  }
  if (u.origin !== goc.origin) return false;
  return u.pathname.startsWith("/storage/v1/object/sign/");
}

/**
 * Đường dẫn file trong bucket 'lead-files'.
 *
 * Thư mục cấp 1 mang id đối tác bên CRM: nhìn kho file là biết ngay của ai, và
 * đối tác này gửi tên trùng tên đối tác kia cũng không đè lên nhau. `stamp` +
 * `chiSo` để hai file cùng tên trong một lượt gửi không đè nhau.
 */
export function duongDanLeadFile(
  crmAgentId: number,
  stamp: string,
  chiSo: number,
  tenGoc: string,
): string {
  return `agent_${crmAgentId}/${stamp}_${chiSo}_${lamSachTen(tenGoc)}`;
}

/** Mốc thời gian dùng trong đường dẫn: "20260821-091530". */
export function stampTuNgay(d: Date): string {
  const hai = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${hai(d.getUTCMonth() + 1)}${hai(d.getUTCDate())}` +
    `-${hai(d.getUTCHours())}${hai(d.getUTCMinutes())}${hai(d.getUTCSeconds())}`
  );
}

export type KetQuaChuanHoa =
  | { ok: true; data: YeuCauGui }
  | { ok: false; loi: string };

/**
 * Chuẩn hoá + kiểm payload đối tác gửi.
 *
 * File KHÔNG hợp lệ thì bỏ file đó chứ không bỏ cả yêu cầu: nội dung mới là thứ
 * sales cần, mất một file đính kèm còn hơn mất luôn cái yêu cầu (đối tác thấy
 * báo lỗi mà không biết vì sao, gửi lại vẫn hỏng).
 */
export function chuanHoaYeuCau(body: Record<string, unknown>, portalUrl: string): KetQuaChuanHoa {
  const crmAgentId = Number(body.crm_agent_id);
  if (!Number.isFinite(crmAgentId) || crmAgentId <= 0) {
    return { ok: false, loi: "Thiếu crm_agent_id" };
  }

  const tieuDe = cat(body.tieu_de, MAX_CHU_TIEU_DE);
  const noiDung = cat(body.noi_dung, MAX_CHU_NOI_DUNG);
  if (!tieuDe && !noiDung) return { ok: false, loi: "Cần nhập nội dung yêu cầu" };

  const soKhachRaw = Number(body.so_khach);
  const soKhach = Number.isFinite(soKhachRaw) && soKhachRaw > 0
    ? Math.min(Math.round(soKhachRaw), 1000)
    : null;

  const tepRaw = Array.isArray(body.tep) ? body.tep : [];
  const tep: TepGui[] = [];
  for (const raw of tepRaw) {
    if (tep.length >= MAX_TEP) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const url = String(r.url ?? "");
    if (!laLinkCongHopLe(url, portalUrl)) continue;
    const coChu = Number(r.co_chu);
    if (Number.isFinite(coChu) && coChu > MAX_CO_CHU) continue;
    const mime = cat(r.mime, 100);
    if (mime && !MIME_CHO_PHEP.includes(mime as (typeof MIME_CHO_PHEP)[number])) continue;
    tep.push({
      ten: cat(r.ten, 300) ?? "file",
      url,
      mime,
      co_chu: Number.isFinite(coChu) ? coChu : null,
    });
  }

  return {
    ok: true,
    data: {
      crm_agent_id: crmAgentId,
      so_tep_gui: Number.isFinite(Number(body.so_tep_gui)) ? Number(body.so_tep_gui) : null,
      tep_hong_cong: Array.isArray(body.tep_hong_cong)
        ? body.tep_hong_cong.map((x) => cat(x, 300) ?? "file").slice(0, MAX_TEP)
        : [],
      tai_khoan_email: cat(body.tai_khoan_email, 200),
      tai_khoan_ten: cat(body.tai_khoan_ten, 200),
      tieu_de: tieuDe,
      noi_dung: noiDung,
      so_khach: soKhach,
      ngay_di_du_kien: ngay(body.ngay_di_du_kien),
      ngay_ve_du_kien: ngay(body.ngay_ve_du_kien),
      nguoi_lien_he: cat(body.nguoi_lien_he, 200),
      email: cat(body.email, 200),
      so_dien_thoai: cat(body.so_dien_thoai, 50),
      tep,
    },
  };
}
