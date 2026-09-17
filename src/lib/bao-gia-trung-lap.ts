// MÁY ĐỌC TRÙNG — một điểm chỉ có trong chương trình MỘT lần mà bị trích thành
// hai dòng ở hai ngày.
//
// Đo trên báo giá thật (北越5日, 17/09): bản gốc nhắc 文廟 đúng một lần, ở dòng
// ngày 5. Model vẫn trả về HAI dòng Văn Miếu — một ở ngày 4 (ngày đó trong bản
// gốc không hề có chữ này) và một ở ngày 5. Ba lượt đọc gần nhau đều lặp đúng
// kiểu ấy, nên không phải rủi may mà là tật của bước đọc.
//
// Lớp chặn ở đây TẤT ĐỊNH và chỉ dựa vào bằng chứng trong chính bản gốc:
//  · bản gốc nhắc ÍT LẦN HƠN số dòng máy trả về → bỏ đúng phần thừa
//  · bản gốc nhắc đủ số lần (điểm đi thật hai ngày) → giữ nguyên
//  · không dò ra chữ nào (model diễn đạt lại, không chép nguyên văn) → KHÔNG đụng
//  · không có bản gốc dạng chữ (PDF scan / ảnh), hoặc bản gốc đọc thiếu trang →
//    KHÔNG đụng, vì lúc đó "không thấy" không có nghĩa là "không có"
//
// Bỏ nhầm một dòng có tiền thì báo giá hụt tiền mà không ai thấy — nguy hiểm hơn
// hẳn để lại một dòng thừa mà người nhập nhìn là biết. Nên mọi ca lưỡng lự ở đây
// đều nghiêng về GIỮ, và dòng bị bỏ luôn được kê tên ra cho người nhập soi lại.

import { boDau } from "./bang-gia-sua-tay";
import { nanDoiChieu, tachDongGoc } from "./bao-gia-doi-chieu";

/** Hình dạng tối thiểu của một dòng chi phí để lọc trùng. */
export interface DongCoTheTrung {
  ngay_so: number;
  loai: string;
  ten_zh?: string | null;
  mo_ta?: string;
  sua_tay?: boolean;
}

/** Dòng đã bị bỏ — để màn review kê ra, không bỏ lặng lẽ. */
export interface DongDaBo {
  ngay_so: number;
  ten: string;
}

export interface KetQuaLocTrung<T> {
  rows: T[];
  daBo: DongDaBo[];
}

/** Mốc ngày đầu dòng: "D4", "第4天", "DAY 4", "Ngày 4". Chỉ nhận ở ĐẦU dòng —
 *  chữ "day" giữa câu là tiếng Anh bình thường, không phải mốc. */
const RE_MOC_NGAY: readonly RegExp[] = [
  /^d\s*(\d{1,2})\b/,
  /^第\s*(\d{1,2})\s*[天日]/,
  /^day\s*(\d{1,2})\b/,
  /^ngay\s*(\d{1,2})\b/,
];

/** Ngày của từng dòng bản gốc (null = đoạn đầu file, chưa tới mốc ngày nào). */
export function ngayCuaDongGoc(dong: readonly string[]): (number | null)[] {
  let hienTai: number | null = null;
  return dong.map((d) => {
    const t = boDau(d.trim()).toLowerCase();
    for (const re of RE_MOC_NGAY) {
      const m = t.match(re);
      if (m) { hienTai = Number(m[1]); break; }
    }
    return hienTai;
  });
}

/**
 * Bỏ những dòng máy đọc lặp mà bản gốc không đỡ nổi.
 *
 * `noiDungGoc` là bản gốc dạng CHỮ; `daCatBot` = bản gốc mới đọc được vài trang
 * đầu (file dài quá trần) → không đủ căn cứ, hàm trả về nguyên xi.
 */
export function locDongMayDocTrung<T extends DongCoTheTrung>(
  rows: readonly T[],
  noiDungGoc: string | null | undefined,
  daCatBot = false,
): KetQuaLocTrung<T> {
  const nguyenXi = { rows: [...rows], daBo: [] as DongDaBo[] };
  const text = String(noiDungGoc ?? "").trim();
  if (!text || daCatBot || rows.length < 2) return nguyenXi;

  const dong = tachDongGoc(text);
  const nan = dong.map(nanDoiChieu);
  const ngayDong = ngayCuaDongGoc(dong);

  // Gom các dòng CÙNG loại + CÙNG chữ gốc đã nắn.
  // Bỏ qua:
  //  · khách sạn — "住宿同上" cố ý chép lại tên đêm trước cho các đêm sau, lặp ở
  //    đây là ĐÚNG và mỗi đêm là một khoản tiền phòng thật
  //  · dòng người nhập đã động tay — thứ họ vừa gõ không phải máy đọc ra
  const nhom = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.loai === "hotel" || r.sua_tay) return;
    const kim = nanDoiChieu(r.ten_zh);
    if (kim.length < 2) return;
    const k = `${r.loai}|${kim}`;
    const ds = nhom.get(k);
    if (ds) ds.push(i); else nhom.set(k, [i]);
  });

  const boIdx = new Set<number>();
  const daBo: DongDaBo[] = [];

  for (const [k, idxs] of nhom) {
    if (idxs.length < 2) continue;
    const kim = k.slice(k.indexOf("|") + 1);

    const ngayNguon: (number | null)[] = [];
    for (let i = 0; i < nan.length; i++) if (nan[i].includes(kim)) ngayNguon.push(ngayDong[i]);
    // Không chép nguyên văn / bản gốc nhắc đủ số lần → không đủ cớ để bỏ.
    if (!ngayNguon.length || ngayNguon.length >= idxs.length) continue;

    // Giữ đúng bằng số lần bản gốc nhắc. Ưu tiên dòng có ngay_so TRÙNG ngày của
    // lần nhắc đó — đó chính là chỗ phân biệt dòng thật với dòng máy gán lạc ngày.
    const conLai = new Set(idxs);
    const giu = new Set<number>();
    for (const ng of ngayNguon) {
      if (ng == null) continue;
      const hit = idxs.find((i) => conLai.has(i) && rows[i].ngay_so === ng);
      if (hit != null) { giu.add(hit); conLai.delete(hit); }
    }
    // Bản gốc không có mốc ngày để đối chiếu → lấp nốt theo thứ tự xuất hiện.
    for (const i of idxs) {
      if (giu.size >= ngayNguon.length) break;
      if (conLai.has(i)) { giu.add(i); conLai.delete(i); }
    }

    for (const i of idxs) {
      if (giu.has(i)) continue;
      boIdx.add(i);
      daBo.push({ ngay_so: rows[i].ngay_so, ten: (rows[i].mo_ta || rows[i].ten_zh || "").trim() });
    }
  }

  if (!boIdx.size) return nguyenXi;
  return { rows: rows.filter((_, i) => !boIdx.has(i)), daBo };
}
