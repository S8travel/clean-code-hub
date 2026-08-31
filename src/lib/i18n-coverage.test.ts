import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import zhTW from "@/locales/zh-TW.json";
import enUS from "@/locales/en.json";
import { findNearMiss } from "./i18n-near-miss";

// ─────────────────────────────────────────────────────────────────────────────
// i18n coverage: quét tất cả `t("vietnamese")` trong src/ → mọi key phải có
// trong zh-TW.json (catch drift khi developer wrap chuỗi mới nhưng quên dịch).
//
// Allowlist các key thuộc "natural fallback" (chuỗi giống y nguyên tiếng Việt
// hoặc strings ngắn dùng làm placeholder không cần dịch riêng).
// ─────────────────────────────────────────────────────────────────────────────

const SRC_DIR = resolve(__dirname, "../");

/** Recursively walk src/ và trả về list .ts/.tsx files (skip test, node_modules). */
function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "dist") continue;
      out.push(...walkSourceFiles(full));
    } else if (stat.isFile()) {
      if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
  }
  return out;
}

/** Extract literal string keys từ `t("...")` calls. Bỏ qua template literals
 *  (`t(`${...}`)`) và biến (`t(variable)`) vì không thể tĩnh kiểm tra. */
function extractTKeys(src: string): string[] {
  // \bt\("..."\) — word boundary để tránh ".select("a, b")" trong query Supabase
  const keys: string[] = [];
  const re = /\bt\("((?:[^"\\]|\\.)*)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // unescape JavaScript-style escapes
    const raw = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
    keys.push(raw);
  }
  return keys;
}

describe("i18n key coverage", () => {
  const files = walkSourceFiles(SRC_DIR);
  const allKeys = new Set<string>();
  const keyToFiles: Record<string, string[]> = {};
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const keys = extractTKeys(src);
    for (const k of keys) {
      allKeys.add(k);
      (keyToFiles[k] ??= []).push(file);
    }
  }

  it("extracts at least 100 t() keys from source (sanity check)", () => {
    expect(allKeys.size).toBeGreaterThan(100);
  });

  it("every t() key has a translation in zh-TW.json", () => {
    const translations = zhTW as Record<string, string>;
    const missing: string[] = [];
    for (const key of allKeys) {
      if (key.startsWith("_")) continue; // _note metadata key
      if (!(key in translations)) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      // Chỉ đích danh "key gần giống" — key thiếu chỉ khác key đã có ở ký tự nhìn
      // y hệt (… vs ... , — vs - , nháy cong…). Không có dòng gợi ý này, người sửa
      // mở file thấy "rõ ràng có rồi" rồi loay hoay (đúng thứ làm main đỏ ở #267).
      const daCo = Object.keys(translations);
      const sample = missing.slice(0, 10).map((k) => {
        const gan = findNearMiss(k, daCo);
        if (!gan) return `  ${JSON.stringify(k)}`;
        return [
          `  ${JSON.stringify(k)}`,
          `      ⚠ GẦN GIỐNG key đã có: ${JSON.stringify(gan.keyDaCo)}`,
          `        → khác nhau ở: ${gan.khacBiet}`,
          `        → sửa cho khớp 1 trong 2 (đừng thêm key mới trùng nghĩa).`,
        ].join("\n");
      }).join("\n");
      const msg = `${missing.length} key(s) chưa có bản dịch zh-TW. Thêm vào src/locales/zh-TW.json:\n${sample}${missing.length > 10 ? `\n  ... và ${missing.length - 10} nữa` : ""}`;
      throw new Error(msg);
    }
    expect(missing).toEqual([]);
  });

  it("all zh-TW.json values are non-empty strings", () => {
    const translations = zhTW as Record<string, string>;
    const empties: string[] = [];
    for (const [k, v] of Object.entries(translations)) {
      if (k.startsWith("_")) continue;
      if (typeof v !== "string" || v.length === 0) empties.push(k);
    }
    expect(empties).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// en.json là locale PARTIAL (chỉ phủ sidebar / chuông / Lead cho video App
// Review của Meta) → KHÔNG bắt buộc phủ hết key như zh-TW.json; key thiếu tự
// fallback về tiếng Việt.
//
// Nhưng key thừa/gõ sai thì im lặng vô dụng — bản dịch nằm đó mà không bao giờ
// khớp. Guard: mọi key EN phải là key thật, tức đã có trong zh-TW.json (file
// này buộc phủ đủ mọi t("...") literal + các label động đã dịch).
// ─────────────────────────────────────────────────────────────────────────────
describe("en.json (partial locale)", () => {
  const en = enUS as Record<string, string>;
  const zh = zhTW as Record<string, string>;

  it("every en.json key also exists in zh-TW.json (no typo / stale key)", () => {
    const daCo = Object.keys(zh);
    const orphan = Object.keys(en).filter((k) => !k.startsWith("_") && !(k in zh));
    if (orphan.length > 0) {
      const sample = orphan.map((k) => {
        const gan = findNearMiss(k, daCo);
        return gan
          ? `  ${JSON.stringify(k)}\n      ⚠ GẦN GIỐNG key đã có: ${JSON.stringify(gan.keyDaCo)}\n        → khác nhau ở: ${gan.khacBiet}`
          : `  ${JSON.stringify(k)}`;
      }).join("\n");
      throw new Error(
        `${orphan.length} key trong en.json không có trong zh-TW.json — gõ sai hoặc chuỗi gốc đã đổi.\n` +
        `Sửa cho khớp chuỗi tiếng Việt trong source, hoặc thêm bản dịch zh-TW tương ứng:\n${sample}`,
      );
    }
    expect(orphan).toEqual([]);
  });

  it("all en.json values are non-empty strings", () => {
    const empties = Object.entries(en)
      .filter(([k]) => !k.startsWith("_"))
      .filter(([, v]) => typeof v !== "string" || v.length === 0)
      .map(([k]) => k);
    expect(empties).toEqual([]);
  });
});
