import { describe, it, expect } from "vitest";
import {
  nhDeadlineTypes, deadlineGroup, mergeMyDeadlines, countDeadlineCanXuLy,
  isDoanDaVe, conDangNhac, ngayHomNay,
  type DeadlineItem,
} from "./use-my-job";

// Dựng "YYYY-MM-DD" theo giờ ĐỊA PHƯƠNG. KHÔNG dùng toISOString(): nó quy về UTC nên
// nửa đêm giờ VN (UTC+7) ra ngày hôm trước → lệch 1 ngày, test đo sai biên "week/later".
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const dl = (p: Partial<DeadlineItem> = {}): DeadlineItem => ({
  type: "ks", rpcType: "ks", bookingId: 1, doanId: 10,
  doanName: "D1", label: "KS A", deadline: iso(0), status: "da_gui",
  ...p,
});

// Bug: deadline tàu ngày (du thuyền) hiển thị icon "KS" nhưng lưu ở
// doan_booking_nh. Nút "Đã xong" route mark_deadline_done theo rpcType — nếu
// dùng type hiển thị ("ks") sẽ UPDATE nhầm doan_booking_ks → 0 rows → lỗi.
describe("nhDeadlineTypes", () => {
  it("tàu ngày: hiển thị KS nhưng route về bảng nh", () => {
    expect(nhDeadlineTypes("tau_ngay")).toEqual({ type: "ks", rpcType: "nh" });
  });

  it("nhà hàng thường: hiển thị NH, route nh", () => {
    expect(nhDeadlineTypes("nha_hang")).toEqual({ type: "nh", rpcType: "nh" });
  });

  it("loai null/undefined: mặc định NH", () => {
    expect(nhDeadlineTypes(null)).toEqual({ type: "nh", rpcType: "nh" });
    expect(nhDeadlineTypes(undefined)).toEqual({ type: "nh", rpcType: "nh" });
  });

  it("rpcType LUÔN là 'nh' bất kể loai (chống regression route nhầm)", () => {
    for (const loai of ["tau_ngay", "tau_dem", "nha_hang", "buffet", ""]) {
      expect(nhDeadlineTypes(loai).rpcType).toBe("nh");
    }
  });
});

describe("deadlineGroup", () => {
  it("phân nhóm theo độ gấp", () => {
    expect(deadlineGroup(iso(-1))).toBe("overdue");
    expect(deadlineGroup(iso(0))).toBe("today");
    expect(deadlineGroup(iso(3))).toBe("week");
    expect(deadlineGroup(iso(7))).toBe("week");
    expect(deadlineGroup(iso(8))).toBe("later");
  });
});

// Badge sidebar + tab Deadline PHẢI ra cùng một số → dùng chung 2 hàm dưới đây.
// Bug 22/07/2026: badge đọc số thông báo chưa đọc (105) trong khi tab đếm việc thật
// (47+17) → OP xử lý xong hết mà badge vẫn đứng nguyên.
describe("mergeMyDeadlines — hợp nhất phân việc + booking mình gửi", () => {
  const scope = new Map<number, Set<"ks" | "nh" | "dv">>([[10, new Set<"ks" | "nh" | "dv">(["ks"])]]);

  it("chỉ nhận deadline phân việc ĐÚNG scope được giao", () => {
    const out = mergeMyDeadlines(
      [dl({ bookingId: 1, type: "ks", rpcType: "ks" }), dl({ bookingId: 2, type: "nh", rpcType: "nh" })],
      scope,
      [],
    );
    expect(out.map((d) => d.bookingId)).toEqual([1]);
  });

  it("booking mình tự gửi luôn được nhận, kể cả ngoài scope phân việc", () => {
    expect(mergeMyDeadlines([], scope, [dl({ bookingId: 9, type: "dv", rpcType: "dv" })])).toHaveLength(1);
  });

  it("trùng cả 2 nguồn → chỉ hiện 1 lần", () => {
    const same = dl({ bookingId: 5 });
    expect(mergeMyDeadlines([same], scope, [same])).toHaveLength(1);
  });

  it("KHÔNG gộp nhầm tàu ngày với khách sạn khi trùng id", () => {
    // Tàu ngày lưu ở bảng nh (rpcType 'nh') nhưng hiện icon ks → dedupe theo `type`
    // sẽ nuốt mất 1 dòng vì id 7 trùng nhau ở 2 bảng khác nhau.
    const ks = dl({ bookingId: 7, type: "ks", rpcType: "ks" });
    const tau = dl({ bookingId: 7, type: "ks", rpcType: "nh" });
    expect(mergeMyDeadlines([], scope, [ks, tau])).toHaveLength(2);
  });

  it("scope undefined (chưa tải xong) → không nhận nhầm việc của người khác", () => {
    expect(mergeMyDeadlines([dl()], undefined, [])).toHaveLength(0);
  });

  it("sắp xếp theo deadline tăng dần", () => {
    const out = mergeMyDeadlines([], scope, [
      dl({ bookingId: 1, deadline: iso(5) }),
      dl({ bookingId: 2, deadline: iso(1) }),
    ]);
    expect(out.map((d) => d.bookingId)).toEqual([2, 1]);
  });
});

