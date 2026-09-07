// src/lib/bao-gia-loc.ts
// Lọc / tìm kiếm danh sách báo giá — logic THUẦN, tách khỏi UI để test được mà
// không cần render trang.

import { baoGiaCode } from "@/components/bao-gia/detail/helpers";

/** Chỉ những trường cần cho việc lọc — để test không phải dựng cả BaoGiaRow. */
export interface BaoGiaLocRow {
  id: number;
  ma_bg?: string | null;
  tieu_de?: string | null;
  trang_thai?: string | null;
  loai_bao_gia?: string | null;
  agent_id?: number | null;
  so_phien_ban_cuoi?: number | null;
  created_at?: string | null;
}

/** "chua_gan" = chỉ lấy báo giá chưa gắn đối tác nào. */
export type LocDoiTac = number | "chua_gan" | null;

export interface BoLocBaoGia {
  /** Từ khoá: mã BG (kể cả hậu tố -v3), tên chương trình, tên đối tác. Bỏ dấu,
   *  khớp theo TỪNG TỪ nên gõ thiếu/đảo thứ tự vẫn ra. */
  q?: string;
  /** "draft" | "sent" | "final". Rỗng / vắng = mọi trạng thái. */
  trangThai?: string;
  /** "tu_tinh" | "gia_cuoi". Rỗng / vắng = mọi loại. */
  loaiBaoGia?: string;
  /** agents.id, hoặc "chua_gan". null / vắng = mọi đối tác. */
  agentId?: LocDoiTac;
  /** Khoảng NGÀY TẠO, dạng yyyy-mm-dd (đúng thứ ô <input type="date"> trả về). */
  tuNgay?: string;
  denNgay?: string;
}

/**
 * Chuẩn hoá một chuỗi trước khi so khớp tìm kiếm.
 *
 * KHÔNG dùng lại `boDau` của bảng giá: hàm đó đang được dùng để dò TÊN TRÙNG trong
 * danh mục dịch vụ, nới tay nó ra là đổi luôn kết quả cảnh báo trùng ở màn khác.
 * Ở đây cần nới hơn hẳn, vì 33/39 tiêu đề báo giá là tiếng Trung do đối tác dán từ mail.
 */
