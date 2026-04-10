import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { HDVRow } from "@/hooks/use-hdv";

export interface TourInput {
  doan_id?: number;           // undefined nếu nhập tay
  ten_doan: string;
  ngay_di: string;            // "YYYY-MM-DD"
  ngay_ve: string;
  chuyen_bay_don: string | null;
  chuyen_bay_tien: string | null;
  agent_id: number | null;
  dia_diem_id: number | null;
  dia_diem_ten?: string;
  agent_ten?: string;
  // kết quả xếp
  assigned_hdv_id: number | null;
  locked_hdv_id: number | null;  // HDV đã chỉ định trước (từ DB hoặc Excel)
  _hard_locked?: boolean;        // true = không cho thuật toán thay đổi (khi tái xếp)
  _prev_hdv_id?: number | null;  // HDV trước khi xếp lại (để đánh dấu thay đổi)
  is_chained?: boolean;
}

// Fetch đoàn theo khoảng ngày để chọn vào bộ xếp
export function useDoanForXep(filter: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ["doan-for-xep", filter],
    enabled: !!filter,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan")
        .select("id, ten_doan, ngay_di, ngay_ve, chuyen_bay_don, chuyen_bay_tien, agent_id, dia_diem_id, huong_dan_vien_id, dia_diem:dia_diem_id(ten), agents:agent_id(ten)")
        .gte("ngay_di", filter!.from)
        .lte("ngay_di", filter!.to)
        .order("ngay_di");
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        doan_id: d.id,
        ten_doan: d.ten_doan,
        ngay_di: d.ngay_di,
        ngay_ve: d.ngay_ve,
        chuyen_bay_don: d.chuyen_bay_don,
        chuyen_bay_tien: d.chuyen_bay_tien,
        agent_id: d.agent_id,
        dia_diem_id: d.dia_diem_id,
        dia_diem_ten: d.dia_diem?.ten ?? null,
        agent_ten: d.agents?.ten ?? null,
        assigned_hdv_id: d.huong_dan_vien_id ?? null,
        locked_hdv_id: d.huong_dan_vien_id ?? null,
        is_chained: false,
        _has_hdv: !!d.huong_dan_vien_id,
      } as TourInput & { _has_hdv: boolean }));
    },
  });
}

// Batch save kết quả xếp vào DB
export function useSaveHDVAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignments: { doan_id: number; hdv_id: number | null }[]) => {
      await Promise.all(
        assignments.map(({ doan_id, hdv_id }) =>
          externalSupabase
            .from("doan")
            .update({ huong_dan_vien_id: hdv_id })
            .eq("id", doan_id)
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      qc.invalidateQueries({ queryKey: ["doan-for-xep"] });
    },
  });
}

// ─── Thuật toán xếp HDV (pure function) ───────────────────────────

function toursOverlap(a: TourInput, b: TourInput): boolean {
  return !(a.ngay_ve < b.ngay_di || a.ngay_di > b.ngay_ve);
}

export function assignHDVs(tours: TourInput[], hdvs: HDVRow[]): TourInput[] {
  const activeHdvs = hdvs.filter((h) => h.active);
  if (activeHdvs.length === 0 || tours.length === 0) return tours;

  const sorted = [...tours].map((t) => ({ ...t, is_chained: false }));
  sorted.sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));

  const hdvSchedule = new Map<number, TourInput[]>();
  activeHdvs.forEach((h) => hdvSchedule.set(h.id, []));

  // Pass 1: nạp hard-locked tours vào schedule, không xếp lại
  for (const tour of sorted) {
    if (tour._hard_locked && tour.assigned_hdv_id !== null) {
      const sched = hdvSchedule.get(tour.assigned_hdv_id);
      if (sched) sched.push(tour);
    }
  }

  // Agent: tour có agent → HDV phải được tích agent đó; tour không có agent → tất cả đều pass
  function passesAgent(hdv: HDVRow, tour: TourInput): boolean {
    if (!tour.agent_id) return true;
    return (hdv.agent_ids ?? []).includes(tour.agent_id);
  }

  // Địa điểm: tour có địa điểm → HDV phải được tích địa điểm đó; tour không có → tất cả đều pass
  function passesLocation(hdv: HDVRow, tour: TourInput): boolean {
    if (!tour.dia_diem_id) return true;
    return (hdv.dia_diem_ids ?? []).includes(tour.dia_diem_id);
  }

  function scoreCandidates(pool: HDVRow[], tour: TourInput) {
    let bestHdvId: number | null = null;
    let bestScore = -Infinity;
    let bestIsChained = false;

    for (const hdv of pool) {
      const assigned = hdvSchedule.get(hdv.id) ?? [];
      if (assigned.some((t) => toursOverlap(t, tour))) continue;

      let score = 0;

      // Địa điểm khớp → bonus
      if (tour.dia_diem_id && (hdv.dia_diem_ids ?? []).includes(tour.dia_diem_id)) score += 2;

      // Ghép chuyến liên tiếp
      const lastTour = assigned[assigned.length - 1];
      const isChained = !!lastTour && lastTour.ngay_ve === tour.ngay_di;
      if (isChained) score += 3;

      // Cân bằng tải
      score += Math.max(0, 5 - assigned.length);

      // Stability: ưu tiên giữ HDV cũ
      if (tour.locked_hdv_id !== null && hdv.id === tour.locked_hdv_id) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestHdvId = hdv.id;
        bestIsChained = isChained;
      }
    }

    return { bestHdvId, bestIsChained };
  }

  // Pass 2: xếp các tour không bị hard-lock
  for (const tour of sorted) {
    if (tour._hard_locked) continue;

    tour.assigned_hdv_id = null;
    tour.is_chained = false;

    // Lọc cứng: agent VÀ địa điểm đều phải pass
    const eligible = activeHdvs.filter((h) => passesAgent(h, tour) && passesLocation(h, tour));

    // Xếp theo từng bậc (1 → 5), dừng lại khi tìm được HDV
    let res = { bestHdvId: null as number | null, bestIsChained: false };
    for (let bac = 1; bac <= 5; bac++) {
      const pool = eligible.filter((h) => (h.bac ?? 3) === bac);
      if (pool.length === 0) continue;
      res = scoreCandidates(pool, tour);
      if (res.bestHdvId !== null) break;
    }

    tour.assigned_hdv_id = res.bestHdvId;
    tour.is_chained = res.bestIsChained;
    if (res.bestHdvId !== null) hdvSchedule.get(res.bestHdvId)!.push(tour);
  }

  return sorted;
}
