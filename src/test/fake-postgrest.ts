// PostgREST giả trong bộ nhớ, nhiều bảng — để chạy các hàm ghi DB THẬT (vd useSaveDieuTour)
// mà không cần Supabase. Chỉ hỗ trợ đúng phần cú pháp code đang dùng:
//   select / insert / update / delete · eq / neq / in / not(cột,"in","(…)") / like / is ·
//   order / limit · maybeSingle / single · await trực tiếp (thenable).
//
// Giống PostgREST ở những chỗ hay giấu lỗi:
//   - select chỉ trả ĐÚNG các cột được hỏi (quên cột là lộ ngay). Select có nhúng
//     (`a:b(...)`) → trả cả dòng, không giả lập nhúng.
//   - `not in` và `in` không bao giờ chọn dòng có cột NULL (luật NULL của SQL).
//   - maybeSingle với ≥ 2 dòng → lỗi, data null; single khác đúng 1 dòng → lỗi.
//   - Bảng chưa có dữ liệu → mảng rỗng.
// Mỗi lệnh gửi đi được ghi vào `nhatKy` để test đếm số lượt gọi / số lệnh ghi.
type Row = Record<string, unknown>;
type Loi = { message: string };
type KetQua = { data: unknown; error: Loi | null };

export interface LuotGoi {
  bang: string;
  lenh: "select" | "insert" | "update" | "delete";
}

const clone = <T,>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

export class FakeDb {
  bang: Record<string, Row[]> = {};
  nhatKy: LuotGoi[] = [];
  private idTiepTheo = 100_000;

  constructor(duLieu: Record<string, Row[]> = {}) {
    this.bang = clone(duLieu);
  }

  rows(bang: string): Row[] {
    if (!this.bang[bang]) this.bang[bang] = [];
    return this.bang[bang];
  }

  /** Số lệnh ghi (insert/update/delete) vào một bảng — hoặc mọi bảng. */
  soLenhGhi(bang?: string): number {
    return this.nhatKy.filter((l) => l.lenh !== "select" && (!bang || l.bang === bang)).length;
  }

  client() {
    return { from: (bang: string) => new Builder(this, bang) };
  }

  /** @internal */
  capId(): number {
    return this.idTiepTheo++;
  }
}

type Loc = (r: Row) => boolean;

class Builder implements PromiseLike<KetQua> {
  private lenh: LuotGoi["lenh"] = "select";
  private payload: Row | Row[] | null = null;
  private loc: Loc[] = [];
  private cot: string[] | null = null;
  private traVe = false; // insert/update/delete có .select() → trả dòng
  private thuTu: { cot: string; tang: boolean } | null = null;
  private gioiHan: number | null = null;

  constructor(private db: FakeDb, private bang: string) {}

  select(c?: string) {
    if (this.lenh !== "select") this.traVe = true;
    if (c && c.trim() !== "*" && !c.includes("(")) {
      this.cot = c.split(",").map((x) => x.trim()).filter(Boolean);
    } else {
      this.cot = null;
    }
    return this;
  }
  insert(p: Row | Row[]) { this.lenh = "insert"; this.payload = p; return this; }
  update(p: Row) { this.lenh = "update"; this.payload = p; return this; }
  delete() { this.lenh = "delete"; return this; }

  eq(c: string, v: unknown) { this.loc.push((r) => r[c] != null && r[c] === v); return this; }
  neq(c: string, v: unknown) { this.loc.push((r) => r[c] != null && r[c] !== v); return this; }
  is(c: string, v: unknown) { this.loc.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  in(c: string, ds: unknown[]) { this.loc.push((r) => r[c] != null && ds.includes(r[c])); return this; }
  not(c: string, op: string, v: string) {
    if (op !== "in") throw new Error(`fake-postgrest: not(${op}) chưa hỗ trợ`);
    const ds = v.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
    this.loc.push((r) => r[c] != null && !ds.includes(String(r[c])));
    return this;
  }
  like(c: string, mau: string) {
    const re = new RegExp("^" + mau.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$");
    this.loc.push((r) => typeof r[c] === "string" && re.test(r[c] as string));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.thuTu = { cot: c, tang: o?.ascending !== false }; return this; }
  limit(n: number) { this.gioiHan = n; return this; }

  private chieu(r: Row): Row {
    const cot = this.cot;
    if (!cot) return clone(r);
    return Object.fromEntries(cot.filter((k) => k in r).map((k) => [k, clone(r[k])]));
  }

  private chay(): { data: Row[]; error: Loi | null } {
    this.db.nhatKy.push({ bang: this.bang, lenh: this.lenh });
    const bang = this.db.rows(this.bang);
    if (this.lenh === "insert") {
      const ds = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const moi = ds.map((p) => ({ ...clone(p), id: (p.id as number | undefined) ?? this.db.capId() }));
      bang.push(...moi);
      return { data: this.traVe ? moi.map((r) => this.chieu(r)) : [], error: null };
    }
    let khop = bang.filter((r) => this.loc.every((f) => f(r)));
    if (this.lenh === "update") {
      for (const r of khop) Object.assign(r, clone(this.payload as Row));
      return { data: this.traVe ? khop.map((r) => this.chieu(r)) : [], error: null };
    }
    if (this.lenh === "delete") {
      this.db.bang[this.bang] = bang.filter((r) => !khop.includes(r));
      return { data: this.traVe ? khop.map((r) => this.chieu(r)) : [], error: null };
    }
    if (this.thuTu) {
      const { cot, tang } = this.thuTu;
      khop = [...khop].sort((a, b) => ((a[cot] as number) > (b[cot] as number) ? 1 : -1) * (tang ? 1 : -1));
    }
    if (this.gioiHan != null) khop = khop.slice(0, this.gioiHan);
    return { data: khop.map((r) => this.chieu(r)), error: null };
  }

  maybeSingle(): Promise<KetQua> {
    return Promise.resolve().then(() => {
      const { data, error } = this.chay();
      if (error) return { data: null, error };
      if (data.length > 1) return { data: null, error: { message: "JSON object requested, multiple rows returned" } };
      return { data: data[0] ?? null, error: null };
    });
  }
  single(): Promise<KetQua> {
    return Promise.resolve().then(() => {
      const { data, error } = this.chay();
      if (error) return { data: null, error };
      if (data.length !== 1) return { data: null, error: { message: `single: ${data.length} dòng` } };
      return { data: data[0], error: null };
    });
  }
  then<A = KetQua, B = never>(
    res?: ((v: KetQua) => A | PromiseLike<A>) | null,
    rej?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.chay()).then(res, rej);
  }
}
