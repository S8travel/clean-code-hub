// Kết quả useNHSection của lượt render gần nhất trong khung test (NhSectionHarness).
import type { useNHSection } from "@/components/chi-phi/use-nh-section";

type NHSection = ReturnType<typeof useNHSection>;

let latest: NHSection | null = null;
export const setLatest = (s: NHSection) => { latest = s; };
export const sec = (): NHSection => {
  if (!latest) throw new Error("NhSectionHarness chưa render");
  return latest;
};
export const clearLatest = () => { latest = null; };
