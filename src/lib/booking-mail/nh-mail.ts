// Builder mail booking NHÀ HÀNG — tách thuần từ MealCard để flow lẻ (card) và
// GỬI HÀNG LOẠT dùng chung 1 nguồn HTML/subject/hash-fields duy nhất.
//
// QUAN TRỌNG: output phải giữ Y HỆT flow lẻ trước đây —
//   - subject lệch → Gmail (thread theo Subject+From, không dùng Message-ID) tách thread;
//   - field hash lệch → badge "Có thay đổi" không tắt sau gửi / tắt nhầm.
// Flow lẻ truyền input từ STATE card (selectedMenu/monList đang sửa); batch truyền
// từ BOOKING ĐÃ LƯU DB (ten_set_snapshot/mon_an_snapshot) — cùng hàm, hai nguồn.

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { buildUpdateEmailHtml, escapeHtml } from "@/lib/email-update";

export interface NhMailInput {
  tenDoan?: string;
  ngayDate?: string | null;
  buaAn: "trua" | "toi";
  nhaHangId: number | null;
  nhaHangTen?: string | null;
  setMenuId: number | null;
  tenSet: string | null;
  gia: number | null;
  donVi: string | null;
  monList: string[];
  ghiChu?: string | null;
  /** booking.mail_sent_snapshot — diff old→new cho mail cập nhật. */
  prevSnapshot?: Record<string, unknown> | null;
  soKhach?: number;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soNoidBo?: number;
  /** Chú thích khách (ăn chay/dị ứng/VIP…) từ Điều tour. */
  chuThichKhach?: string | null;
  /** formatHdvsForEmail(doanHdvs) — resolve ở caller. */
  hdvText: string;
  senderName: string;
  senderPhone?: string | null;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy (EEE)", { locale: vi }); } catch { return d; }
}

/** Key fields đưa vào mail — hash để detect dirty (badge "Có thay đổi"). */
export function buildNhMailFields(i: NhMailInput) {
  return {
    ngay_date: i.ngayDate,
    bua_an: i.buaAn,
    nha_hang_id: i.nhaHangId,
    set_menu_id: i.setMenuId,
    ten_set: i.tenSet ?? null,
    gia: i.gia ?? null,
    mon_an: i.monList,
    so_khach: i.soKhach,
    so_khach_lon: i.soKhachLon,
    so_khach_em1: i.soKhachEm1,
    so_khach_em2: i.soKhachEm2,
    so_noi_bo: i.soNoidBo,
  };
}

export function buildNhSubject(i: NhMailInput, mode: "first" | "update" = "first"): string {
  const buaLabel = i.buaAn === "trua" ? "ăn trưa" : "ăn tối";
  const ngayStr = i.ngayDate ? format(new Date(i.ngayDate + "T00:00:00"), "dd/MM", { locale: vi }) : "";
  const baseSubject = `[S8 Travel] Đặt ${buaLabel}${i.tenDoan ? ` – ${i.tenDoan}` : ""}${ngayStr ? ` – ${ngayStr}` : ""} – ${i.nhaHangTen || "Nhà hàng"}`;
  // KEEP subject IDENTICAL khi update — Gmail strip "Re:" rồi match subject để group thread.
  return mode === "update" ? `Re: ${baseSubject}` : baseSubject;
}

