// ─────────────────────────────────────────────────────────────────────────────
// Phát hiện "bản chốt mail" lệch dữ liệu hiện tại.
//
// Nội dung mail booking (tiêu đề + bảng check-in/check-out) được dựng MỘT LẦN
// lúc mở cửa sổ soạn rồi nằm yên trong state. Điều tour lại lưu tự động sau
// 1,5s kể từ mỗi thay đổi, mỗi ngày một lượt lưu riêng → đêm cuối có thể ghi
// xong SAU khi mail đã dựng. Đã xảy ra thật: mail đi thiếu một đêm so với lịch
// trình, khách sạn giữ nhầm ngày trả phòng và không ai được cảnh báo.
//
// So bản chốt (lúc dựng) với dữ liệu hiện tại (lúc bấm Gửi) → liệt kê chỗ lệch
// để chặn gửi và hỏi lại OP.
// ─────────────────────────────────────────────────────────────────────────────

/** Dữ liệu đã dùng để dựng nội dung mail booking KS. */
export type KsMailSnapshot = {
  khach_san_id: number;
  /** Các đêm ở, dạng "YYYY-MM-DD", đã sort tăng dần. */
  check_in_dates: string[];
  so_phong: string;
  ghi_chu: string;
};

/** Một chỗ lệch. `nhan` là key tiếng Việt — UI bọc qua `t()` để dịch. */
export interface MailDriftItem {
  nhan: string;
  truoc: string;
  sau: string;
}

const TRONG = "—";

/** "2026-11-26" → "26/11". Chuỗi lạ thì trả nguyên văn. */
function fmtNgay(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}` : d;
}

function fmtDsNgay(ds: string[]): string {
  return ds.length > 0 ? ds.map(fmtNgay).join(", ") : TRONG;
}

function fmtChuoi(s: string): string {
  return s.trim() || TRONG;
}

/**
 * So bản chốt với dữ liệu hiện tại. Trả mảng rỗng khi khớp (hoặc chưa có bản
 * chốt — lúc đó không có gì để lệch).
 */
export function soSanhMailKS(
  truoc: KsMailSnapshot | null | undefined,
  sau: KsMailSnapshot,
): MailDriftItem[] {
  if (!truoc) return [];
  const items: MailDriftItem[] = [];

  if (truoc.khach_san_id !== sau.khach_san_id) {
    items.push({ nhan: "Khách sạn", truoc: `#${truoc.khach_san_id}`, sau: `#${sau.khach_san_id}` });
  }

  // Số đêm tách riêng khỏi danh sách ngày: đây là con số khách sạn đọc trước
  // nhất (tiêu đề mail + dòng check-out), lệch 1 đêm là lệch tiền phòng.
  if (truoc.check_in_dates.length !== sau.check_in_dates.length) {
    items.push({
      nhan: "Số đêm",
      truoc: String(truoc.check_in_dates.length),
      sau: String(sau.check_in_dates.length),
    });
  }
  if (truoc.check_in_dates.join(",") !== sau.check_in_dates.join(",")) {
    items.push({
      nhan: "Ngày ở",
      truoc: fmtDsNgay(truoc.check_in_dates),
      sau: fmtDsNgay(sau.check_in_dates),
    });
  }

  if (truoc.so_phong.trim() !== sau.so_phong.trim()) {
    items.push({ nhan: "Số phòng", truoc: fmtChuoi(truoc.so_phong), sau: fmtChuoi(sau.so_phong) });
  }
  if (truoc.ghi_chu.trim() !== sau.ghi_chu.trim()) {
    items.push({ nhan: "Ghi chú", truoc: fmtChuoi(truoc.ghi_chu), sau: fmtChuoi(sau.ghi_chu) });
  }

  return items;
}