export function chuanHoaTim(s: string | null | undefined): string {
  return String(s ?? "")
    // NFKC gộp ký tự TOÀN chiều rộng về nửa chiều rộng. Tiêu đề đối tác Đài Loan gửi
    // sang hay lẫn ５ ６ － ｜ ． — trên màn hình nhìn hệt 5 6 - | . nhưng là mã khác,
    // thiếu bước này thì gõ "5天" vào tiêu đề "５天" ra 0 kết quả.
    .normalize("NFKC")
    .toLowerCase()
    // U+0300–U+036F = dấu thanh/dấu mũ tách ra sau NFD. Viết bằng escape chứ KHÔNG
    // dán ký tự thật: chúng vô hình, editor/diff nuốt mất là hàm lặng lẽ ngừng bỏ dấu.
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    // Mọi thứ không phải chữ/số thành khoảng trắng: gõ "BG00025-v2" hay "BG00025 v2"
    // đều ra như nhau, và 【】、｜ trong tiêu đề không cắt mất từ khoá.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Giờ VN cố định, KHÔNG lấy theo máy: để kết quả lọc giống nhau ở mọi máy và
// test không phụ thuộc múi giờ của người chạy.
const FMT_NGAY_VN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày (yyyy-mm-dd) theo giờ VN của một mốc thời gian ISO. null nếu không đọc được.
 *
 *  KHÔNG được thay bằng `iso.slice(0, 10)`: chuỗi trong DB là UTC, nên báo giá tạo
 *  lúc 0h–7h sáng giờ VN mang ngày HÔM TRƯỚC theo UTC — lọc "từ ngày" sẽ lặng lẽ
 *  bỏ sót đúng những dòng đó. */
export function ngayTaoVN(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // formatToParts thay vì format(): không phụ thuộc vào việc locale en-CA có nối
  // chuỗi theo đúng thứ tự yyyy-mm-dd hay không.
  const p: Record<string, string> = {};
  for (const part of FMT_NGAY_VN.formatToParts(d)) p[part.type] = part.value;
  if (!p.year || !p.month || !p.day) return null;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Chuỗi đem đi so khớp từ khoá của một dòng. */
function chuoiTim(row: BaoGiaLocRow, tenDoiTac: Record<number, string>): string {
  const ma = baoGiaCode(row);
  const v = row.so_phien_ban_cuoi ?? 0;
  // Đối tác giữ tên của BẢN HỌ ĐÃ NHẬN, không phải bản mới nhất — file Word gửi đi
  // mang đúng tên đó ("BG00025-v2"). Ghép đủ mọi bản đã chào để dán tên nào cũng ra.
  // Bản 1 mang chính mã gốc (xem maPhienBan trong lib/bao-gia-phien-ban.ts) nên đếm từ 2.
  const banDaChao: string[] = [];
  for (let i = 2; i <= v; i++) banDaChao.push(`${ma}-v${i}`);
  return [
    ma,
    ...banDaChao,
    row.tieu_de ?? "",
    row.agent_id != null ? (tenDoiTac[row.agent_id] ?? "") : "",
  ].join(" ");
}

/**
 * Lọc danh sách báo giá. GIỮ NGUYÊN thứ tự đầu vào — việc xếp nhóm "đối tác chờ
 * trả lời" lên đầu do trang tự làm sau khi lọc.
 *
 * @param tenDoiTac map agents.id → tên, để tìm được theo tên đối tác.
 */
export function locBaoGia<T extends BaoGiaLocRow>(
  rows: T[],
  f: BoLocBaoGia = {},
  tenDoiTac: Record<number, string> = {},
): T[] {
  const tuKhoa = chuanHoaTim(f.q).split(" ").filter(Boolean);
  const trangThai = f.trangThai || null;
  const loai = f.loaiBaoGia || null;
  const agent = f.agentId ?? null;
  const tuNgay = f.tuNgay || null;
  const denNgay = f.denNgay || null;

  return rows.filter((r) => {
    // trang_thai để trống trong DB nghĩa là 'draft' — bảng cũng vẽ mọi giá trị lạ
    // thành "Nháp", nên lọc phải hiểu giống hệt, kẻo chọn Nháp lại thiếu dòng.
    if (trangThai && (r.trang_thai ?? "draft") !== trangThai) return false;
    if (loai && (r.loai_bao_gia ?? "tu_tinh") !== loai) return false;

    if (agent === "chua_gan") {
      if (r.agent_id != null) return false;
    } else if (typeof agent === "number") {
      if (r.agent_id !== agent) return false;
    }

    if (tuNgay || denNgay) {
      const ngay = ngayTaoVN(r.created_at);
      // Không đọc được ngày thì không thể khẳng định nó nằm trong khoảng → loại,
      // để "từ 01/09 đến 05/09" không lẫn dòng không rõ ngày.
      if (!ngay) return false;
      if (tuNgay && ngay < tuNgay) return false;
      if (denNgay && ngay > denNgay) return false;
    }

    if (tuKhoa.length) {
      const hay = chuanHoaTim(chuoiTim(r, tenDoiTac));
      if (!tuKhoa.every((tk) => hay.includes(tk))) return false;
    }
    return true;
  });
}

/** Có bộ lọc nào đang bật không — để quyết định hiện nút "Xoá lọc". */
export function coDangLoc(f: BoLocBaoGia): boolean {
  return Boolean(
    f.q?.trim() || f.trangThai || f.loaiBaoGia || f.agentId != null || f.tuNgay || f.denNgay,
  );
}
