// Kiểu + hằng dùng chung giữa KhaoSatPublicPage và KhaoSatFields.
// Nguồn tiêu chí điểm: "@/lib/khao-sat-vocab" (KHÔNG định nghĩa lại tại đây).
import { SCORE_KEYS, type ScoreKey } from "@/lib/khao-sat-vocab";

export interface FormState {
  ten_khach: string;
  gioi_tinh: "" | "nam" | "nu";
  tuoi_range: "" | "18-34" | "35-49" | "50+";
  nghe_nghiep: string;
  so_dien_thoai: string;
  email: string;
  next_trip: string; // 下次旅程 — free text
  y_kien_khac: string; // 旅遊建議 — free text
  nguon_thong_tin: string[]; // 獲得資訊 — mảng CODE (multi-select)
  yeu_to_mua: string[]; // 購買因素 — mảng CODE (multi-select)
  scores: Record<ScoreKey, number>; // 0 = chưa chấm
}

export const AGE_OPTS: FormState["tuoi_range"][] = ["18-34", "35-49", "50+"];

export function emptyScores(): Record<ScoreKey, number> {
  return SCORE_KEYS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<ScoreKey, number>);
}

export function emptyForm(): FormState {
  return {
    ten_khach: "",
    gioi_tinh: "",
    tuoi_range: "",
    nghe_nghiep: "",
    so_dien_thoai: "",
    email: "",
    next_trip: "",
    y_kien_khac: "",
    nguon_thong_tin: [],
    yeu_to_mua: [],
    scores: emptyScores(),
  };
}
