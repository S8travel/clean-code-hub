// Ba luồng đồng bộ thêm cho màn đoàn bên cổng đối tác: giấy tờ, 飯店確認單,
// hỏi/đáp hai bên. Tách khỏi index.ts để file điều phối không phình quá đọc nổi.
//
// Phần QUYẾT ĐỊNH (chia sẻ file nào, có gì đổi so với bản trước) nằm ở _shared và
// có test; ở đây chỉ còn việc đi lấy dữ liệu và ghi sang cổng.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { soSanhXacNhan, type BanXacNhan } from "../_shared/ks-xac-nhan-diff.ts";
import {
  canChepLai,
  chiaSeVoiDoiTac,
  duongDanCong,
  tachStorageUrl,
  type TaiLieuNguon,
} from "../_shared/portal-tai-lieu.ts";
import type { BoQua } from "../_shared/portal-sync.ts";

/** Gọi REST của project cổng — đã kèm sẵn service key. */
export type GoiCong = (path: string, init?: RequestInit) => Promise<Response>;

/** Đẩy một file vào bucket 'tai-lieu' của cổng. */
export type TaiLenKho = (duongDan: string, dulieu: Blob, kieu: string) => Promise<void>;

/** Đoàn đã có mặt bên cổng — cần cả id hai bên để nối các bảng con. */
export interface DoanDaDay {
  crm_id: number;
  cong_id: number;
  agent_id: number;
  /** OP phụ trách, để bắn thông báo khi đối tác hỏi. */
  assigned_to: string | null;
}

const doc = async (r: Response): Promise<string> => (await r.text()).slice(0, 300);

