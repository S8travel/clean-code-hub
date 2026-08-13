import { externalSupabase } from "@/lib/supabase-external";

// Ảnh dán/thả vào body mail (data:/blob:) KHÔNG hiển thị được ở Gmail/Outlook
// (client chặn ảnh inline data:). Giải pháp: upload lên Storage public →
// dùng URL https → mọi email client render bình thường.
//
// Bucket RIÊNG, cố tình để public và KHÔNG chứa gì ngoài ảnh nhúng mail.
//
// Ảnh nhúng mail KHÔNG được nằm chung bucket với chứng từ: bucket chứng từ là
// bucket riêng tư, mở file bằng link ký có hạn — mà mail ĐÃ GỬI thì nằm trong
// hộp thư người nhận, không sửa lại được, nên link hết hạn là ảnh hỏng vĩnh
// viễn. Vì vậy tách đôi: chứng từ = riêng tư + link ký; ảnh mail = public + URL bền.
//
// ĐỪNG đẩy gì khác vào bucket này, và đừng dùng nó cho file có số tiền.
const BUCKET = "email-images";

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  return "png";
}

/** Upload 1 ảnh (Blob/File) lên Storage, trả URL public https. */
export async function uploadInlineImage(blob: Blob): Promise<string> {
  const ext = extFromMime(blob.type || "image/png");
  const path = `email-inline/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await externalSupabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      // KHÔNG upsert: path duy nhất; upsert=true gây lỗi RLS (nhánh UPDATE policy bucket).
      contentType: blob.type || "image/png",
      cacheControl: "31536000",
    });
  if (error) throw error;
  const { data } = externalSupabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Safety-net: quét html, đổi mọi <img src="data:..."|"blob:..."> sang URL
 * public https (upload Storage). Dùng trước khi gửi cho các đường chèn ảnh
 * không qua paste/drop handler. No-op nếu không có ảnh inline.
 */
export async function inlineImagesToPublicUrls(html: string): Promise<string> {
  const re = /src\s*=\s*"((?:data:|blob:)[^"]+)"/gi;
  const srcs = [...new Set([...html.matchAll(re)].map((m) => m[1]))];
  if (srcs.length === 0) return html;
  let out = html;
  for (const src of srcs) {
    try {
      const blob = await (await fetch(src)).blob();
      const url = await uploadInlineImage(blob);
      out = out.split(`"${src}"`).join(`"${url}"`);
    } catch {
      // ảnh hỏng (blob: hết hạn / fetch fail) → bỏ src để không vỡ layout
      out = out.split(`"${src}"`).join('""');
    }
  }
  return out;
}
