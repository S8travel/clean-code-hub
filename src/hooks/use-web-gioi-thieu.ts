import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalSupabase } from "@/lib/supabase-external";
import {
  WEB_ANH_BUCKET,
  buildWebAnhPath,
  mergeShowcaseRows,
  webAnhStoragePath,
  type ShowcaseContentRow,
  type WebAnhLoai,
  type WebVenueRow,
} from "@/lib/web-anh";
import { chuanBiAnhWeb } from "@/lib/web-anh-resize";

// web_showcase_content / web_canh_diem_content chưa vào database.types → client
// untyped cục bộ cho 2 bảng này (như use-bao-gia-aliases). Danh mục khach_san /
// nha_hang vẫn đi qua client typed.
const db = externalSupabase as unknown as SupabaseClient;

export type WebVenueLoai = "khach_san" | "nha_hang";

const QK_SHOWCASE = "web_showcase_content";
const QK_CANH_DIEM = "web_canh_diem_content";

/** Khách sạn / nhà hàng trong danh mục + ảnh, logo, cờ ẩn của trang web. */
export function useWebVenueRows(loai: WebVenueLoai) {
  return useQuery<WebVenueRow[]>({
    queryKey: [QK_SHOWCASE, loai],
    queryFn: async () => {
      const danhMuc =
        loai === "khach_san"
          ? externalSupabase.from("khach_san").select("id, ten, dia_diem, dia_chi").order("ten")
          : externalSupabase.from("nha_hang").select("id, ten, dia_diem, dia_chi").order("ten");
      const [m, c] = await Promise.all([
        danhMuc,
        db
          .from("web_showcase_content")
          .select("ref_id, anh_url, logo_url, an_tren_web")
          .eq("loai", loai),
      ]);
      if (m.error) throw m.error;
      if (c.error) throw c.error;
      return mergeShowcaseRows(m.data ?? [], (c.data ?? []) as ShowcaseContentRow[]);
    },
  });
}

export interface WebCanhDiemRow {
  id: number;
  slug: string;
  ten_vi: string;
  tinh_vi: string;
  mien: string;
  loai: string;
  thu_tu: number;
  anh_url: string | null;
  /** Dòng ghi nguồn (tác giả · giấy phép · trang) — bắt buộc với ảnh Wikimedia. */
  anh_nguon: string | null;
  an_tren_web: boolean;
  /** Vị trí trên slide trang chủ; null = không đưa lên slide. */
  slide_thu_tu: number | null;
  /** Ảnh khổ rộng riêng cho slide; null → trang dùng anh_url. */
  slide_anh_url: string | null;
}

/** 99 cảnh điểm của trang web (web_canh_diem_content), theo thứ tự hiển thị. */
export function useWebCanhDiemRows() {
  return useQuery<WebCanhDiemRow[]>({
    queryKey: [QK_CANH_DIEM],
    queryFn: async () => {
      const { data, error } = await db
        .from("web_canh_diem_content")
        .select(
          "id, slug, ten_vi, tinh_vi, mien, loai, thu_tu, anh_url, anh_nguon, an_tren_web, slide_thu_tu, slide_anh_url",
        )
        .order("thu_tu");
      if (error) throw error;
      return (data ?? []) as WebCanhDiemRow[];
    },
  });
}

/** Đích ghi ảnh: khách sạn / nhà hàng (web_showcase_content theo loai + ref_id)
 *  hoặc cảnh điểm (web_canh_diem_content theo id). */
export type WebAnhTarget =
  | { loai: WebVenueLoai; refId: number; kind: "anh" | "logo" }
  | { loai: "canh_diem"; id: number; slug: string; kind: "anh" | "slide" };

function cotAnh(t: WebAnhTarget): "anh_url" | "logo_url" | "slide_anh_url" {
  if (t.loai === "canh_diem") return t.kind === "slide" ? "slide_anh_url" : "anh_url";
  return t.kind === "logo" ? "logo_url" : "anh_url";
}

