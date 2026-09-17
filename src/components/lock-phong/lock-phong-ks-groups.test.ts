import { describe, it, expect } from "vitest";
import { buildKSGroups, seriGroupKey } from "./lock-phong-ks-groups";
import type { LockPhongDisplay, LockPhongKSDisplay } from "@/hooks/use-lock-phong";

function ksRow(over: Partial<LockPhongKSDisplay> = {}): LockPhongKSDisplay {
  return {
    id: 1,
    lock_phong_id: 1,
    khach_san_id: 19,
    check_in: "2027-01-04",
    check_out: "2027-01-05",
    so_phong: "14TWN+2DBL",
    tinh_trang_phong: null,
    code_ncc: null,
    outcome_status: null,
    code_doan_thanh: null,
    ghi_chu: null,
    email_status: "chua_gui",
    email_sent_at: null,
    email_sent_by: null,
    email_confirm_at: null,
    email_thread_id: null,
    created_at: "2026-09-17T00:00:00Z",
    mail_content_hash: null,
    khach_san_ten: "Khách sạn Demo",
    khach_san_email: "ks@demo.test",
    khach_san_dia_diem: "Hà Nội",
    so_dem: 1,
    ...over,
  };
}

function lock(
  over: Partial<LockPhongDisplay>,
  hotels: Partial<LockPhongKSDisplay>[],
): LockPhongDisplay {
  return {
    id: 1,
    ten_seri: "Seri A",
    seri_id: null,
    ten_doan: "DEMO001",
    ngay_xuat_phat: "2027-01-01",
    deadline: null,
    ghi_chu: null,
    created_by: null,
    created_at: "2026-09-17T00:00:00Z",
    ...over,
    hotels: hotels.map((h) => ksRow(h)),
  };
}

describe("seriGroupKey", () => {
  it("bỏ khoảng trắng thừa và không phân biệt hoa/thường", () => {
    expect(seriGroupKey("Seri A ( du thuyen X ) ")).toBe(seriGroupKey("SERI A ( DU THUYEN X )"));
    expect(seriGroupKey("  Seri   A ")).toBe("seri a");
  });

  it("không có tên seri → khoá rỗng", () => {
    expect(seriGroupKey(null)).toBe("");
    expect(seriGroupKey("   ")).toBe("");
  });
});

describe("buildKSGroups", () => {
  it("cùng khách sạn nhưng KHÁC seri → tách thành 2 thẻ riêng", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_seri: "Seri A", ten_doan: "A001" }, [{ id: 1, check_in: "2027-01-04", check_out: "2027-01-05" }]),
      lock({ id: 2, ten_seri: "Seri B", ten_doan: "B001" }, [{ id: 2, check_in: "2027-02-04", check_out: "2027-02-05" }]),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.ten_seri)).toEqual(["Seri A", "Seri B"]);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[0].groupKey).not.toBe(groups[1].groupKey);
  });

  it("cùng seri gõ lệch hoa/thường/khoảng trắng → vẫn về một thẻ", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_seri: "Seri A ( du thuyen X ) ", ten_doan: "D001" }, [{ id: 1 }]),
      lock({ id: 2, ten_seri: "SERI A ( DU THUYEN X )", ten_doan: "D002" }, [{ id: 2, check_in: "2027-01-10", check_out: "2027-01-11" }]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it("khác khách sạn thì tách, kể cả cùng seri", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_doan: "A001" }, [{ id: 1, khach_san_id: 19, khach_san_ten: "KS A" }]),
      lock({ id: 2, ten_doan: "A002" }, [{ id: 2, khach_san_id: 20, khach_san_ten: "KS B" }]),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.khach_san_ten)).toEqual(["KS A", "KS B"]);
  });

  it("cùng code đoàn ở 2 bản ghi lock khác nhau → gộp về 1 dòng, xếp theo ngày ở", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_doan: "A001" }, [{ id: 1, check_in: "2027-01-20", check_out: "2027-01-21" }]),
      lock({ id: 2, ten_doan: "A001" }, [{ id: 2, check_in: "2027-01-04", check_out: "2027-01-05" }]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].entries[0].ksRows.map((r) => r.check_in)).toEqual(["2027-01-04", "2027-01-20"]);
  });

  it("seri chưa đặt tên vẫn thành thẻ riêng, nhãn để trống cho UI tự hiển thị", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_seri: "", ten_doan: "X001" }, [{ id: 1 }]),
      lock({ id: 2, ten_seri: "Seri A", ten_doan: "A001" }, [{ id: 2, check_in: "2027-03-04", check_out: "2027-03-05" }]),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.ten_seri === "")).toBeDefined();
  });

  it("xếp theo tên khách sạn, cùng khách sạn thì seri có đoàn đi sớm nhất lên trước", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_seri: "Seri muộn", ten_doan: "M001" }, [{ id: 1, check_in: "2027-05-01", check_out: "2027-05-02" }]),
      lock({ id: 2, ten_seri: "Seri sớm", ten_doan: "S001" }, [{ id: 2, check_in: "2027-01-04", check_out: "2027-01-05" }]),
    ]);
    expect(groups.map((g) => g.ten_seri)).toEqual(["Seri sớm", "Seri muộn"]);
  });

  it("đoàn trong thẻ xếp theo ngày ở tăng dần", () => {
    const groups = buildKSGroups([
      lock({ id: 1, ten_doan: "A003" }, [{ id: 1, check_in: "2027-03-01", check_out: "2027-03-02" }]),
      lock({ id: 2, ten_doan: "A001" }, [{ id: 2, check_in: "2027-01-01", check_out: "2027-01-02" }]),
      lock({ id: 3, ten_doan: "A002" }, [{ id: 3, check_in: "2027-02-01", check_out: "2027-02-02" }]),
    ]);
    expect(groups[0].entries.map((e) => e.lockPhong.ten_doan)).toEqual(["A001", "A002", "A003"]);
  });
});