async function ghi(cong: GoiCong, path: string, rows: unknown[], onConflict?: string): Promise<void> {
  if (!rows.length) return;
  const q = onConflict ? `${path}?on_conflict=${onConflict}` : path;
  const r = await cong(q, {
    method: "POST",
    headers: {
      Prefer: onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await doc(r)}`);
}

// ───────────────────────────────────────────────────────────────────────────
// 1) 飯店確認單 — lưu theo phiên bản
// ───────────────────────────────────────────────────────────────────────────
interface BanDaCo {
  doan_id: number;
  phien_ban: number;
  noi_dung: BanXacNhan;
}

/**
 * Dựng lại bản xác nhận khách sạn cho từng đoàn, so với bản đối tác đang có.
 * Chỉ ghi thêm PHIÊN BẢN MỚI khi thực sự có thay đổi — chạy đẩy 10 lần một ngày
 * mà không ai đụng booking thì 變更紀錄 vẫn sạch.
 */
export async function dongBoKSXacNhan(
  crm: SupabaseClient,
  cong: GoiCong,
  doan: DoanDaDay[],
  boQua: BoQua[],
): Promise<number> {
  if (!doan.length) return 0;
  const theoCrmId = new Map(doan.map((d) => [d.crm_id, d]));

  const { data, error } = await crm.rpc("build_portal_ks_xac_nhan", {
    p_doan_ids: doan.map((d) => d.crm_id),
  });
  if (error) {
    boQua.push({ loai: "doan", id: doan[0].crm_id, ly_do: `dựng 飯店確認單 hỏng: ${error.message}` });
    return 0;
  }
  const dung = (data ?? []) as Array<{ doan_id: number; noi_dung: BanXacNhan }>;

  // Bản mới nhất của từng đoàn. Sắp phien_ban giảm dần → dòng đầu tiên gặp là bản mới nhất.
  const congIds = doan.map((d) => d.cong_id);
  const r = await cong(
    `ks_xac_nhan?doan_id=in.(${congIds.join(",")})` +
    `&select=doan_id,phien_ban,noi_dung&order=doan_id.asc,phien_ban.desc`,
  );
  if (!r.ok) throw new Error(`Đọc ks_xac_nhan bên cổng hỏng: ${await doc(r)}`);
  const moiNhat = new Map<number, BanDaCo>();
  for (const b of (await r.json()) as BanDaCo[]) {
    if (!moiNhat.has(b.doan_id)) moiNhat.set(b.doan_id, b);
  }

  const them: unknown[] = [];
  for (const { doan_id: crmId, noi_dung } of dung) {
    const d = theoCrmId.get(crmId);
    if (!d) continue;
    const truoc = moiNhat.get(d.cong_id);
    const coKS = (noi_dung?.khach_san ?? []).length > 0;

    // Chưa FINAL khách sạn nào và cũng chưa từng có bản nào → chưa có gì để xác nhận.
    if (!truoc && !coKS) continue;

    const thayDoi = truoc ? soSanhXacNhan(truoc.noi_dung, noi_dung) : [];
    if (truoc && thayDoi.length === 0) continue;

    them.push({
      agent_id: d.agent_id,
      doan_id: d.cong_id,
      phien_ban: (truoc?.phien_ban ?? 0) + 1,
      noi_dung,
      thay_doi: thayDoi,
    });
  }

  try {
    await ghi(cong, "ks_xac_nhan", them);
  } catch (err) {
    boQua.push({
      loai: "doan", id: doan[0].crm_id,
      ly_do: `ghi 飯店確認單 hỏng: ${err instanceof Error ? err.message : String(err)}`,
    });
    return 0;
  }
  return them.length;
}

// ───────────────────────────────────────────────────────────────────────────
// 2) Giấy tờ — chép file sang kho riêng của cổng
// ───────────────────────────────────────────────────────────────────────────
export async function dongBoTaiLieu(
  crm: SupabaseClient,
  cong: GoiCong,
  taiLen: TaiLenKho,
  doan: DoanDaDay[],
  boQua: BoQua[],
): Promise<{ chep: number; go: number }> {
  if (!doan.length) return { chep: 0, go: 0 };
  const theoCrmId = new Map(doan.map((d) => [d.crm_id, d]));

  const { data, error } = await crm
    .from("doan_tai_lieu")
    .select("id, doan_id, loai, ten, file_url, file_name, uploaded_at, portal_enabled")
    .in("doan_id", doan.map((d) => d.crm_id));
  if (error) throw new Error(`Đọc doan_tai_lieu hỏng: ${error.message}`);

  const duocChiaSe = ((data ?? []) as TaiLieuNguon[]).filter(chiaSeVoiDoiTac);

  const congIds = doan.map((d) => d.cong_id);
  const r = await cong(
    `tai_lieu?doan_id=in.(${congIds.join(",")})&select=crm_tai_lieu_id,tai_len_luc`,
  );
  if (!r.ok) throw new Error(`Đọc tai_lieu bên cổng hỏng: ${await doc(r)}`);
  const daCo = new Map(
    ((await r.json()) as Array<{ crm_tai_lieu_id: number; tai_len_luc: string | null }>)
      .map((t) => [t.crm_tai_lieu_id, t]),
  );

  const rows: unknown[] = [];
  let chep = 0;
  for (const t of duocChiaSe) {
    const d = theoCrmId.get(t.doan_id);
    if (!d) continue;
    const duongDan = duongDanCong(d.agent_id, d.cong_id, t);

    if (canChepLai(t, daCo.get(t.id))) {
      const nguon = tachStorageUrl(t.file_url);
      if (!nguon) {
        boQua.push({ loai: "doan", id: t.doan_id, ly_do: `tài liệu #${t.id} không phải file trong kho — bỏ qua` });
        continue;
      }
      const tai = await crm.storage.from(nguon.bucket).download(nguon.path);
      if (tai.error || !tai.data) {
        boQua.push({
          loai: "doan", id: t.doan_id,
          ly_do: `tải tài liệu #${t.id} hỏng: ${tai.error?.message ?? "không có dữ liệu"}`,
        });
        continue;
      }
      try {
        await taiLen(duongDan, tai.data, tai.data.type || "application/octet-stream");
        chep++;
      } catch (err) {
        boQua.push({
          loai: "doan", id: t.doan_id,
          ly_do: `đẩy tài liệu #${t.id} sang cổng hỏng: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
    }

    rows.push({
      crm_tai_lieu_id: t.id,
      agent_id: d.agent_id,
      doan_id: d.cong_id,
      loai: t.loai,
      ten: t.ten,
      file_name: t.file_name,
      duong_dan: duongDan,
      tai_len_luc: t.uploaded_at,
      pushed_at: new Date().toISOString(),
    });
  }

  await ghi(cong, "tai_lieu", rows, "crm_tai_lieu_id");

  // Gỡ những gì không còn được chia sẻ (OP tắt cờ, xoá file). Chỉ đụng vào các
  // đoàn vừa xử lý — đoàn ngoài lô này chưa chắc đã đọc tới, xoá theo là mất oan.
  const conLai = duocChiaSe.map((t) => t.id);
  const dieuKien = conLai.length
    ? `crm_tai_lieu_id=not.in.(${conLai.join(",")})`
    : "crm_tai_lieu_id=gt.0";
  const rXoa = await cong(`tai_lieu?doan_id=in.(${congIds.join(",")})&${dieuKien}&select=id`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!rXoa.ok) throw new Error(`Gỡ tai_lieu hỏng: ${await doc(rXoa)}`);
  const go = ((await rXoa.json()) as unknown[]).length;

  return { chep, go };
}

// ───────────────────────────────────────────────────────────────────────────
// 3) Hỏi/đáp — CRM là bản gốc, cổng giữ bản sao để đối tác đọc
// ───────────────────────────────────────────────────────────────────────────
// Lúc bình thường edge function trao-doi đã đẩy từng dòng sang ngay khi OP trả
// lời. Chỗ này là lưới hứng: lần nào đẩy hỏng thì lượt đẩy sau vá lại.
export async function dongBoTraoDoi(
  crm: SupabaseClient,
  cong: GoiCong,
  doan: DoanDaDay[],
): Promise<number> {
  if (!doan.length) return 0;
  const theoCrmId = new Map(doan.map((d) => [d.crm_id, d]));

  const { data, error } = await crm
    .from("doan_trao_doi")
    .select("id, doan_id, ben_gui, nguoi_gui, noi_dung, gui_luc, tra_loi, nguoi_tra_loi, tra_loi_luc")
    .in("doan_id", doan.map((d) => d.crm_id));
  if (error) throw new Error(`Đọc doan_trao_doi hỏng: ${error.message}`);

  const rows = ((data ?? []) as Array<Record<string, string | number | null>>)
    .map((t) => {
      const d = theoCrmId.get(t.doan_id as number);
      if (!d) return null;
      return {
        crm_trao_doi_id: t.id,
        agent_id: d.agent_id,
        doan_id: d.cong_id,
        ben_gui: t.ben_gui,
        nguoi_gui: t.nguoi_gui,
        noi_dung: t.noi_dung,
        gui_luc: t.gui_luc,
        tra_loi: t.tra_loi,
        nguoi_tra_loi: t.nguoi_tra_loi,
        tra_loi_luc: t.tra_loi_luc,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  await ghi(cong, "trao_doi", rows, "crm_trao_doi_id");
  return rows.length;
}
