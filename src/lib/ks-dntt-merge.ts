import { nextDateStr, normalizeRoomValue } from "./booking-ks-rooms";

// Gộp các đêm KS LIÊN TIẾP có cùng cơ cấu phòng cho bản in ĐNTT (giống booking).
// "Cùng cơ cấu" = cùng loại phòng (name) + số lượng + đơn giá + foc_count.
// Đêm không liền nhau / khác cơ cấu / không có ngày → giữ riêng.
// Tổng tiền KHÔNG đổi (chỉ gộp dòng): thành tiền mỗi dòng = đơn giá × (SL−FOC) × so_dem.

export interface KSRoomNight {
  name: string;
  so_luong: number;
  don_gia: number;
  foc_count: number;
  so_dem: number; // số đêm của entry (thường 1 cho mỗi doan_ngay)
  ngayDate: string; // ISO yyyy-mm-dd, check-in. "" = không xác định ngày.
}

export type KSRoomMerged = KSRoomNight; // ngayDate=check-in sớm nhất, so_dem=tổng đêm gộp

/** Cộng n ngày vào chuỗi ISO (dùng nextDateStr để chuẩn với phần booking). */
export function addDaysIso(iso: string, n: number): string {
  let d = iso;
  for (let i = 0; i < Math.max(0, n); i++) d = nextDateStr(d);
  return d;
}

function roomKey(n: KSRoomNight): string {
  // normalizeRoomValue: bỏ khoảng trắng + viết hoa → "TWIN/DBL/SGL " và "TWIN/DBL/SGL"
  // (OP gõ lệch dấu cách giữa các đêm) coi là CÙNG loại phòng → gộp được.
  return [normalizeRoomValue(n.name), n.so_luong, n.don_gia, n.foc_count].join("|");
}

export function mergeConsecutiveKSNights(nights: KSRoomNight[]): KSRoomMerged[] {
  // Gom theo cơ cấu phòng (các đêm cùng phòng có thể nằm xen kẽ giữa các phòng khác).
  const byRoom = new Map<string, KSRoomNight[]>();
  for (const n of nights) {
    const k = roomKey(n);
    if (!byRoom.has(k)) byRoom.set(k, []);
    byRoom.get(k)!.push(n);
  }

  const merged: KSRoomMerged[] = [];
  for (const list of byRoom.values()) {
    // Sort theo ngày (ngày rỗng xuống cuối) để dò chuỗi liền nhau.
    const sorted = [...list].sort((a, b) => {
      const da = a.ngayDate || "9999-99-99";
      const db = b.ngayDate || "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    let cur: KSRoomMerged | null = null;
    for (const n of sorted) {
      const consecutive =
        cur && cur.ngayDate !== "" && n.ngayDate !== "" &&
        addDaysIso(cur.ngayDate, cur.so_dem) === n.ngayDate;
      if (consecutive) {
        cur!.so_dem += n.so_dem;
      } else {
        cur = { ...n };
        merged.push(cur);
      }
    }
  }

  // Thứ tự hiển thị: theo ngày check-in rồi tên phòng (ngày rỗng xuống cuối).
  merged.sort((a, b) => {
    const da = a.ngayDate || "9999-99-99";
    const db = b.ngayDate || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return merged;
}
