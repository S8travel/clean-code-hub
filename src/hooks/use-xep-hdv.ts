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
  // overlap nếu không phải a kết thúc trước b bắt đầu, và không phải b kết thúc trước a bắt đầu
  return !(a.ngay_ve < b.ngay_di || a.ngay_di > b.ngay_ve);
}

export function assignHDVs(tours: TourInput[], hdvs: HDVRow[]): TourInput[] {
  const activeHdvs = hdvs.filter((h) => h.active);
  if (activeHdvs.length === 0 || tours.length === 0) return tours;

  // Sort theo ngày đi tăng dần
  const sorted = [...tours].map((t) => ({ ...t, assigned_hdv_id: null as number | null, is_chained: false }));
  sorted.sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));

  // Lịch của từng HDV: hdvSchedule[hdv.id] = list tour đã gán (theo thứ tự thời gian)
  const hdvSchedule = new Map<number, TourInput[]>();
  activeHdvs.forEach((h) => hdvSchedule.set(h.id, []));

  for (const tour of sorted) {
    let bestHdvId: number | null = null;
    let bestScore = -Infinity;
    let bestIsChained = false;

    for (const hdv of activeHdvs) {
      const assigned = hdvSchedule.get(hdv.id) ?? [];

      // Kiểm tra không overlap với bất kỳ tour đã gán
      const hasConflict = assigned.some((t) => toursOverlap(t, tour));
      if (hasConflict) continue;

      let score = 0;

      // Location match
      if (tour.dia_diem_id && (hdv.dia_diem_ids ?? []).includes(tour.dia_diem_id)) {
        score += 2;
      }

      // Agent match
      if (tour.agent_id && (hdv.agent_ids ?? []).includes(tour.agent_id)) {
        score += 2;
      }

      // Chain bonus: tour cuối cùng của HDV kết thúc đúng ngày tour này bắt đầu
      const lastTour = assigned[assigned.length - 1];
      const isChained = !!lastTour && lastTour.ngay_ve === tour.ngay_di;
      if (isChained) score += 3;

      // Load balance: HDV ít đoàn hơn ưu tiên hơn
      score += Math.max(0, 5 - assigned.length);

      if (score > bestScore) {
        bestScore = score;
        bestHdvId = hdv.id;
        bestIsChained = isChained;
      }
    }

    tour.assigned_hdv_id = bestHdvId;
    tour.is_chained = bestIsChained;

    if (bestHdvId !== null) {
      hdvSchedule.get(bestHdvId)!.push(tour);
    }
  }

  return sorted;
}
