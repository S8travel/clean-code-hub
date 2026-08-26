// Đẩy LỊCH SỬ CÁC BẢN CHÀO của một báo giá sang cổng đối tác.
//
// Trước đây cổng chỉ giữ đúng một bản cho mỗi báo giá: gửi bản mới là bản cũ bị
// ghi đè, trong khi đối tác có thể đã in bản cũ đưa cho khách của họ. Nay mỗi bản
// là một dòng riêng bên cổng, kèm "khác bản trước ở chỗ nào" — cùng cách làm với
// 飯店確認單.
//
// LỚP VỐN KHÔNG ĐI QUA ĐÂY. Câu select bên dưới cố ý kê tên từng cột và KHÔNG có
// `noi_dung_von`: đơn giá từng dịch vụ, tỷ giá, lợi nhuận ở lại CRM. Ai sửa câu
// select này thành `*` là mở đường cho giá vốn ra ngoài.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { soSanhBanChao, type BanChao } from "../_shared/bao-gia-chao-diff.ts";
import { chiaLo, type BoQua } from "../_shared/portal-sync.ts";
import type { GoiCong } from "./dong-bo-them.ts";

/** Báo giá đã có mặt bên cổng — cần id hai bên để nối bảng phiên bản. */
export interface BaoGiaDaDay {
  crm_id: number;
  cong_id: number;
  agent_id: number;
}

/** Một bản chào đã đóng băng bên CRM. */
export interface PhienBanNguon {
  id: number;
  bao_gia_id: number;
  so_phien_ban: number;
  ma_hien_thi: string;
  noi_dung_chao: BanChao;
  chao_ngay: string | null;
  hieu_luc_den: string | null;
  gui_luc: string;
}

const COT = "id, bao_gia_id, so_phien_ban, ma_hien_thi, noi_dung_chao, chao_ngay, hieu_luc_den, gui_luc";

/** Cắt lô cho bộ lọc `in.(...)` — danh sách id nằm trên URL. */
const CO_LO = 100;

const doc = async (r: Response): Promise<string> => (await r.text()).slice(0, 300);

/**
 * Đọc toàn bộ bản chào của các báo giá đang chia sẻ, đẩy sang cổng những bản
 * chưa có. Bản đã đẩy KHÔNG đụng lại: nội dung của nó đã đóng băng bên CRM nên
 * không có gì để cập nhật, mà ghi đè thì mất luôn dấu thời gian đối tác nhận.
 */
export async function dongBoPhienBan(
  crm: SupabaseClient,
  cong: GoiCong,
  ds: BaoGiaDaDay[],
  boQua: BoQua[],
): Promise<number> {
  if (!ds.length) return 0;
  const theoCrmId = new Map(ds.map((d) => [d.crm_id, d]));

  const nguon: PhienBanNguon[] = [];
  for (const lo of chiaLo(ds.map((d) => d.crm_id), CO_LO)) {
    const { data, error } = await crm
      .from("bao_gia_phien_ban")
      .select(COT)
      .in("bao_gia_id", lo)
      .order("bao_gia_id", { ascending: true })
      .order("so_phien_ban", { ascending: true });
    if (error) throw new Error(`đọc bao_gia_phien_ban hỏng: ${error.message}`);
    nguon.push(...((data ?? []) as unknown as PhienBanNguon[]));
  }
  if (!nguon.length) return 0;

  // Bản nào cổng đã có. Hỏi theo id báo giá bên cổng chứ không theo id phiên bản:
  // danh sách phiên bản dài gấp mấy lần, mà bộ lọc thì nằm trên URL.
  const daCo = new Set<number>();
  for (const lo of chiaLo(ds.map((d) => d.cong_id), CO_LO)) {
    const r = await cong(`bao_gia_phien_ban?bao_gia_id=in.(${lo.join(",")})&select=crm_phien_ban_id`);
    if (!r.ok) throw new Error(`đọc bao_gia_phien_ban bên cổng hỏng: ${await doc(r)}`);
    for (const x of (await r.json()) as Array<{ crm_phien_ban_id: number }>) daCo.add(x.crm_phien_ban_id);
  }

  // Bản liền trước của từng bản, để tính "khác bản trước". Dựng từ danh sách CRM
  // (đã sắp theo báo giá + số bản) chứ không hỏi lại cổng: bản trước có thể chưa
  // từng được đẩy sang, mà so với "không có gì" thì ra một danh sách thay đổi dài
  // vô nghĩa.
  const truoc = new Map<number, PhienBanNguon>();
  for (let i = 1; i < nguon.length; i++) {
    const a = nguon[i - 1];
    const b = nguon[i];
    if (a.bao_gia_id === b.bao_gia_id && a.so_phien_ban === b.so_phien_ban - 1) truoc.set(b.id, a);
  }

  const them: Array<Record<string, unknown> & { crm_phien_ban_id: number }> = [];
  for (const v of nguon) {
    if (daCo.has(v.id)) continue;
    // Báo giá không có trong danh sách đang chia sẻ thì bỏ qua thay vì nổ: một
    // dòng lạ không được phép giết cả lượt đồng bộ.
    const d = theoCrmId.get(v.bao_gia_id);
    if (!d) continue;
    them.push({
      agent_id: d.agent_id,
      bao_gia_id: d.cong_id,
      crm_phien_ban_id: v.id,
      so_phien_ban: v.so_phien_ban,
      ma_hien_thi: v.ma_hien_thi,
      noi_dung: v.noi_dung_chao,
      thay_doi: soSanhBanChao(truoc.get(v.id)?.noi_dung_chao, v.noi_dung_chao),
      chao_ngay: v.chao_ngay,
      hieu_luc_den: v.hieu_luc_den,
      gui_luc: v.gui_luc,
    });
  }

  let so = 0;
  for (const lo of chiaLo(them, CO_LO)) {
    const r = await cong("bao_gia_phien_ban?on_conflict=crm_phien_ban_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lo),
    });
    if (!r.ok) {
      // Cả lô hỏng vì một dòng → chỉ đích danh dòng hỏng, phần lành vẫn sang được
      // ở lượt sau. Hay gặp nhất: bản chào cũ có cấu trúc lạ nên vướng hàng rào
      // chống lộ giá vốn bên cổng.
      boQua.push({
        loai: "bao_gia", id: lo[0].crm_phien_ban_id,
        ly_do: `cổng từ chối ${lo.length} bản chào: ${await doc(r)}`,
      });
      continue;
    }
    so += lo.length;
  }
  return so;
}
