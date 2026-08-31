// Nối báo giá bên cổng về đúng yêu cầu (詢價) đã sinh ra nó.
//
// Vì sao phải nối ở tầng đồng bộ: cổng và CRM là HAI project khác nhau, id không
// dùng chung. Bên CRM `bao_gia.yeu_cau_id` trỏ tới `yeu_cau_bao_gia.id`; bên
// cổng `bao_gia.yeu_cau_id` phải trỏ tới `yeu_cau.id` của cổng. Cầu nối là cột
// `yeu_cau.crm_yeu_cau_id` — không dịch qua đó thì cổng lại về cảnh hai danh
// sách rời nhau, đối tác tự đoán bảng giá nào trả lời yêu cầu nào.
//
// Tách khỏi edge function để test được: đây toàn là logic ghép id, thứ sai một
// dòng là gắn bảng giá của chuyến này sang yêu cầu của chuyến khác.

export interface DongYeuCauCong {
  id: number;
  crm_lead_id: number | null;
  crm_yeu_cau_id: number | null;
}

export interface YeuCauCrm {
  id: number;
  lead_id: number | null;
}

/**
 * Điền `crm_yeu_cau_id` cho các dòng yêu cầu bên cổng còn thiếu.
 *
 * Dòng gửi TRƯỚC 24/08/2026 chỉ nhớ `crm_lead_id` (lúc đó chưa có cột kia), nên
 * bắc cầu qua lead: mỗi yêu cầu bên CRM giữ đúng một lead của chính nó.
 *
 * KHÔNG gán khi id yêu cầu CRM đó đã có dòng khác bên cổng nhận: cột có UNIQUE,
 * gán chồng là cả lượt đồng bộ văng lỗi. Trùng như vậy nghĩa là dữ liệu đã lệch
 * từ trước — để nguyên cho người đọc log xử lý, đừng tự ý chọn hộ.
 */
export function tinhBackfillYeuCau(
  dongCong: DongYeuCauCong[],
  ycCrm: YeuCauCrm[],
): Array<{ id: number; crm_yeu_cau_id: number }> {
  const theoLead = new Map<number, number>();
  for (const y of ycCrm) {
    if (y.lead_id == null) continue;
    // Lead sinh nhiều yêu cầu là chuyện bất thường; giữ cái ĐẦU cho ổn định.
    if (!theoLead.has(y.lead_id)) theoLead.set(y.lead_id, y.id);
  }

  const daCoChu = new Set<number>(
    dongCong.map((d) => d.crm_yeu_cau_id).filter((v): v is number => v != null),
  );

  const ra: Array<{ id: number; crm_yeu_cau_id: number }> = [];
  for (const d of [...dongCong].sort((a, b) => a.id - b.id)) {
    if (d.crm_yeu_cau_id != null || d.crm_lead_id == null) continue;
    const crmId = theoLead.get(d.crm_lead_id);
    if (crmId == null || daCoChu.has(crmId)) continue;
    daCoChu.add(crmId);
    ra.push({ id: d.id, crm_yeu_cau_id: crmId });
  }
  return ra;
}

export interface BaoGiaCanNoi {
  crm_bao_gia_id: number;
  /** Yêu cầu bên CRM mà báo giá này trả lời (bao_gia.yeu_cau_id bên CRM). */
  crm_yeu_cau_id: number | null;
}

export interface NhomPatch {
  /** Giá trị đặt vào `bao_gia.yeu_cau_id` bên cổng. null = gỡ liên kết. */
  yeuCauId: number | null;
  crmBaoGiaIds: number[];
}

/**
 * Tính CHÍNH XÁC những gì cần ghi: chỉ dòng có giá trị mới khác giá trị đang có.
 *
 * Đẩy lại toàn bộ mỗi lượt thì đa số báo giá (loại S8 chủ động chào, không có
 * yêu cầu đứng trước) bị ghi đè null vô ích 2 lần/ngày — tốn request và làm log
 * ồn tới mức không nhìn ra thay đổi thật.
 *
 * Gom theo giá trị đích: mỗi nhóm là MỘT lệnh PATCH kèm bộ lọc `in.(...)`.
 */
export function tinhPatchBaoGia(
  mongMuon: BaoGiaCanNoi[],
  /** crm_yeu_cau_id (CRM) → yeu_cau.id (cổng). */
  mapYeuCau: Map<number, number>,
  /** crm_bao_gia_id → yeu_cau_id đang lưu bên cổng. */
  hienTai: Map<number, number | null>,
): NhomPatch[] {
  const theoDich = new Map<number | null, number[]>();

  for (const b of mongMuon) {
    // Chưa map được (bản sao yêu cầu bên cổng chưa kịp tạo) thì để NGUYÊN giá trị
    // đang có — gỡ liên kết ở đây là tự tay xoá thứ lượt sau mới nối lại được.
    const dich = b.crm_yeu_cau_id == null
      ? null
      : mapYeuCau.get(b.crm_yeu_cau_id) ?? undefined;
    if (dich === undefined) continue;

    const dangCo = hienTai.get(b.crm_bao_gia_id);
    // Dòng chưa có bên cổng (upsert vừa hỏng) coi như đang null.
    if ((dangCo ?? null) === dich) continue;

    const ds = theoDich.get(dich);
    if (ds) ds.push(b.crm_bao_gia_id);
    else theoDich.set(dich, [b.crm_bao_gia_id]);
  }

  return [...theoDich.entries()]
    .map(([yeuCauId, crmBaoGiaIds]) => ({ yeuCauId, crmBaoGiaIds: crmBaoGiaIds.sort((a, b) => a - b) }))
    // Thứ tự ổn định cho log và cho test: gỡ liên kết (null) đứng cuối.
    .sort((a, b) => (a.yeuCauId ?? Infinity) - (b.yeuCauId ?? Infinity));
}
