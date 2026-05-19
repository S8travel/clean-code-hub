import {
  ImageRun, Paragraph, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, VerticalAlign,
} from "docx";

// Logo S8 (public/logo.jpg) cho file Word xuất ra. Fetch 1 lần rồi cache.
// Lỗi/không có → null (export vẫn chạy, chỉ thiếu logo).
let _bytes: ArrayBuffer | null | undefined;

export async function getLogoData(): Promise<ArrayBuffer | null> {
  if (_bytes !== undefined) return _bytes;
  try {
    const res = await fetch("/logo.jpg");
    _bytes = res.ok ? await res.arrayBuffer() : null;
  } catch {
    _bytes = null;
  }
  return _bytes;
}

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

/**
 * Khối company góc trên-trái: [LOGO | chữ công ty] cạnh nhau (logo sát mép
 * trái). Trả Table lồng (đặt làm children của ô header trái). logoData null →
 * trả null (caller fallback render chữ như cũ).
 */
// Cỡ logo trong header: cao 96px; rộng = 48 × 1.5 = 72px.
const LOGO_H = 96;
const LOGO_W = 72;

export function companyLogoTable(
  logoData: ArrayBuffer | null,
  textParas: Paragraph[],
): Table | null {
  if (!logoData) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 2400, type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            // left: cách lề trái 1 khoảng (~0.6cm) để logo không sát mép
            margins: { top: 0, bottom: 0, left: 340, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new ImageRun({
                    type: "jpg",
                    data: logoData,
                    transformation: { width: LOGO_W, height: LOGO_H },
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 4500, type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: textParas,
          }),
        ],
      }),
    ],
  });
}
