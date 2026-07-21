import { sumCompanyChiPhi, type AggChiPhiRow } from "./aggregate-calc";

// Gộp các nhóm chi phí ĐƯỢC TRẢ CHUNG MỘT ĐNTT thành 1 "cụm cân đối".
//
// Vì sao cần: nhóm cân đối cũ = 1 dòng chính + các dòng phát sinh của nó. Nhưng
// tiền lại đi theo PHIẾU: 1 ĐNTT gộp có thể trả cho nhiều dòng chính (vd 3 loại vé
// cùng khu vui chơi). Khi OP sửa số lượng, mỗi dòng ra một chênh lệch riêng —
// dòng này thừa, dòng kia thiếu — nên footer hiện 2 nút ngược chiều dù thực tế
// chỉ cần netting 1 lần trên phiếu đó.
//
// Cụm = bao đóng của quan hệ "cùng nhóm cơ sở" ∪ "cùng một ĐNTT còn hiệu lực".
// ĐNTT đã hủy/từ chối KHÔNG kéo nhóm vào cụm (tiền của nó không còn hiệu lực).

/** 1 dòng chi phí + nhóm cơ sở của nó. */
export interface AggClusterRow extends AggChiPhiRow {
  id: number;
  /** Nhóm cơ sở: dòng chính = id của chính nó, dòng phát sinh = id dòng chính. */
  groupKey: number;
  so_tien_da_dntt?: number | null;
}

export interface AggClusterAlloc {
  dntt_id: number;
  chi_phi_id: number;
}

export interface AggCluster {
  /** groupKey nhỏ nhất trong cụm — định danh ổn định. */
  key: number;
  groupKeys: number[];
  rowIds: number[];
  /** ĐNTT còn hiệu lực đang phủ cụm này. */
  dnttIds: number[];
  sumActual: number;
  sumPaid: number;
  sumCommitted: number;
  /** groupKey CUỐI theo thứ tự hiển thị — nơi render dòng footer chênh lệch. */
  anchorGroupKey: number;
}

/** Union-find gọn cho số nhóm nhỏ (vài chục / đoàn). */
function makeFind(): { find: (x: number) => number; union: (a: number, b: number) => void } {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = parent.get(x) ?? x;
    if (root === x) { parent.set(x, x); return x; }
    root = find(root);
    parent.set(x, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    // Gốc = key nhỏ hơn → `key` của cụm ổn định, không phụ thuộc thứ tự union.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  return { find, union };
}

/**
 * Dựng các cụm cân đối, trả về map `groupKey → cụm` (nhiều groupKey trỏ CÙNG một
 * object cụm).
 *
 * - `liveDnttIds`: ĐNTT còn hiệu lực (đã lọc da_huy/tu_choi ở caller).
 * - `groupOrder`: groupKey theo đúng thứ tự hiển thị — quyết định `anchorGroupKey`
 *   (nhóm cuối cùng của cụm) để footer nằm dưới dòng cuối, không lơ lửng giữa bảng.
 */
export function buildAggClusters(input: {
  rows: AggClusterRow[];
  allocs: AggClusterAlloc[];
  liveDnttIds: Iterable<number>;
  groupOrder: number[];
}): Map<number, AggCluster> {
  const { rows, allocs, groupOrder } = input;
  const live = new Set(input.liveDnttIds);

  const groupOfRow = new Map<number, number>();
  for (const r of rows) groupOfRow.set(r.id, r.groupKey);

  const { find, union } = makeFind();
  for (const r of rows) find(r.groupKey);

  // Gộp các nhóm chia sẻ cùng 1 ĐNTT còn hiệu lực.
  const groupsOfDntt = new Map<number, number[]>();
  for (const a of allocs) {
    if (!live.has(a.dntt_id)) continue;
    const g = groupOfRow.get(a.chi_phi_id);
    if (g == null) continue;               // dòng thuộc section khác (NH/KS) → bỏ
    const list = groupsOfDntt.get(a.dntt_id) ?? [];
    list.push(g);
    groupsOfDntt.set(a.dntt_id, list);
  }
  for (const list of groupsOfDntt.values()) {
    for (let i = 1; i < list.length; i++) union(list[0], list[i]);
  }

  // Gom thành viên theo gốc.
  const members = new Map<number, { groupKeys: Set<number>; rows: AggClusterRow[]; dnttIds: Set<number> }>();
  const bucket = (root: number) => {
    let b = members.get(root);
    if (!b) { b = { groupKeys: new Set(), rows: [], dnttIds: new Set() }; members.set(root, b); }
    return b;
  };
  for (const r of rows) {
    const b = bucket(find(r.groupKey));
    b.groupKeys.add(r.groupKey);
    b.rows.push(r);
  }
  for (const [dnttId, list] of groupsOfDntt) {
    bucket(find(list[0])).dnttIds.add(dnttId);
  }

  // anchor = groupKey cuối cùng của cụm theo groupOrder (fallback: key của cụm).
  const anchorOf = new Map<number, number>();
  for (const g of groupOrder) {
    const root = find(g);
    if (members.has(root)) anchorOf.set(root, g);
  }

  const byGroupKey = new Map<number, AggCluster>();
  for (const [root, b] of members) {
    const { sumActual, sumPaid } = sumCompanyChiPhi(b.rows);
    const cluster: AggCluster = {
      key: root,
      groupKeys: [...b.groupKeys],
      rowIds: b.rows.map((r) => r.id),
      dnttIds: [...b.dnttIds],
      sumActual,
      sumPaid,
      sumCommitted: b.rows.reduce((s, r) => s + Number(r.so_tien_da_dntt ?? 0), 0),
      anchorGroupKey: anchorOf.get(root) ?? root,
    };
    for (const g of b.groupKeys) byGroupKey.set(g, cluster);
  }
  return byGroupKey;
}
