import { Info } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import type { NhaHangDetail } from "@/hooks/use-chi-phi-nh";
import type { CanhDiemInfo } from "@/hooks/use-chi-phi-nh";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const LOAI_DV_LABEL: Record<string, string> = {
  tham_quan: "Tham quan",
  dich_vu: "Dịch vụ",
  bao_hiem: "Bảo hiểm",
  an_toi: "Ăn tối",
  an_trua: "Ăn trưa",
  an_sang: "Ăn sáng",
};

const NGUOI_TT_LABEL: Record<string, string> = {
  cong_ty: "Công ty",
  hdv: "HDV",
  khach: "Khách",
};

interface NHInfo extends Pick<NhaHangDetail, "ten" | "foc_khach" | "foc_mien" | "chiet_khau_phan_tram" | "thong_tin_chung" | "ten_ncc" | "ncc_so_tai_khoan" | "ncc_ngan_hang" | "nguoi_thanh_toan"> {
  kind: "nh";
}

interface DVInfo extends Pick<CanhDiemInfo, "ten" | "loai" | "co_phi" | "gia_mac_dinh" | "ghi_chu" | "thong_tin_chung" | "so_dien_thoai" | "email"> {
  kind: "dv";
}

interface Props {
  info: NHInfo | DVInfo | null;
  children: React.ReactNode;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 items-start">
      <span className="text-[11px] text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-[11px] font-medium">{value}</span>
    </div>
  );
}

function NHCard({ info }: { info: NHInfo }) {
  const focText =
    info.foc_khach != null && info.foc_mien != null && info.foc_mien > 0
      ? `${info.foc_khach} ${t("khách")} + ${info.foc_mien} ${t("miễn phí")}`
      : null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold truncate">{info.ten}</p>
      <div className="border-t pt-1.5 space-y-1">
        <Row label="FOC" value={focText ?? t("Không có")} />
        <Row label={t("Chiết khấu")} value={info.chiet_khau_phan_tram ? `${info.chiet_khau_phan_tram}%` : "—"} />
        <Row label={t("Thông tin")} value={info.thong_tin_chung} />
        <Row label={t("Người TT")} value={info.nguoi_thanh_toan ? t(NGUOI_TT_LABEL[info.nguoi_thanh_toan] ?? info.nguoi_thanh_toan) : null} />
        <Row label={t("Nhà cung cấp")} value={info.ten_ncc} />
        {(info.ncc_ngan_hang || info.ncc_so_tai_khoan) && (
          <Row
            label={t("Tài khoản")}
            value={[info.ncc_ngan_hang, info.ncc_so_tai_khoan].filter(Boolean).join(" — ")}
          />
        )}
      </div>
    </div>
  );
}

function DVCard({ info }: { info: DVInfo }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold truncate">{info.ten}</p>
      <div className="border-t pt-1.5 space-y-1">
        <Row label={t("Loại")} value={info.loai ? t(LOAI_DV_LABEL[info.loai] ?? info.loai) : null} />
        <Row label={t("Có phí")} value={info.co_phi != null ? (info.co_phi ? t("Có") : t("Không")) : null} />
        <Row label={t("Giá mặc định")} value={info.gia_mac_dinh != null ? fmt(info.gia_mac_dinh) + " VND" : null} />
        <Row label={t("Thông tin")} value={info.thong_tin_chung} />
        <Row label={t("Ghi chú")} value={info.ghi_chu} />
        <Row label={t("SĐT")} value={info.so_dien_thoai} />
        <Row label="Email" value={info.email} />
      </div>
    </div>
  );
}

export default function CatalogHoverCard({ info, children }: Props) {
  useTranslate();
  if (!info) return <>{children}</>;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-default group">
          {children}
          <Info className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" side="right" align="start">
        {info.kind === "nh" ? <NHCard info={info} /> : <DVCard info={info} />}
      </HoverCardContent>
    </HoverCard>
  );
}