async function ghiUrl(t: WebAnhTarget, url: string | null): Promise<void> {
  const updated_at = new Date().toISOString();
  if (t.loai === "canh_diem") {
    const payload: Record<string, unknown> = { [cotAnh(t)]: url, updated_at };
    // Ảnh mới thay ảnh Wikimedia → dòng ghi nguồn cũ không còn đúng, xoá theo.
    if (t.kind === "anh") payload.anh_nguon = null;
    const { error } = await db.from("web_canh_diem_content").update(payload).eq("id", t.id);
    if (error) throw error;
    return;
  }
  // UNIQUE (loai, ref_id) thật (không partial, không DEFERRABLE) → upsert được.
  const { error } = await db
    .from("web_showcase_content")
    .upsert({ loai: t.loai, ref_id: t.refId, [cotAnh(t)]: url, updated_at }, { onConflict: "loai,ref_id" });
  if (error) throw error;
}

/** Dọn file cũ MÌNH đã tải (link ngoài thì bỏ qua). DB đã trỏ sang ảnh mới
 *  nên xoá hụt chỉ để lại rác, không làm hỏng trang. */
async function xoaFileCu(oldUrl: string | null | undefined): Promise<void> {
  const path = webAnhStoragePath(oldUrl);
  if (!path) return;
  await externalSupabase.storage.from(WEB_ANH_BUCKET).remove([path]);
}

function lamMoi(qc: QueryClient, loai: WebAnhLoai) {
  void qc.invalidateQueries({
    queryKey: loai === "canh_diem" ? [QK_CANH_DIEM] : [QK_SHOWCASE, loai],
  });
}

/** Co ảnh → tải lên web-images/showcase/… → ghi URL vào bảng nội dung → dọn file cũ. */
export function useTaiAnhWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      target, file, oldUrl,
    }: { target: WebAnhTarget; file: File; oldUrl?: string | null }) => {
      const anh = await chuanBiAnhWeb(file, target.kind);
      const refKey = target.loai === "canh_diem" ? target.slug : target.refId;
      const path = buildWebAnhPath(target.loai, refKey, target.kind, Date.now(), anh.ext);

      // Tên file có timestamp → luôn mới → KHÔNG upsert (policy UPDATE storage không cần).
      const { error: upErr } = await externalSupabase.storage
        .from(WEB_ANH_BUCKET)
        .upload(path, anh.blob, { contentType: anh.mime, cacheControl: "31536000" });
      if (upErr) throw upErr;

      const { data } = externalSupabase.storage.from(WEB_ANH_BUCKET).getPublicUrl(path);
      try {
        await ghiUrl(target, data.publicUrl);
      } catch (e) {
        // Ghi DB hỏng → gỡ file vừa tải, khỏi để rác mồ côi trong bucket.
        await externalSupabase.storage.from(WEB_ANH_BUCKET).remove([path]);
        throw e;
      }
      await xoaFileCu(oldUrl);
      return data.publicUrl;
    },
    onSuccess: (_url, v) => lamMoi(qc, v.target.loai),
  });
}

/** Gỡ ảnh khỏi trang web (URL về null) + dọn file nếu là file mình tải. */
export function useGoAnhWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, oldUrl }: { target: WebAnhTarget; oldUrl: string | null }) => {
      await ghiUrl(target, null);
      await xoaFileCu(oldUrl);
    },
    onSuccess: (_r, v) => lamMoi(qc, v.target.loai),
  });
}

/** Ẩn / hiện một mục trên trang web. */
export function useDatAnTrenWeb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ loai, id, an }: { loai: WebAnhLoai; id: number; an: boolean }) => {
      const updated_at = new Date().toISOString();
      if (loai === "canh_diem") {
        const { error } = await db
          .from("web_canh_diem_content")
          .update({ an_tren_web: an, updated_at })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await db
        .from("web_showcase_content")
        .upsert({ loai, ref_id: id, an_tren_web: an, updated_at }, { onConflict: "loai,ref_id" });
      if (error) throw error;
    },
    onSuccess: (_r, v) => lamMoi(qc, v.loai),
  });
}

/** Vị trí cảnh điểm trên slide trang chủ (null = bỏ khỏi slide). */
export function useDatSlideThuTu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, thuTu }: { id: number; thuTu: number | null }) => {
      const { error } = await db
        .from("web_canh_diem_content")
        .update({ slide_thu_tu: thuTu, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => lamMoi(qc, "canh_diem"),
  });
}
