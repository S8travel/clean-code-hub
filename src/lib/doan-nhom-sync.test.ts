import { describe, it, expect } from "vitest";
import { resolveNhom1SoKhach, type SoKhachBreakdown } from "./doan-nhom-sync";

const sk = (lon: number, em1 = 0, em2 = 0, tl = 0): SoKhachBreakdown => ({
  so_khach_lon: lon, so_khach_em1: em1, so_khach_em2: em2, so_khach_tl: tl,
});

describe("resolveNhom1SoKhach", () => {
  it("đoàn 1 nhóm → SET nhóm = đoàn (khớp drift cũ)", () => {
    // Drift cũ: nhóm 19, đoàn sửa thành 17NL+1TE50%=18 → nhóm phải = 17/1/0/0.
    expect(
      resolveNhom1SoKhach({ nhomCount: 1, nhom1: sk(19), doanOld: sk(19), doanNew: sk(17, 1) }),
    ).toEqual(sk(17, 1));
  });

  it("đoàn 1 nhóm: SET kể cả khi nhóm đang khớp", () => {
    expect(
      resolveNhom1SoKhach({ nhomCount: 1, nhom1: sk(18), doanOld: sk(18), doanNew: sk(20) }),
    ).toEqual(sk(20));
  });

  it("đoàn nhiều nhóm → dồn DELTA vào nhóm 1 (giữ tổng = đoàn)", () => {
    // Đoàn 30→32 (lon +2). Nhóm 1 đang 10 → 12. Nhóm khác giữ nguyên.
    expect(
      resolveNhom1SoKhach({ nhomCount: 2, nhom1: sk(10), doanOld: sk(30), doanNew: sk(32) }),
    ).toEqual(sk(12));
  });

  it("đoàn nhiều nhóm: delta âm, clamp không âm", () => {
    expect(
      resolveNhom1SoKhach({ nhomCount: 3, nhom1: sk(1), doanOld: sk(30), doanNew: sk(25) }),
    ).toEqual(sk(0)); // 1 + (25-30) = -4 → 0
  });

  it("đoàn nhiều nhóm: delta theo từng hạng khách", () => {
    expect(
      resolveNhom1SoKhach({
        nhomCount: 2,
        nhom1: sk(10, 2, 1, 1),
        doanOld: sk(20, 3, 1, 2),
        doanNew: sk(22, 2, 1, 2), // lon +2, em1 -1
      }),
    ).toEqual(sk(12, 1, 1, 1));
  });
});
