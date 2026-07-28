import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

/**
 * Chi phí đoàn dưới góc nhìn AGENT — số đã nhân `agents.he_so_hien_thi`.
 *
 * Đọc qua RPC `get_chi_phi_agent_view` chứ KHÔNG đọc thẳng `doan_chi_phi`: với
 * tài khoản `che_gia_von`, RLS đã chặn SELECT bảng đó (migration
 * 20260728_che_gia_von_agent_view) nên đây là đường duy nhất lấy được số, và số
 * phát ra đã cộng hệ số ở tầng DB — client không bao giờ chạm giá vốn thật.
 *
 * RPC tự kiểm tra scope văn phòng (nó là SECURITY DEFINER nên bypass RLS), và
 * trả rỗng nếu agent của đoàn chưa cấu hình hệ số.
 */
/**
 * KHÔNG có trường hệ số ở đây — cố ý. Client biết hệ số là chia ngược ra giá
 * vốn thật; hệ số nằm ở bảng `agent_he_so` chỉ admin/giám đốc đọc được.
 */
export interface ChiPhiAgentRow {
  danh_muc: string;
  mo_ta: string | null;
  ngay_so: number | null;
  so_luong: number | null;
  don_gia: number | null;
  thanh_tien: number | null;
}

export function useChiPhiAgent(doanId?: number | null) {
  return useQuery({
    queryKey: ["chi_phi_agent", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_chi_phi_agent_view", {
        p_doan_id: doanId!,
      });
      if (error) throw error;
      return (data ?? []) as ChiPhiAgentRow[];
    },
  });
}

export const DANH_MUC_LABEL: Record<string, string> = {
  khach_san:  "Khách sạn",
  nha_hang:   "Nhà hàng",
  canh_diem:  "Cảnh điểm & dịch vụ",
  xe:         "Xe",
  visa:       "Visa",
  bao_hiem:   "Bảo hiểm",
  hdv_ho_tro: "HDV & hỗ trợ",
};

export interface ChiPhiAgentNhom {
  danh_muc: string;
  label: string;
  rows: ChiPhiAgentRow[];
  tong: number;
}

/**
 * Gộp theo danh mục + tổng. Tách khỏi component để test được không cần render.
 * Thứ tự nhóm theo DANH_MUC_LABEL (danh mục lạ đẩy xuống cuối, giữ nguyên tên).
 */
export function groupChiPhiAgent(rows: ChiPhiAgentRow[]): {
  nhom: ChiPhiAgentNhom[];
  tongCong: number;
} {
  const order = Object.keys(DANH_MUC_LABEL);
  const byDanhMuc = new Map<string, ChiPhiAgentRow[]>();

  for (const r of rows) {
    const key = r.danh_muc ?? "khac";
    const list = byDanhMuc.get(key);
    if (list) list.push(r);
    else byDanhMuc.set(key, [r]);
  }

  const nhom: ChiPhiAgentNhom[] = [...byDanhMuc.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
    })
    .map(([danh_muc, list]) => ({
      danh_muc,
      label: DANH_MUC_LABEL[danh_muc] ?? danh_muc,
      rows: list,
      tong: list.reduce((s, r) => s + (Number(r.thanh_tien) || 0), 0),
    }));

  return { nhom, tongCong: nhom.reduce((s, g) => s + g.tong, 0) };
}
