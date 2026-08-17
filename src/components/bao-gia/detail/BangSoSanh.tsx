import type { KetQuaSoSanh } from "@/lib/bao-gia-phien-ban";

// Bảng "khác gì so với bản trước" — dùng ở cả sổ phiên bản lẫn dải cảnh báo lệch.
export function BangSoSanh({ kq, coLopVon }: { kq: KetQuaSoSanh; coLopVon: boolean }) {
  if (kq.giong_nhau) {
    return <p className="text-sm text-slate-600">Hai bản giống nhau ở mọi mục so sánh được.</p>;
  }
  const dau = (n: number | null) => (n == null ? "" : n > 0 ? `+${n}` : String(n));
  const tien = (n: number | null) => (n == null ? "—" : n.toLocaleString("vi-VN"));

  return (
    <div className="space-y-4 text-sm">
      {kq.bac_gia.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Bậc giá bán (USD/khách)</p>
          <ul className="space-y-0.5 text-xs">
            {kq.bac_gia.map((b) => (
              <li key={b.label} className="flex gap-2">
                <span className="w-28 shrink-0 text-slate-600">{b.label}</span>
                <span>${b.cu ?? "—"} → <b>${b.moi ?? "—"}</b></span>
                {b.chenh != null && (
                  <span className={b.chenh < 0 ? "text-red-600" : "text-emerald-700"}>({dau(b.chenh)})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kq.single_supplement && (
        <p className="text-xs">
          <span className="text-slate-600">單房差: </span>
          ${kq.single_supplement.cu ?? "—"} → <b>${kq.single_supplement.moi ?? "—"}</b>
        </p>
      )}

      {kq.dich_vu.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Dịch vụ</p>
          <ul className="space-y-0.5 text-xs">
            {kq.dich_vu.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-14 shrink-0 text-slate-400">Ngày {d.ngay_so}</span>
                <span className={
                  d.kieu === "them" ? "text-emerald-700 w-16 shrink-0"
                    : d.kieu === "bo" ? "text-red-600 w-16 shrink-0" : "text-amber-700 w-16 shrink-0"
                }>
                  {d.kieu === "them" ? "thêm" : d.kieu === "bo" ? "bỏ" : "đổi giá"}
                </span>
                <span className="break-words">
                  {d.mo_ta}
                  {d.kieu === "doi_gia" && <> · {tien(d.cu)} → <b>{tien(d.moi)}</b></>}
                  {d.kieu !== "doi_gia" && <> · {tien(d.cu ?? d.moi)}</>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kq.thong_so.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Thông số chung</p>
          <ul className="space-y-0.5 text-xs">
            {kq.thong_so.map((t) => (
              <li key={t.ten} className="flex gap-2">
                <span className="w-40 shrink-0 text-slate-600">{t.ten}</span>
                <span>{t.cu} → <b>{t.moi}</b></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!coLopVon && (
        <p className="text-[11px] text-slate-500">
          Bản cũ được chuyển vào từ trước khi có tính năng phiên bản nên không chụp phần giá vốn —
          chỉ so được bậc giá bán.
        </p>
      )}
    </div>
  );
}
