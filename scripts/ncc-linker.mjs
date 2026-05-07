import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL = "https://lflsbwoqzmbknzdpaequ.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";
const FILE = "/home/nghianguyen/.claude/plans/ncc.txt";
const APPLY = process.argv.includes("--apply");
const LIST_CURRENT = process.argv.includes("--list-current");
const OUT_FILE = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length) ?? null;

const supabase = createClient(URL, KEY);

function norm(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normLoose(s) {
  return norm(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s) {
  return normLoose(s).replace(/\s+/g, "");
}

function stripEntityPrefix(s) {
  return String(s ?? "")
    .replace(/^\s*(KS|NH)\s+/i, "")
    .trim();
}

function stripGenericWords(s) {
  return normLoose(s)
    .replace(/\b(khach san|nha hang|hotel|resort|spa|boutique|cruise|day cruise|dinner cruise|beach|village|by|affiliated)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s) {
  return new Set(
    stripGenericWords(s)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t && t.length >= 2)
  );
}

function isSubset(a, b) {
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function scoreCandidate(sourceName, rowName) {
  const srcLoose = normLoose(sourceName);
  const srcStripped = normLoose(stripEntityPrefix(sourceName));
  const rowLoose = normLoose(rowName);
  const srcCompact = compact(stripEntityPrefix(sourceName));
  const rowCompact = compact(rowName);

  if (srcLoose && srcLoose === rowLoose) return { matched: true, score: 100, kind: "exact" };
  if (srcStripped && srcStripped === rowLoose) return { matched: true, score: 95, kind: "strip_prefix_exact" };
  if (srcCompact && srcCompact === rowCompact) return { matched: true, score: 92, kind: "compact" };

  const srcTokens = tokenSet(stripEntityPrefix(sourceName));
  const rowTokens = tokenSet(rowName);
  if (srcTokens.size >= 2 && rowTokens.size >= 2) {
    if (isSubset(srcTokens, rowTokens)) {
      return { matched: true, score: 85 + Math.min(srcTokens.size, 5), kind: "token_subset_src" };
    }
    if (isSubset(rowTokens, srcTokens)) {
      return { matched: true, score: 80 + Math.min(rowTokens.size, 5), kind: "token_subset_row" };
    }
  }

  return { matched: false, score: 0, kind: "none" };
}

function parseMappings() {
  const lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.map((line, idx) => {
    const m = line.match(/^Tên khách sạn\/nhà hàng\/dịch vụ:(.*);Tên nhà cung cấp:(.*)$/);
    if (!m) return { idx: idx + 1, raw: line, sourceName: "", nccName: "", bad: true };
    return { idx: idx + 1, raw: line, sourceName: m[1].trim(), nccName: m[2].trim(), bad: false };
  });
}

async function fetchAll(table, select) {
  const { data, error } = await supabase.from(table).select(select).order("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function indexBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function bestEntity(mapping, indexes) {
  const candidates = [];
  for (const table of ["khach_san", "nha_hang", "canh_diem"]) {
    for (const row of indexes.entities[table]) {
      const scored = scoreCandidate(mapping.sourceName, row.ten);
      if (scored.matched) candidates.push({ table, row, match: scored.kind, score: scored.score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.row.id - b.row.id);
  const best = candidates[0];
  const tied = candidates.filter((c) => c.score === best.score);
  if (tied.length === 1) return best;

  const src = mapping.sourceName.toUpperCase();
  const preferred =
    src.startsWith("KS") ? "khach_san" :
    src.startsWith("NH") ? "nha_hang" :
    null;
  if (preferred) {
    const preferredTied = tied.filter((c) => c.table === preferred);
    if (preferredTied.length === 1) return preferredTied[0];
  }
  return { ambiguous: tied };
}

function findNcc(mapping, indexes) {
  const exact = indexes.nccExact.get(norm(mapping.nccName)) ?? [];
  if (exact.length > 0) return { rows: exact, match: "exact" };
  const loose = indexes.nccLoose.get(normLoose(mapping.nccName)) ?? [];
  if (loose.length > 0) return { rows: loose, match: "loose" };
  return { rows: [], match: "none" };
}

function uniqRows(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = `${row.table}:${row.id}:${row.ncc_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

async function main() {
  const mappings = parseMappings().filter((m) => !m.bad);
  const [ncc, khachSan, nhaHang, canhDiem] = await Promise.all([
    fetchAll("nha_cung_cap", "id, ten"),
    fetchAll("khach_san", "id, ten, nha_cung_cap_id"),
    fetchAll("nha_hang", "id, ten, nha_cung_cap_id"),
    fetchAll("canh_diem", "id, ten, nha_cung_cap_id"),
  ]);

  const indexes = {
    nccExact: indexBy(ncc, (r) => norm(r.ten)),
    nccLoose: indexBy(ncc, (r) => normLoose(r.ten)),
    entities: { khach_san: khachSan, nha_hang: nhaHang, canh_diem: canhDiem },
  };

  const updates = [];
  const already = [];
  const unmatchedEntity = [];
  const unmatchedNcc = [];
  const ambiguous = [];

  for (const mapping of mappings) {
    const entity = bestEntity(mapping, indexes);
    if (!entity) {
      unmatchedEntity.push(mapping.sourceName);
      continue;
    }
    if (entity.ambiguous) {
      ambiguous.push({ sourceName: mapping.sourceName, candidates: entity.ambiguous });
      continue;
    }
    const nccMatch = findNcc(mapping, indexes);
    if (nccMatch.rows.length === 0) {
      unmatchedNcc.push(`${mapping.sourceName} -> ${mapping.nccName}`);
      continue;
    }
    const nccRow = nccMatch.rows[0];
    if (entity.row.nha_cung_cap_id === nccRow.id) {
      already.push({ ...entity, ncc: nccRow });
      continue;
    }
    if (entity.row.nha_cung_cap_id && entity.row.nha_cung_cap_id !== nccRow.id) {
      already.push({ ...entity, ncc: nccRow, conflict: true });
      continue;
    }
    updates.push({ ...entity, ncc: nccRow, sourceName: mapping.sourceName, nccName: mapping.nccName });
  }

  const byTable = (rows) => rows.reduce((acc, r) => {
    acc[r.table] = (acc[r.table] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    apply: APPLY,
    inputMappings: mappings.length,
    tableCounts: { nha_cung_cap: ncc.length, khach_san: khachSan.length, nha_hang: nhaHang.length, canh_diem: canhDiem.length },
    updateCandidates: updates.length,
    updateCandidatesByTable: byTable(updates),
    alreadyOrConflict: already.length,
    conflicts: already.filter((r) => r.conflict).map((r) => ({ table: r.table, id: r.row.id, ten: r.row.ten, current: r.row.nha_cung_cap_id, target: r.ncc.id, targetName: r.ncc.ten })),
    ambiguousCount: ambiguous.length,
    unmatchedEntityCount: unmatchedEntity.length,
    unmatchedNccCount: unmatchedNcc.length,
    sampleUpdates: updates.slice(0, 20).map((u) => ({ table: u.table, id: u.row.id, ten: u.row.ten, ncc_id: u.ncc.id, ncc: u.ncc.ten, match: u.match })),
    sampleUnmatchedEntity: unmatchedEntity.slice(0, 40),
    sampleUnmatchedNcc: unmatchedNcc.slice(0, 40),
  }, null, 2));

  if (LIST_CURRENT) {
    const currentMatched = uniqRows(already
      .filter((r) => !r.conflict)
      .map((r) => ({
        table: r.table,
        id: r.row.id,
        ten: r.row.ten,
        ncc_id: r.ncc.id,
        ncc: r.ncc.ten,
        match: r.match,
      })))
      .sort((a, b) => a.table.localeCompare(b.table) || a.ten.localeCompare(b.ten, "vi"));
    console.log("CURRENT_MATCHED_LIST_START");
    for (const row of currentMatched) {
      console.log(`${row.table}\t${row.id}\t${row.ten}\t${row.ncc_id}\t${row.ncc}\t${row.match}`);
    }
    console.log("CURRENT_MATCHED_LIST_END");

    if (OUT_FILE) {
      const groups = {
        khach_san: currentMatched.filter((r) => r.table === "khach_san"),
        nha_hang: currentMatched.filter((r) => r.table === "nha_hang"),
        canh_diem: currentMatched.filter((r) => r.table === "canh_diem"),
      };
      const lines = [
        "# Danh sach NCC da gan",
        "",
        "Luu y: danh sach nay duoc trich tu batch match hien tai. Co the du 1-2 record da ton tai tu truoc vi bang khong co updated_at de tach tuyet doi.",
        "",
        `Tong so record: ${currentMatched.length}`,
        `- Khach san: ${groups.khach_san.length}`,
        `- Nha hang: ${groups.nha_hang.length}`,
        `- Dich vu/canh diem: ${groups.canh_diem.length}`,
        "",
      ];
      for (const [label, rows] of [
        ["Khach san", groups.khach_san],
        ["Nha hang", groups.nha_hang],
        ["Dich vu / canh diem", groups.canh_diem],
      ]) {
        lines.push(`## ${label}`, "");
        for (const row of rows) {
          lines.push(`- [${row.id}] ${String(row.ten).trim()} -> [${row.ncc_id}] ${row.ncc}`);
        }
        lines.push("");
      }
      fs.writeFileSync(OUT_FILE, lines.join("\n"));
    }
  }

  if (!APPLY) return;

  let changed = 0;
  const errors = [];
  for (const u of updates) {
    const { error } = await supabase
      .from(u.table)
      .update({ nha_cung_cap_id: u.ncc.id })
      .eq("id", u.row.id)
      .is("nha_cung_cap_id", null);
    if (error) {
      errors.push({ table: u.table, id: u.row.id, error: error.message });
    } else {
      changed++;
    }
  }
  console.log(JSON.stringify({ changed, errors }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
