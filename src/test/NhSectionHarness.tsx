// Tab Chi phí Nhà hàng thu gọn cho test: useNHSection THẬT + NHRow THẬT (y như
// ChiPhiNHSection render từng bữa). Kết quả hook lưu ở ./nh-section-store.
import { useNHSection } from "@/components/chi-phi/use-nh-section";
import NHRow from "@/components/chi-phi/NHRow";
import { setLatest } from "./nh-section-store";

export default function NhSectionHarness({ doanId }: { doanId: number }) {
  const s = useNHSection({ doanId, soKhachDefault: 20 });
  setLatest(s);
  return (
    <table><tbody>
      {s.meals.map((meal) => (
        <NHRow key={`${meal.doan_ngay_id}_${meal.bua_an}`} meal={meal} data={s.nhRowData} handlers={s.nhRowHandlers} />
      ))}
    </tbody></table>
  );
}
