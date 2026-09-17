// Gom dữ liệu lock phòng thành thẻ hiển thị ở view "Theo KS".
//
// Gom theo (KHÁCH SẠN + SERI), KHÔNG phải theo mình khách sạn: một khách sạn
// thường nhận nhiều seri chạy song song (seri cũ đã xong, seri mới vừa lock).
// Gộp chung một thẻ thì nút "Gửi gộp" / "Gửi riêng" / "Xác nhận all" quét luôn
// sang seri khác — bắn mail nhầm cả loạt.
//
// Trong cùng một seri, các stay cùng CODE ĐOÀN vẫn gộp về một dòng (đoàn ở 2
// chặng rời nhau tại cùng khách sạn), kể cả khi được tạo ở 2 bản ghi lock_phong
// khác nhau.

import type { LockPhongDisplay, LockPhongKSDisplay } from "@/hooks/use-lock-phong";

export interface MergedEntry {
  lockPhong: LockPhongDisplay;
  ksRows: LockPhongKSDisplay[]; // 1 hoặc nhiều stay của cùng đoàn ở cùng KS
}

export interface KSGroup {
  /** Định danh thẻ trên UI (mở/thu, phân trang, spinner) — KS + seri. */
  groupKey: string;
  khach_san_id: number;
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_diem: string | null;
  /** Nhãn seri để hiện — lấy đúng bản OP đã gõ (gặp đầu tiên). "" = chưa đặt tên. */
  ten_seri: string;
  entries: MergedEntry[];
}

/**
 * Khoá gom seri: cắt khoảng trắng thừa + bỏ phân biệt hoa/thường.
 * Tên seri là free text OP gõ tay nên cùng một seri hay ra nhiều biến thể
 * ("Seri A ( du thuyen X ) " vs "SERI A ( DU THUYEN X )") — so thô sẽ
 * tách thành 2 thẻ trong khi thực tế là một.
 */
export function seriGroupKey(tenSeri: string | null | undefined): string {
  return (tenSeri ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildKSGroups(data: LockPhongDisplay[]): KSGroup[] {
  const groupMap = new Map<string, {
    groupKey: string;
    khach_san_id: number;
    khach_san_ten: string;
    khach_san_email: string | null;
    khach_san_dia_diem: string | null;
    ten_seri: string;
    mergedMap: Map<string, MergedEntry>;
  }>();

  for (const lp of data) {
    for (const ks of lp.hotels) {
      const sKey = seriGroupKey(lp.ten_seri);
      const groupKey = `${ks.khach_san_id}::${sKey}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          khach_san_id: ks.khach_san_id,
          khach_san_ten: ks.khach_san_ten,
          khach_san_email: ks.khach_san_email,
          khach_san_dia_diem: ks.khach_san_dia_diem,
          ten_seri: (lp.ten_seri ?? "").trim(),
          mergedMap: new Map(),
        });
      }
      const grp = groupMap.get(groupKey)!;
      // Key gộp dùng code đoàn → 2 stay cùng code (dù khác lock_phong_id) về 1 dòng.
      const entryKey = `${groupKey}::${lp.ten_doan}`;
      if (!grp.mergedMap.has(entryKey)) {
        grp.mergedMap.set(entryKey, { lockPhong: lp, ksRows: [] });
      }
      grp.mergedMap.get(entryKey)!.ksRows.push(ks);
    }
  }

  return Array.from(groupMap.values())
    .map((g) => {
      const entries: MergedEntry[] = Array.from(g.mergedMap.values())
        .map((m) => ({
          lockPhong: m.lockPhong,
          ksRows: [...m.ksRows].sort((a, b) => a.check_in.localeCompare(b.check_in)),
        }))
        .sort((a, b) => a.ksRows[0].check_in.localeCompare(b.ksRows[0].check_in));
      return {
        groupKey: g.groupKey,
        khach_san_id: g.khach_san_id,
        khach_san_ten: g.khach_san_ten,
        khach_san_email: g.khach_san_email,
        khach_san_dia_diem: g.khach_san_dia_diem,
        ten_seri: g.ten_seri,
        entries,
      };
    })
    .sort((a, b) => {
      const byTen = a.khach_san_ten.localeCompare(b.khach_san_ten);
      if (byTen !== 0) return byTen;
      // Cùng khách sạn: seri có đoàn đi sớm nhất lên trước (seri cũ → seri mới).
      return a.entries[0].ksRows[0].check_in.localeCompare(b.entries[0].ksRows[0].check_in);
    });
}
