import { describe, it, expect } from "vitest";
import { buildAggClusters, type AggClusterRow } from "./agg-cluster";

const row = (
  id: number,
  groupKey: number,
  tien_cong_ty: number,
  so_tien_da_tt = 0,
  so_tien_da_dntt = 0,
  thanh_tien_thuc_te: number | null = null,
): AggClusterRow => ({ id, groupKey, tien_cong_ty, so_tien_da_tt, so_tien_da_dntt, thanh_tien_thuc_te });

describe("buildAggClusters", () => {
  // Ca thật: 3 loại vé Vinwonder trả chung 1 ĐNTT #2462 (19.215.000, đã trả đủ).
  // OP sửa vé lớn 28→27 (thừa 585k) và vé TE 2→3 (thiếu 405k) → net thừa 180k.
  it("3 dòng cùng 1 ĐNTT gộp → 1 cụm, chênh lệch netting về −180.000", () => {
    const rows = [
      row(12709, 12709, 15_795_000, 16_380_000, 16_380_000),
      row(12713, 12713, 2_025_000, 2_025_000, 2_025_000),
      row(12714, 12714, 1_215_000, 810_000, 810_000),
    ];
    const allocs = [
      { dntt_id: 2462, chi_phi_id: 12709 },
      { dntt_id: 2462, chi_phi_id: 12713 },
      { dntt_id: 2462, chi_phi_id: 12714 },
    ];
    const clusters = buildAggClusters({
      rows, allocs, liveDnttIds: [2462], groupOrder: [12709, 12713, 12714],
    });
    const c = clusters.get(12709)!;
    expect(clusters.get(12713)).toBe(c);          // cùng 1 object cụm
    expect(clusters.get(12714)).toBe(c);
    expect(c.groupKeys.sort()).toEqual([12709, 12713, 12714]);
    expect(c.dnttIds).toEqual([2462]);
    expect(c.sumActual).toBe(19_035_000);
    expect(c.sumPaid).toBe(19_215_000);
    expect(c.sumActual - c.sumPaid).toBe(-180_000);
    expect(c.anchorGroupKey).toBe(12714);         // footer nằm dưới dòng cuối
  });

  it("dòng phát sinh gộp vào nhóm chính qua groupKey", () => {
    const rows = [row(1, 1, 1_000_000, 1_000_000, 1_000_000), row(2, 1, 200_000)];
    const clusters = buildAggClusters({ rows, allocs: [], liveDnttIds: [], groupOrder: [1] });
    const c = clusters.get(1)!;
    expect(c.rowIds.sort()).toEqual([1, 2]);
    expect(c.sumActual).toBe(1_200_000);
    expect(c.sumPaid).toBe(1_000_000);
  });

  it("2 ĐNTT khác nhau → 2 cụm riêng (không gộp nhầm)", () => {
    const rows = [row(1, 1, 500_000, 500_000, 500_000), row(2, 2, 700_000, 700_000, 700_000)];
    const allocs = [
      { dntt_id: 10, chi_phi_id: 1 },
      { dntt_id: 20, chi_phi_id: 2 },
    ];
    const clusters = buildAggClusters({ rows, allocs, liveDnttIds: [10, 20], groupOrder: [1, 2] });
    expect(clusters.get(1)).not.toBe(clusters.get(2));
    expect(clusters.get(1)!.dnttIds).toEqual([10]);
    expect(clusters.get(2)!.dnttIds).toEqual([20]);
  });

  it("ĐNTT đã hủy KHÔNG kéo 2 nhóm vào chung cụm", () => {
    const rows = [row(1, 1, 500_000), row(2, 2, 700_000)];
    const allocs = [
      { dntt_id: 99, chi_phi_id: 1 },
      { dntt_id: 99, chi_phi_id: 2 },
    ];
    const clusters = buildAggClusters({ rows, allocs, liveDnttIds: [], groupOrder: [1, 2] });
    expect(clusters.get(1)).not.toBe(clusters.get(2));
    expect(clusters.get(1)!.dnttIds).toEqual([]);
  });

  it("2 ĐNTT phủ chồng nhau → gộp bắc cầu thành 1 cụm", () => {
    // ĐNTT A phủ dòng 1+2, ĐNTT B phủ dòng 2+3 → cả 3 cùng cụm
    const rows = [row(1, 1, 100_000), row(2, 2, 200_000), row(3, 3, 300_000)];
    const allocs = [
      { dntt_id: 10, chi_phi_id: 1 },
      { dntt_id: 10, chi_phi_id: 2 },
      { dntt_id: 20, chi_phi_id: 2 },
      { dntt_id: 20, chi_phi_id: 3 },
    ];
    const clusters = buildAggClusters({ rows, allocs, liveDnttIds: [10, 20], groupOrder: [1, 2, 3] });
    const c = clusters.get(1)!;
    expect(clusters.get(3)).toBe(c);
    expect(c.dnttIds.sort((a, b) => a - b)).toEqual([10, 20]);
    expect(c.sumActual).toBe(600_000);
    expect(c.anchorGroupKey).toBe(3);
  });

  it("key cụm không đổi theo thứ tự alloc", () => {
    const rows = [row(5, 5, 100_000), row(9, 9, 100_000)];
    const a = buildAggClusters({
      rows, allocs: [{ dntt_id: 1, chi_phi_id: 9 }, { dntt_id: 1, chi_phi_id: 5 }],
      liveDnttIds: [1], groupOrder: [5, 9],
    });
    const b = buildAggClusters({
      rows, allocs: [{ dntt_id: 1, chi_phi_id: 5 }, { dntt_id: 1, chi_phi_id: 9 }],
      liveDnttIds: [1], groupOrder: [5, 9],
    });
    expect(a.get(5)!.key).toBe(5);
    expect(b.get(9)!.key).toBe(5);
  });

  it("dòng HDV trả (tien_cong_ty = 0) không vào sumActual, nhưng đã trả vẫn tính", () => {
    const rows = [row(1, 1, 0, 300_000), row(2, 1, 500_000, 500_000)];
    const c = buildAggClusters({ rows, allocs: [], liveDnttIds: [], groupOrder: [1] }).get(1)!;
    expect(c.sumActual).toBe(500_000);
    expect(c.sumPaid).toBe(800_000);
  });

  it("thanh_tien_thuc_te override tien_cong_ty khi tính thực tế", () => {
    const rows = [row(1, 1, 1_000_000, 1_000_000, 1_000_000, 900_000)];
    const c = buildAggClusters({ rows, allocs: [], liveDnttIds: [], groupOrder: [1] }).get(1)!;
    expect(c.sumActual).toBe(900_000);
  });

  it("alloc trỏ dòng ngoài danh sách (section khác) → bỏ qua, không nổ", () => {
    const rows = [row(1, 1, 100_000)];
    const allocs = [{ dntt_id: 7, chi_phi_id: 1 }, { dntt_id: 7, chi_phi_id: 999 }];
    const c = buildAggClusters({ rows, allocs, liveDnttIds: [7], groupOrder: [1] }).get(1)!;
    expect(c.rowIds).toEqual([1]);
    expect(c.dnttIds).toEqual([7]);
  });

  it("groupOrder thiếu nhóm → anchor fallback về key cụm", () => {
    const rows = [row(4, 4, 100_000)];
    const c = buildAggClusters({ rows, allocs: [], liveDnttIds: [], groupOrder: [] }).get(4)!;
    expect(c.anchorGroupKey).toBe(4);
  });
});
