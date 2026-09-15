// Builder mail booking NHÀ XE (đặt lần đầu + gửi cập nhật) — tách thuần khỏi
// BookingXeCard để test được mà không cần render.
//
// Mail "Gửi cập nhật" GỬI LẠI ĐỦ như mail đặt: thông tin xe + lịch trình từng ngày
// + ghi chú. Nhà xe / lái xe chỉ cần cầm mail mới nhất. Trước 15/09/2026 mail cập
// nhật chỉ còn vài dòng tóm tắt kèm câu "chi tiết khác xem mail booking gốc" →
// lịch trình biến mất, điều hành phải tự gửi lại bằng tay.
//
// "Thay đổi gì": lúc gửi (cả lần đầu lẫn cập nhật) lưu bản chụp nội dung vào
// doan_booking_xe.mail_sent_snapshot (buildXeMailSnapshot). Lần cập nhật sau so
// bản chụp đó với nội dung hiện tại (diffXeMailSnapshot) → khung "Các thay đổi"
// đầu mail + tô vàng ô đã đổi. Bản chụp lưu CHỮ đã hiển thị (không lưu id): nhà
// hàng đổi địa chỉ/SĐT trong danh mục cũng là thay đổi với lái xe.
// Booking gửi trước khi có cột (bản chụp null) → không tự liệt kê được, chỉ còn
// lời nhắn điều hành gõ tay.

import { buildUpdateBanner, buildUpdateNoteCallout, escapeHtml } from "@/lib/email-update";
import type { DayExportCell } from "@/lib/export-dieu-tour-word";
import { formatXeForEmail } from "@/lib/xe-email";
import { fmtDateVi } from "./huy-mail-shell";

export interface XeMailInput {
  tenDoan: string;
  /** Tên nhà xe — trống thì chào "Quý đối tác". */
  nhaXeTen: string | null;
  /** ten_xe / so_cho của loại xe — định dạng qua formatXeForEmail. */
  tenXe: string | null;
  soCho: number | null;
  ngayDi: string | null;
  ngayVe: string | null;
  chuyenBayDon: string | null;
  chuyenBayTien: string | null;
  /** formatHdvsForEmail(doanHdvs) — resolve ở caller. */
  hdvText: string;
  soKhach: number | null;
  ghiChu: string | null;
  /** computeExportCells(exportData) — lịch trình từng ngày. */
  cells: DayExportCell[];
  senderName: string;
  senderPhone?: string | null;
  /** parseXeMailSnapshot(booking.mail_sent_snapshot) — chỉ mode update dùng. */
  prevSnapshot?: XeMailSnapshot | null;
  /** Giờ gửi mail trước, caller format sẵn theo giờ máy (vd "16/09/2026 13:27"). */
  prevSentLabel?: string | null;
}

export type XeMailSnapshotNgay = {
  ngay_date: string;
  thu: string;
  chuong_trinh: string;
  an_trua: string;
  an_toi: string;
  khach_san: string;
};

/** Nội dung đã gửi nhà xe — jsonb doan_booking_xe.mail_sent_snapshot. Khai `type`
 *  (không phải interface) để gán thẳng được vào cột jsonb. */
export type XeMailSnapshot = {
  v: 1;
  xe: string;
  ngay_di: string;
  chuyen_bay_don: string;
  ngay_ve: string;
  chuyen_bay_tien: string;
  so_khach: number | null;
  hdv: string;
  ghi_chu: string;
  ngay: XeMailSnapshotNgay[];
};

export interface XeMailChange {
  /** Khoá tô vàng: field đầu mail ("so_khach"…), "ngay:<i>:<cột>", "ngay:<i>"
   *  (cả ngày mới thêm), "bo_ngay:<i>" (ngày bị bỏ — không còn ô để tô). */
  key: string;
  label: string;
  /** Dòng cũ đã bỏ/thay — rỗng = trước đó chưa có. */
  truoc: string[];
  /** Dòng mới — rỗng = nay bỏ. */
  nay: string[];
}