describe("countDeadlineCanXuLy — số khớp badge sidebar và tab", () => {
  it("đếm mọi nhóm TRỪ 'later'", () => {
    expect(countDeadlineCanXuLy([
      dl({ bookingId: 1, deadline: iso(-2) }), // overdue
      dl({ bookingId: 2, deadline: iso(0) }),  // today
      dl({ bookingId: 3, deadline: iso(4) }),  // week
      dl({ bookingId: 4, deadline: iso(30) }), // later → không đếm
    ])).toBe(3);
  });

  it("rỗng → 0", () => {
    expect(countDeadlineCanXuLy([])).toBe(0);
  });
});

// Đoàn đã về thì booking hết ý nghĩa: không còn gì để đuổi NCC. Trước đây chỉ lọc
// đoàn huỷ nên deadline của đoàn đi xong từ lâu nằm lì ở nhóm "quá hạn", OP không
// xử lý được cũng không tắt được → nhờn cảnh báo.
describe("isDoanDaVe / conDangNhac — ngừng nhắc đoàn đã về", () => {
  const row = (ngay_ve: string | null, trang_thai = "dang_chay") =>
    ({ doan: { ten_doan: "D1", trang_thai, ngay_ve } });

  it("đoàn về hôm qua → thôi nhắc", () => {
    expect(isDoanDaVe(row(iso(-1)))).toBe(true);
    expect(conDangNhac(row(iso(-1)))).toBe(false);
  });

  it("đoàn về HÔM NAY vẫn nhắc — chưa kết thúc hẳn", () => {
    expect(isDoanDaVe(row(iso(0)))).toBe(false);
    expect(conDangNhac(row(iso(0)))).toBe(true);
  });

  it("đoàn còn chạy / sắp đi → nhắc bình thường", () => {
    expect(conDangNhac(row(iso(3)))).toBe(true);
  });

  it("ngay_ve rỗng → KHÔNG đoán, giữ nguyên hành vi cũ là vẫn nhắc", () => {
    expect(isDoanDaVe(row(null))).toBe(false);
    expect(conDangNhac(row(null))).toBe(true);
    expect(conDangNhac({ doan: { ten_doan: "D", trang_thai: "dang_chay" } })).toBe(true);
  });

  it("join doan rỗng (FK hỏng) → vẫn nhắc, không nuốt mất việc", () => {
    expect(conDangNhac({ doan: null })).toBe(true);
  });

  it("đoàn huỷ vẫn bị loại như trước, kể cả chưa tới ngày về", () => {
    expect(conDangNhac(row(iso(5), "huy"))).toBe(false);
  });

  it("đoàn vừa huỷ vừa đã về → loại", () => {
    expect(conDangNhac(row(iso(-30), "huy"))).toBe(false);
  });

  it("ngayHomNay theo giờ máy, không lệch ngày do UTC", () => {
    // 31/12 lúc 23h VN: toISOString() sẽ ra 2026-12-31T16:00Z → đúng ngày, nhưng
    // 01/01 lúc 06h thì toISOString() ra 31/12. Hàm này luôn bám giờ địa phương.
    expect(ngayHomNay(new Date(2027, 0, 1, 6, 0, 0))).toBe("2027-01-01");
    expect(ngayHomNay(new Date(2026, 11, 31, 23, 30, 0))).toBe("2026-12-31");
  });
});
