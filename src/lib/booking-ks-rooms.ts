export function getBookingRoomDates(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean))].sort();
}

export function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function splitRoomText(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => line.trim());
}

export function expandRoomValues(raw: string | null | undefined, dates: string[]): string[] {
  const count = Math.max(getBookingRoomDates(dates).length, 1);
  const parts = splitRoomText(raw);
  if (parts.length === 0) return Array(count).fill("");
  if (parts.length === 1) return Array(count).fill(parts[0]);
  return Array.from({ length: count }, (_, i) => parts[i] ?? "");
}

export function serializeRoomValues(values: string[]): string {
  const cleaned = values.map((v) => v.trim());
  const lastFilledIndex = cleaned.reduce((last, value, index) => value ? index : last, -1);
  const meaningful = lastFilledIndex >= 0 ? cleaned.slice(0, lastFilledIndex + 1) : [];
  if (meaningful.length === 0) return "";
  const first = meaningful[0];
  if (meaningful.every((value) => value === first)) return first;
  return meaningful.join("\n");
}

// Chuẩn hoá giá trị phòng để SO SÁNH gom đêm (KHÔNG dùng để hiển thị).
// Bỏ mọi khoảng trắng + viết hoa → "11 TWIN" và "11TWIN" coi là cùng loại phòng.
export function normalizeRoomValue(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export type NightGroup = { startDate: string; endDate: string; soDem: number; value: string };

// Gộp các đêm liên tiếp có cùng loại phòng (so theo normalizeRoomValue) → 1 block
// check-in/check-out. Đêm không liền nhau HOẶC khác loại phòng → tách block riêng.
// value của group GIỮ NGUYÊN chuỗi gốc của đêm đầu tiên (để hiển thị).
export function groupConsecutiveNights(dates: string[], values: string[]): NightGroup[] {
  const groups: NightGroup[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const value = values[i] ?? "";
    const last = groups[groups.length - 1];
    if (
      last &&
      normalizeRoomValue(last.value) === normalizeRoomValue(value) &&
      nextDateStr(last.endDate) === date
    ) {
      last.endDate = date;
      last.soDem += 1;
    } else {
      groups.push({ startDate: date, endDate: date, soDem: 1, value });
    }
  }
  return groups;
}

export function getRoomInfoForDate(
  raw: string | null | undefined,
  dates: string[],
  date: string
): string {
  const sortedDates = getBookingRoomDates(dates);
  const values = expandRoomValues(raw, sortedDates);
  const index = sortedDates.indexOf(date);
  return values[index >= 0 ? index : 0] || "";
}

export function getPreferredRoomInfoForDate(
  finalRaw: string | null | undefined,
  datTruocRaw: string | null | undefined,
  dates: string[],
  date: string
): string {
  return getRoomInfoForDate(finalRaw, dates, date) || getRoomInfoForDate(datTruocRaw, dates, date);
}