const HL_BG = "background:#fef08a";

const UPDATE_SUBTITLE =
  "Đây không phải booking mới — bên dưới là thông tin và lịch trình ĐẦY ĐỦ đã cập nhật, thay thế cho mail trước.";

function textLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Dòng hiển thị của 1 ô lịch trình — bỏ dòng "Set:" (giá set menu, nhà xe không cần). */
function cellLines(text: string): string[] {
  return textLines(text).filter((l) => !l.startsWith("Set:"));
}

/** "17/9" — nhãn ngày ngắn như bảng lịch trình. Rỗng nếu ngày hỏng. */
function fmtNgayNgan(d: string): string {
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

/** "2 (17/9)" — số thứ tự ngày + ngày lịch ngắn. */
function nhanNgay(index: number, ngayDate: string): string {
  const ngan = fmtNgayNgan(ngayDate);
  return `${index + 1}${ngan ? ` (${ngan})` : ""}`;
}

function xeText(i: Pick<XeMailInput, "tenXe" | "soCho">): string {
  const s = formatXeForEmail(i.tenXe, i.soCho);
  return s === "—" ? "" : s;
}

export function buildXeMailSnapshot(i: XeMailInput): XeMailSnapshot {
  return {
    v: 1,
    xe: xeText(i),
    ngay_di: i.ngayDi ?? "",
    chuyen_bay_don: (i.chuyenBayDon ?? "").trim(),
    ngay_ve: i.ngayVe ?? "",
    chuyen_bay_tien: (i.chuyenBayTien ?? "").trim(),
    so_khach: i.soKhach || null,
    hdv: i.hdvText.trim(),
    ghi_chu: (i.ghiChu ?? "").trim(),
    ngay: i.cells.map((c) => ({
      ngay_date: c.ngay_date,
      thu: c.thu,
      chuong_trinh: cellLines(c.chuongTrinh).join("\n"),
      an_trua: cellLines(c.anTrua).join("\n"),
      an_toi: cellLines(c.anToi).join("\n"),
      khach_san: cellLines(c.khachSan).join("\n"),
    })),
  };
}

/** Đọc jsonb từ DB. Chưa có / sai khuôn → null: mail vẫn gửi đủ, chỉ mất phần tự
 *  liệt kê thay đổi (modal báo cho điều hành biết để ghi tay). */
export function parseXeMailSnapshot(raw: unknown): XeMailSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.ngay)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    v: 1,
    xe: str(o.xe),
    ngay_di: str(o.ngay_di),
    chuyen_bay_don: str(o.chuyen_bay_don),
    ngay_ve: str(o.ngay_ve),
    chuyen_bay_tien: str(o.chuyen_bay_tien),
    so_khach: typeof o.so_khach === "number" ? o.so_khach : null,
    hdv: str(o.hdv),
    ghi_chu: str(o.ghi_chu),
    // Ngày hỏng khuôn → ngày rỗng, KHÔNG lọc bỏ: lọc làm lệch thứ tự các ngày sau.
    ngay: o.ngay.map((d) => {
      const r = d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
      return {
        ngay_date: str(r.ngay_date),
        thu: str(r.thu),
        chuong_trinh: str(r.chuong_trinh),
        an_trua: str(r.an_trua),
        an_toi: str(r.an_toi),
        khach_san: str(r.khach_san),
      };
    }),
  };
}

type HeaderField = Exclude<keyof XeMailSnapshot, "v" | "ngay">;
type DayCol = Exclude<keyof XeMailSnapshotNgay, "ngay_date" | "thu">;

