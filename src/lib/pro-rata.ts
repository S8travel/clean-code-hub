/**
 * Chia `total` thành N phần nguyên theo `weights[]`, đảm bảo tổng phần
 * = `total` (không bị rounding drift). Dùng largest-remainder method.
 *
 * Vấn đề khi mỗi row dùng Math.round độc lập:
 *   sum(round(x_i)) ≠ round(sum(x_i)) — N row rounding lệ thuộc, drift tích lũy.
 *
 * Cách dùng:
 *   const parts = proRataInts(15_000_000, allocs.map(a => Number(a.so_tien)));
 *   parts.forEach((amt, i) => allocs[i].so_tien = amt);
 *
 * Đặc tính:
 * - sum(parts) === Math.round(total) — guaranteed
 * - Nếu weights all 0 → chia đều, vẫn guarantee sum
 * - Hoạt động với total âm (dùng cho delta của adjustment)
 */
export function proRataInts(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  // Round total để guarantee integer sum
  const intTotal = Math.round(total);
  if (n === 1) return [intTotal];

  const sumW = weights.reduce((s, w) => s + w, 0);
  // Fallback: weights all 0 → equal split
  const useWeights = sumW === 0 ? new Array(n).fill(1) : weights;
  const useSumW   = sumW === 0 ? n : sumW;

  const exacts = useWeights.map((w) => (intTotal * w) / useSumW);
  // floor luôn cho remainder >= 0 (kể cả total âm: -333.33 → -334, remainder dương)
  const floors = exacts.map((e) => Math.floor(e));
  const sumFloors = floors.reduce((s, f) => s + f, 0);

  // remaining = số đơn vị +1 cần phân phối (luôn nguyên >= 0)
  let remaining = intTotal - sumFloors;

  // Sắp xếp indices theo phần dư fractional DESC → phân +1 cho top remaining items
  const indices = exacts
    .map((e, i) => ({ i, frac: e - floors[i] }))
    .sort((a, b) => b.frac - a.frac)
    .map((x) => x.i);

  const result = [...floors];
  for (let k = 0; k < remaining && k < n; k++) {
    result[indices[k]] += 1;
  }
  return result;
}
