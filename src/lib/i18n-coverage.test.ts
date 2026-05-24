import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zhTW from "@/locales/zh-TW.json";

// ─────────────────────────────────────────────────────────────────────────────
// Test phủ i18n: quét MỌI lời gọi t("...") trong src/ và bảo đảm chuỗi đó có
// key tương ứng trong src/locales/zh-TW.json.
//
// Mục đích: khi thêm/sửa chuỗi UI mới, nếu quên thêm bản dịch → CI báo đỏ ngay,
// không phải đi dò thủ công. Key = chuỗi tiếng Việt gốc (xem src/lib/i18n.ts).
//
// Giới hạn: chỉ kiểm tra được literal `t("...")` / `t('...')`. Lời gọi với biến
// `t(bien)` hoặc template literal `t(`...`)` không kiểm tĩnh được — bỏ qua.
// ─────────────────────────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(process.cwd(), "src");
const SKIP_FILE = /\.(test|spec)\./; // file test không phải UI thật

/** Đệ quy lấy mọi file .ts/.tsx trong src/ (trừ file test/spec). */
function listSourceFiles(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Bỏ dấu nháy + giải mã escape cơ bản để khớp với key trong JSON. */
function unquote(literal: string): string {
  const inner = literal.slice(1, -1);
  return inner.replace(/\\(.)/g, (_, c: string) =>
    c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c,
  );
}

// Khớp `t("...")` / `t('...')`. Ký tự trước `t` không được là chữ/số/`.`/`$`
// → loại `setT(`, `i18next.t(`, `format(`... Chỉ bắt literal chuỗi.
const T_CALL_RE = /(?:^|[^.\w$])t\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gm;

interface Usage {
  value: string;
  file: string;
}

/** Quét toàn bộ src/, trả về danh sách literal truyền vào t(). */
function collectTUsages(): Usage[] {
  const usages: Usage[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const code = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    T_CALL_RE.lastIndex = 0;
    while ((m = T_CALL_RE.exec(code))) {
      usages.push({ value: unquote(m[1]), file: path.relative(process.cwd(), file) });
    }
  }
  return usages;
}

const jsonKeys = new Set(Object.keys(zhTW as Record<string, string>));

describe("i18n coverage — t() ↔ zh-TW.json", () => {
  it("mọi chuỗi t(\"...\") đều có key trong zh-TW.json", () => {
    const usages = collectTUsages();
    expect(usages.length).toBeGreaterThan(0); // sanity: regex vẫn quét được

    const missing = usages
      .filter((u) => !jsonKeys.has(u.value))
      .map((u) => `  ${u.file}  →  ${JSON.stringify(u.value)}`);

    if (missing.length > 0) {
      throw new Error(
        `Có ${missing.length} chuỗi t() chưa có bản dịch trong src/locales/zh-TW.json.\n` +
          `Thêm key (= nguyên văn tiếng Việt) vào file đó:\n` +
          [...new Set(missing)].join("\n"),
      );
    }
  });

  it("cảnh báo key thừa (orphan) — không có t() nào dùng tới", () => {
    const used = new Set(collectTUsages().map((u) => u.value));
    const orphans = [...jsonKeys].filter((k) => k !== "_note" && !used.has(k));

    // Không fail CI: nhiều key được seed trước cho module chưa migrate.
    // Khi migration xong, orphan thật sự = chuỗi đã bị sửa → nên dọn.
    if (orphans.length > 0) {
      const preview = orphans.slice(0, 20).map((k) => `  ${JSON.stringify(k)}`);
      if (orphans.length > 20) preview.push(`  …và ${orphans.length - 20} key nữa`);
      console.warn(
        `[i18n] ${orphans.length} key trong zh-TW.json chưa có t() dùng tới ` +
          `(có thể là seed trước, hoặc rác sau khi sửa chuỗi):\n` +
          preview.join("\n"),
      );
    }
    expect(Array.isArray(orphans)).toBe(true);
  });
});