const HEADER_FIELDS: ReadonlyArray<{ key: HeaderField; label: string; show: (s: XeMailSnapshot) => string }> = [
  { key: "xe", label: "Xe", show: (s) => s.xe },
  { key: "ngay_di", label: "Ngày đón", show: (s) => (s.ngay_di ? fmtDateVi(s.ngay_di) : "") },
  { key: "chuyen_bay_don", label: "Chuyến bay đón", show: (s) => s.chuyen_bay_don },
  { key: "ngay_ve", label: "Ngày tiễn", show: (s) => (s.ngay_ve ? fmtDateVi(s.ngay_ve) : "") },
  { key: "chuyen_bay_tien", label: "Chuyến bay tiễn", show: (s) => s.chuyen_bay_tien },
  { key: "so_khach", label: "Số khách", show: (s) => (s.so_khach ? `${s.so_khach} khách` : "") },
  { key: "hdv", label: "HDV", show: (s) => s.hdv },
  { key: "ghi_chu", label: "Ghi chú", show: (s) => s.ghi_chu },
];

// coTen: dòng đầu ô là TÊN quán/khách sạn → chỉ đổi địa chỉ/SĐT thì kèm tên vào nhãn
// cho lái xe biết của chỗ nào.
const DAY_COLS: ReadonlyArray<{ col: DayCol; label: string; coTen: boolean }> = [
  { col: "chuong_trinh", label: "Chương trình", coTen: false },
  { col: "an_trua", label: "Ăn trưa", coTen: true },
  { col: "an_toi", label: "Ăn tối", coTen: true },
  { col: "khach_san", label: "Khách sạn", coTen: true },
];

/** Dòng của `a` không khớp được dòng nào của `b` (đếm theo số lần xuất hiện). */
function linesNotIn(a: string[], b: string[]): string[] {
  const pool = [...b];
  return a.filter((line) => {
    const k = pool.indexOf(line);
    if (k < 0) return true;
    pool.splice(k, 1);
    return false;
  });
}

export function diffXeMailSnapshot(prev: XeMailSnapshot, cur: XeMailSnapshot): XeMailChange[] {
  const changes: XeMailChange[] = [];

  for (const f of HEADER_FIELDS) {
    const a = f.show(prev).trim();
    const b = f.show(cur).trim();
    if (a !== b) changes.push({ key: f.key, label: f.label, truoc: textLines(a), nay: textLines(b) });
  }

  // Khớp ngày theo THỨ TỰ (ngày 1, 2…), không theo ngày lịch: dời ngày đón thì cả
  // lịch trình dịch theo — so theo ngày lịch sẽ báo đổi toàn bộ. Ngày lịch từng ngày
  // suy ra từ "Ngày đón" (đã liệt kê ở trên) nên không liệt kê lại, chỉ tô ô ngày.
  const soNgay = Math.max(prev.ngay.length, cur.ngay.length);
  for (let i = 0; i < soNgay; i++) {
    const p = prev.ngay[i];
    const c = cur.ngay[i];
    if (!p && c) {
      changes.push({ key: `ngay:${i}`, label: `Thêm ngày ${nhanNgay(i, c.ngay_date)}`, truoc: [], nay: textLines(c.chuong_trinh) });
      continue;
    }
    if (p && !c) {
      changes.push({ key: `bo_ngay:${i}`, label: `Bỏ ngày ${nhanNgay(i, p.ngay_date)}`, truoc: textLines(p.chuong_trinh), nay: [] });
      continue;
    }
    if (!p || !c) continue;
    for (const { col, label, coTen } of DAY_COLS) {
      const a = textLines(p[col]);
      const b = textLines(c[col]);
      if (a.join("\n") === b.join("\n")) continue;
      const bo = linesNotIn(a, b);
      const them = linesNotIn(b, a);
      // Cùng các dòng, khác thứ tự (đảo cảnh điểm) → đưa đủ 2 danh sách để thấy thứ tự.
      const doiThuTu = bo.length === 0 && them.length === 0;
      const ten = coTen && !doiThuTu && a[0] && a[0] === b[0] ? ` — ${a[0]}` : "";
      changes.push({
        key: `ngay:${i}:${col}`,
        label: `Ngày ${nhanNgay(i, c.ngay_date)} · ${label}${doiThuTu ? " (đổi thứ tự)" : ten}`,
        truoc: doiThuTu ? a : bo,
        nay: doiThuTu ? b : them,
      });
    }
  }
  return changes;
}

