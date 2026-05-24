// Quick stats: chuỗi VN còn raw vs đã wrap t() trong src/
const fs = require("fs");
const path = require("path");

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(f);
  }
  return out;
}

const VI = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ]/;
// Bắt literal chuỗi "...", '...', `...` (template không nội suy phức tạp).
const STR = /"([^"\\\n]{2,})"|'([^'\\\n]{2,})'|`([^`\\\n${}]{2,})`/g;
// t("...") — chỉ literal. Cùng regex như test gác cổng.
const TC = /(?:^|[^.\w$])t\(\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/gm;

const rows = [];
let totalRaw = 0, totalWrap = 0;

for (const f of walk("src")) {
  const code = fs.readFileSync(f, "utf8");

  // Vị trí của các literal đã wrap để loại khỏi đếm raw
  const wrappedSpans = [];
  TC.lastIndex = 0;
  let m;
  while ((m = TC.exec(code))) {
    const lit = m[1];
    const start = m.index + m[0].indexOf(lit);
    wrappedSpans.push([start, start + lit.length]);
  }
  const inWrap = (idx) => wrappedSpans.some(([a, b]) => idx >= a && idx < b);

  let raw = 0;
  STR.lastIndex = 0;
  while ((m = STR.exec(code))) {
    const val = m[1] ?? m[2] ?? m[3] ?? "";
    if (!VI.test(val)) continue;
    if (inWrap(m.index)) continue;
    raw++;
  }
  const wrap = wrappedSpans.length;
  if (raw || wrap) {
    rows.push({ f: f.replace(/\\/g, "/"), raw, wrap });
    totalRaw += raw;
    totalWrap += wrap;
  }
}

rows.sort((a, b) => b.raw - a.raw);

const cov = totalWrap / (totalWrap + totalRaw);
console.log(`TỔNG: t() wrapped = ${totalWrap}, raw VN còn lại = ${totalRaw}`);
console.log(`Coverage (wrapped / (wrapped + raw)) = ${(cov * 100).toFixed(1)}%`);
console.log("");
console.log("Top 25 file còn nhiều chuỗi VN thô (chưa bọc t()):");
for (const r of rows.slice(0, 25)) {
  console.log(`  raw=${String(r.raw).padStart(3)}  wrap=${String(r.wrap).padStart(3)}  ${r.f}`);
}

const zhKeys = Object.keys(JSON.parse(fs.readFileSync("src/locales/zh-TW.json", "utf8")));
console.log("");
console.log(`zh-TW.json: ${zhKeys.length} key`);