export function buildNhEmailHtml(i: NhMailInput, mode: "first" | "update" = "first", note = ""): string {
  const buaLabel = i.buaAn === "trua" ? "Ăn trưa" : "Ăn tối";
  const ctClean = (i.chuThichKhach ?? "").trim();
  const ctHtml = escapeHtml(ctClean).replace(/\n/g, "<br>");

  // Update mode: minimal layout — diff old→new thẳng trong từng dòng.
  if (mode === "update") {
    const prev = i.prevSnapshot;
    const num = (v: unknown) => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);
    const arrow = (label: string, p: number, c: number) =>
      p !== c ? `${label} ${p} → ${c}` : `${label} ${c}`;

    const curLon = num(i.soKhachLon);
    const curEm = num(i.soKhachEm1) + num(i.soKhachEm2);
    const prevLon = prev ? num(prev.so_khach_lon) : curLon;
    const prevEm = prev ? num(prev.so_khach_em1) + num(prev.so_khach_em2) : curEm;
    const soKhachVal =
      curEm > 0 || prevEm > 0
        ? `${arrow("Người lớn", prevLon, curLon)} + ${arrow("Trẻ em", prevEm, curEm)}`
        : arrow("Người lớn", prevLon, curLon);

    const ngayChanged = !!prev && (prev.ngay_date ?? "") !== (i.ngayDate ?? "");
    const ngayVal = ngayChanged
      ? `${fmtDate(String(prev!.ngay_date))} → ${fmtDate(i.ngayDate)}`
      : fmtDate(i.ngayDate);

    const curSetName = i.tenSet;
    const curSetPrice = i.gia;
    const curSetUnit = i.donVi;
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

    const prevMon = prev && Array.isArray(prev.mon_an) ? (prev.mon_an as string[]) : [];
    const curMon = i.monList;
    const removedMon = prev ? prevMon.filter((m) => !curMon.includes(m)) : [];
    const addedMon = prev ? curMon.filter((m) => !prevMon.includes(m)) : [];
    const monChangeItems: string[] = [];
    const pairs = Math.min(removedMon.length, addedMon.length);
    for (let k = 0; k < pairs; k++)
      monChangeItems.push(`${escapeHtml(removedMon[k])} → <strong>${escapeHtml(addedMon[k])}</strong>`);
    for (const m of addedMon.slice(pairs))
      monChangeItems.push(`Thêm: <strong>${escapeHtml(m)}</strong>`);
    for (const m of removedMon.slice(pairs))
      monChangeItems.push(`Bỏ: <strong>${escapeHtml(m)}</strong>`);

    const liSt = `style="margin:4px 0;font-size:14px"`;
    const lbl = (s: string) => `<span style="color:#64748b">${escapeHtml(s)}:</span>`;
    const row = (label: string, value: string) =>
      `<li ${liSt}>${lbl(label)} <strong>${escapeHtml(value)}</strong></li>`;
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
      row("Đoàn", i.tenDoan || "—"),
      row("Ngày", ngayVal),
      row("Bữa ăn", buaLabel),
      row("Số khách", soKhachVal),
      row("Set menu", setMenuVal),
      monBlock,
      ctClean
        ? `<li ${liSt}><span style="color:#b45309">⚠ Lưu ý khách:</span> <strong style="color:#b45309">${ctHtml}</strong></li>`
        : "",
      row("HDV", i.hdvText),
    ].join("")}</ul>`;
    return buildUpdateEmailHtml({
      greeting: `Kính gửi ${i.nhaHangTen || "Quý nhà hàng"},`,
      intro: `Cập nhật booking ${buaLabel.toLowerCase()} đoàn ${i.tenDoan || "—"}:`,
      keyFieldsHtml: keyFields,
      note,
      senderName: i.senderName,
      senderPhone: i.senderPhone ?? null,
    });
  }

  const monRows = i.monList.map((m, k) => `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px">${k + 1}</td><td style="border:1px solid #e2e8f0;padding:6px 12px">${m}</td></tr>`).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${i.nhaHangTen || "Quý nhà hàng"}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt <strong>${buaLabel}</strong> cho đoàn <strong>${i.tenDoan || "—"}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Đoàn</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${i.tenDoan || "—"}</strong></td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(i.ngayDate)}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Bữa ăn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${buaLabel}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Số khách</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${i.soKhach ?? "—"} khách</td></tr>
        ${i.soKhachLon ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">Người lớn</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${i.soKhachLon} khách</td></tr>` : ""}
        ${i.soKhachEm1 ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">TE 6–10 tuổi</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${i.soKhachEm1} khách</td></tr>` : ""}
        ${i.soKhachEm2 ? `<tr><td style="border:1px solid #e2e8f0;padding:6px 12px 6px 24px;color:#64748b;font-size:13px">TE dưới 6 tuổi</td><td style="border:1px solid #e2e8f0;padding:6px 12px;color:#64748b;font-size:13px">${i.soKhachEm2} khách</td></tr>` : ""}
        ${i.soNoidBo ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Nội bộ</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${i.soNoidBo} suất (${i.soNoidBo === 3 ? "T/L · HDV · Lái xe" : "HDV · Lái xe"})</td></tr>` : ""}
        ${i.tenSet ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Set menu</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${i.tenSet}${i.gia != null ? ` — ${i.gia.toLocaleString("vi-VN")}/${i.donVi}` : ""}</td></tr>` : ""}
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">HDV</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${i.hdvText}</td></tr>
        ${ctClean ? `<tr><td style="border:1px solid #fcd34d;background:#fffbeb;padding:8px 12px;color:#b45309;font-weight:600">⚠ Lưu ý khách</td><td style="border:1px solid #fcd34d;background:#fffbeb;padding:8px 12px;color:#b45309;font-weight:600">${ctHtml}</td></tr>` : ""}
      </table>
      ${i.monList.length > 0 ? `
      <p style="font-weight:600;margin:0 0 8px">Danh sách món:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:6px 12px;width:40px">#</th>
          <th style="border:1px solid #e2e8f0;padding:6px 12px;text-align:left">Tên món</th>
        </tr>
        ${monRows}
      </table>` : ""}
      ${i.ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${i.ghiChu}</div>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý nhà hàng xác nhận booking trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${i.senderName}</strong>${i.senderPhone ? `<br>${i.senderPhone}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}