type Highlight = (...keys: string[]) => boolean;

function buildChangesHtml(changes: XeMailChange[], prevSentLabel: string | null | undefined): string {
  if (changes.length === 0) return "";
  const TH = "border:1px solid #fcd34d;padding:6px 10px;background:#fef3c7;text-align:left;font-size:13px;color:#92400e";
  const TD = "border:1px solid #fde68a;padding:6px 10px;font-size:13px;vertical-align:top";
  const show = (lines: string[]) => (lines.length ? lines.map(escapeHtml).join("<br>") : "—");
  const rows = changes
    .map(
      (c) => `<tr>
        <td style="${TD};font-weight:600">${escapeHtml(c.label)}</td>
        <td style="${TD};color:#64748b">${show(c.truoc)}</td>
        <td style="${TD};font-weight:600;color:#0f172a">${show(c.nay)}</td>
      </tr>`,
    )
    .join("");
  return `<div style="margin-bottom:20px">
        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#92400e">Các thay đổi so với mail trước${prevSentLabel ? ` (gửi ${escapeHtml(prevSentLabel)})` : ""}:</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><th style="${TH};width:34%">Hạng mục</th><th style="${TH};width:33%">Trước</th><th style="${TH}">Nay</th></tr>
          ${rows}
        </table>
        <p style="margin:6px 0 0;font-size:12px;color:#92400e;font-style:italic">Phần thay đổi cũng được tô vàng trong bảng bên dưới.</p>
      </div>`;
}

function buildInfoTableHtml(i: XeMailInput, hl: Highlight): string {
  const LABEL = "padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0";
  const VALUE = "padding:6px 12px;border:1px solid #e2e8f0";
  const row = (label: string, valueHtml: string, doi: boolean, labelExtra = "") =>
    `<tr><td style="${LABEL}${labelExtra}">${label}</td><td style="${VALUE}${doi ? `;${HL_BG}` : ""}">${valueHtml}</td></tr>`;
  const ngayCb = (ngay: string | null, cb: string | null) => {
    const cbText = (cb ?? "").trim();
    return `${ngay ? escapeHtml(fmtDateVi(ngay)) : "—"}${cbText ? ` &nbsp;|&nbsp; CB: ${escapeHtml(cbText)}` : ""}`;
  };
  const xe = xeText(i);
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">
        ${row("Đoàn", escapeHtml(i.tenDoan), false, ";width:35%")}
        ${row("Xe", xe ? escapeHtml(xe) : "—", hl("xe"))}
        ${row("Ngày đón", ngayCb(i.ngayDi, i.chuyenBayDon), hl("ngay_di", "chuyen_bay_don"))}
        ${row("Ngày tiễn", ngayCb(i.ngayVe, i.chuyenBayTien), hl("ngay_ve", "chuyen_bay_tien"))}
        ${row("HDV", escapeHtml(i.hdvText), hl("hdv"))}
        ${row("Số khách", i.soKhach ? `${i.soKhach} khách` : "—", hl("so_khach"))}
      </table>`;
}

function buildScheduleHtml(cells: DayExportCell[], hl: Highlight): string {
  if (cells.length === 0) return "";
  const COL = "border:1px solid #e2e8f0;padding:6px 10px;font-size:13px;vertical-align:top";
  const HD = COL + ";background:#f1f5f9;font-weight:600;text-align:center";
  const toHtml = (text: string) => {
    const lines = cellLines(text);
    return lines.length ? lines.map(escapeHtml).join("<br>") : "—";
  };

  const header = `<tr>
    <th style="${HD}">Ngày</th>
    <th style="${HD}">Chương trình</th>
    <th style="${HD}">Ăn trưa</th>
    <th style="${HD}">Ăn tối</th>
    <th style="${HD}">Khách sạn</th>
  </tr>`;

  const rows = cells
    .map((dc, idx) => {
      const bg = (col: string) => (hl(`ngay:${idx}`, `ngay:${idx}:${col}`) ? `;${HL_BG}` : "");
      const dateLabel = `${fmtNgayNgan(dc.ngay_date) || `Ngày ${idx + 1}`}<br><span style="color:#64748b;font-size:11px">${escapeHtml(dc.thu)}</span>`;
      return `<tr>
      <td style="${COL};text-align:center;white-space:nowrap${bg("ngay_date")}">${dateLabel}</td>
      <td style="${COL}${bg("chuong_trinh")}">${toHtml(dc.chuongTrinh)}</td>
      <td style="${COL}${bg("an_trua")}">${toHtml(dc.anTrua)}</td>
      <td style="${COL}${bg("an_toi")}">${toHtml(dc.anToi)}</td>
      <td style="${COL}${bg("khach_san")}">${toHtml(dc.khachSan)}</td>
    </tr>`;
    })
    .join("");

  return `<h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a">Lịch trình</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px">${header}${rows}</table>`;
}

export function buildXeEmailHtml(i: XeMailInput, mode: "first" | "update" = "first", note = ""): string {
  const isUpdate = mode === "update";
  const nhaXeTen = i.nhaXeTen?.trim() || "Quý đối tác";

  const prev = isUpdate ? (i.prevSnapshot ?? null) : null;
  const cur = buildXeMailSnapshot(i);
  const changes = prev ? diffXeMailSnapshot(prev, cur) : [];
  const doi = new Set(changes.map((c) => c.key));
  // Ô ngày lịch không thành dòng thay đổi riêng (đã có "Ngày đón") nhưng vẫn tô.
  if (prev) {
    cur.ngay.forEach((d, idx) => {
      const p = prev.ngay[idx];
      if (p && p.ngay_date !== d.ngay_date) doi.add(`ngay:${idx}:ngay_date`);
    });
  }
  const hl: Highlight = (...keys) => keys.some((k) => doi.has(k));

  const tenDoan = escapeHtml(i.tenDoan);
  const introHtml = isUpdate
    ? `Công ty TNHH Du lịch S8 xin gửi lại thông tin đặt xe <strong>đã cập nhật</strong> cho đoàn <strong>${tenDoan}</strong>:`
    : `Công ty TNHH Du lịch S8 xin đặt xe cho đoàn <strong>${tenDoan}</strong>:`;
  const closingHtml = isUpdate
    ? "Kính nhờ Quý nhà xe xác nhận đã nhận thông tin cập nhật. Trân trọng cảm ơn!"
    : "Kính nhờ xác nhận và báo giá trong vòng <strong>24 giờ</strong>. Trân trọng cảm ơn!";
  const updateTop = isUpdate
    ? `${buildUpdateBanner(UPDATE_SUBTITLE)}
      ${buildUpdateNoteCallout(note)}
      ${buildChangesHtml(changes, i.prevSentLabel)}`
    : "";
  const ghiChu = (i.ghiChu ?? "").trim();
  const ghiChuHtml = ghiChu
    ? `<div style="margin-top:20px;${hl("ghi_chu") ? HL_BG : "background:#f8fafc"};border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${escapeHtml(ghiChu).replace(/\n/g, "<br>")}</div>`
    : "";

  // <hr> trước chữ ký PHẢI giữ nguyên style: EmailPreviewModal tìm đúng chuỗi này
  // để thay khối chữ ký khi điều hành chọn chữ ký riêng.
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:780px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px;letter-spacing:.5px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY &nbsp;|&nbsp; MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      ${updateTop}
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${escapeHtml(nhaXeTen)}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">${introHtml}</p>
      ${buildInfoTableHtml(i, hl)}
      ${buildScheduleHtml(i.cells, hl)}
      ${ghiChuHtml}
      <p style="margin-top:20px;color:#475569;font-size:13px">
        ${closingHtml}
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${escapeHtml(i.senderName)}</strong>${i.senderPhone ? `<br>${escapeHtml(i.senderPhone)}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, TP Đà Nẵng, VN<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}
