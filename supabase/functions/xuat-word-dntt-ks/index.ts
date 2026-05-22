import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageOrientation, HeightRule } from 'npm:docx@9.5.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmt = (n: number) => n.toLocaleString('vi-VN')
const fmtDate = (s: string) => {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0')
}
const addOneDay = (s: string) => {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
const fmtDateVN = () => {
  const d = new Date()
  return 'Hà Nội, ngày ' + d.getDate() + ' tháng ' + (d.getMonth()+1) + ' năm ' + d.getFullYear()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const { doan_id, dntt_ids } = body
    const ids: number[] = dntt_ids || (body.dntt_id ? [body.dntt_id] : [])
    if (!doan_id || ids.length === 0) {
      return new Response(JSON.stringify({ error: 'doan_id va dntt_ids la bat buoc' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // SB_SECRET_KEY = secret key moi; legacy SUPABASE_SERVICE_ROLE_KEY ngung hoat
    // dong sau khi disable legacy JWT keys.
    const SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_KEY)
    const { data: doan, error: e1 } = await supabase.from('doan').select('ten_doan, so_khach').eq('id', doan_id).single()
    if (e1) throw new Error('Loi doan: ' + e1.message)

    const bS = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
    const AB = { top: bS, bottom: bS, left: bS, right: bS }
    const NONE_B = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }
    const CM = { top: 80, bottom: 80, left: 120, right: 120 }
    const HFILL = 'D9D9D9'

    interface TextOpts { size?: number; bold?: boolean; color?: string; italic?: boolean }
    interface SpacingOpts { before?: number; after?: number }
    interface CellOpts { noBorder?: boolean; fill?: string; va?: (typeof VerticalAlign)[keyof typeof VerticalAlign]; cs?: number; rs?: number; w?: number }
    const t = (text: string, o: TextOpts = {}) => new TextRun({ text: String(text ?? ''), font: 'Times New Roman', size: o.size ?? 22, bold: o.bold ?? false, color: o.color ?? '000000', italic: o.italic ?? false })
    const p = (runs: TextRun | TextRun[], align = AlignmentType.LEFT, spacing?: SpacingOpts) => new Paragraph({ alignment: align, spacing: spacing || { before: 60, after: 60 }, children: Array.isArray(runs) ? runs : [runs] })
    const emptyP = () => new Paragraph({ spacing: { before: 60, after: 60 }, children: [] })
    const C = (children: Paragraph | Paragraph[], o: CellOpts = {}) => new TableCell({ borders: o.noBorder ? NONE_B : AB, shading: { fill: o.fill ?? 'FFFFFF', type: ShadingType.CLEAR }, margins: CM, verticalAlign: o.va ?? VerticalAlign.CENTER, columnSpan: o.cs, rowSpan: o.rs, width: o.w ? { size: o.w, type: WidthType.DXA } : undefined, children: Array.isArray(children) ? children : [children] })

    // ----------------------------------------------------------
    // HEADER ROW: 2 truong hop
    // la_coc=true:  ... | Tong tien KS | So luong | FOC | Don gia | Thanh tien | COC      | Tong TT  | NH
    // la_coc=false: ... | Tong tien KS | So luong | FOC | Don gia | Thanh tien | Da coc   | Tong TT  | NH
    // ----------------------------------------------------------

    // Columns chung (truoc cot dac biet)
    // CW: CODE DOAN | So khach | CI | CO | Ten KS | CODE KS | Loai phong | So dem | So luong | FOC | Don gia | Thanh tien | [COC / Da coc] | Tong TT | NH
    const CW = [1100, 600, 800, 800, 1500, 900, 900, 700, 600, 600, 1000, 1100, 900, 1000, 1900]
    const TW = CW.reduce((a, b) => a + b, 0)

    const makeHeaderRow = (laCoc: boolean) => new TableRow({ tableHeader: true, children: [
      C(p(t('CODE ĐOÀN', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[0] }),
      C(p(t('Số khách', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[1] }),
      C(p(t('Check in', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[2] }),
      C(p(t('Check out', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[3] }),
      C(p(t('Tên Khách sạn', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[4] }),
      C(p(t('CODE KS', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[5] }),
      C(p(t('Loại Phòng', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[6] }),
      C(p(t('Số đêm', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[7] }),
      C(p(t('Số Lượng', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[8] }),
      C(p(t('FOC', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[9] }),
      C(p(t('Đơn giá', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[10] }),
      C(p(t('Thành tiền', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[11] }),
      // CW[12]: neu coc -> "So tien coc", neu khong coc -> "Da coc"
      C(p(t(laCoc ? 'Số tiền cọc' : 'Đã cọc', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[12] }),
      C(p(t('Tổng TT', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[13] }),
      C(p(t('Thông tin Ngân hàng', { bold: true, size: 18 }), AlignmentType.CENTER), { fill: HFILL, w: CW[14] }),
    ]})

    const buildTableRows = async (dntt_id: number) => {
      const { data: dntt } = await supabase.from('de_nghi_thanh_toan').select('*').eq('id', dntt_id).single()
      if (!dntt) throw new Error('Khong tim thay DNTT ' + dntt_id)
      const ks_id = dntt.ref_id
      const { data: ks } = await supabase.from('khach_san').select('ten, foc_khach, foc_mien, tai_khoan_thanh_toan').eq('id', ks_id).single()
      const { data: ngayRows } = await supabase.from('doan_ngay').select('id, ngay_so, ngay_date, ks_ma_code').eq('doan_id', doan_id).eq('khach_san_id', ks_id).order('ngay_date', { ascending: true })

      const foc = ks?.foc_khach && ks?.foc_mien ? ks.foc_khach + '免' + ks.foc_mien : '—'
      const maCode = ngayRows && ngayRows.length > 0 ? (ngayRows[0].ks_ma_code || '') : ''
      const tongTT = Number(dntt.so_tien) || 0
      const laCoc = !!dntt.la_coc

      // Tinh so tien da coc truoc do (neu la thanh toan phan con lai)
      let daCocTruoc = 0
      if (!laCoc) {
        // Tim DNTT coc truoc do cua cung KS
        const { data: prevCoc } = await supabase
          .from('de_nghi_thanh_toan')
          .select('so_tien')
          .eq('doan_id', doan_id)
          .eq('ref_loai', 'khach_san')
          .eq('ref_id', ks_id)
          .eq('la_coc', true)
        if (prevCoc && prevCoc.length > 0) {
          daCocTruoc = (prevCoc as Array<{ so_tien: number | string | null }>)
            .reduce((s, r) => s + Number(r.so_tien || 0), 0)
        }
      }

      // Thong tin ngan hang
      const tktt = (ks?.tai_khoan_thanh_toan || '').trim()
      const tkttLines = tktt.split('\n').map((l: string) => l.trim()).filter(Boolean)

      interface DataRow { ngay_date: string; ci: string; co: string; loai_phong: string; so_luong: number; don_gia: number }
      const dataRows: DataRow[] = []
      for (const ngay of (ngayRows || [])) {
        const { data: cpRows } = await supabase.from('doan_chi_phi').select('mo_ta, don_gia, so_luong').eq('doan_id', doan_id).eq('danh_muc', 'khach_san').eq('ref_doan_ngay_id', ngay.id)
        const co = addOneDay(ngay.ngay_date)
        if (!cpRows || cpRows.length === 0) {
          dataRows.push({ ngay_date: ngay.ngay_date, ci: ngay.ngay_date, co, loai_phong: '', so_luong: 0, don_gia: 0 })
        } else {
          for (const cp of cpRows) dataRows.push({ ngay_date: ngay.ngay_date, ci: ngay.ngay_date, co, loai_phong: cp.mo_ta || '', so_luong: cp.so_luong || 0, don_gia: cp.don_gia || 0 })
        }
      }

      interface NgayGroup { date: string; rows: DataRow[] }
      const ngayGroups: NgayGroup[] = []
      for (const row of dataRows) {
        const last = ngayGroups[ngayGroups.length - 1]
        if (last && last.date === row.ngay_date) last.rows.push(row)
        else ngayGroups.push({ date: row.ngay_date, rows: [row] })
      }

      const totalRows = dataRows.length
      const rs = totalRows > 1 ? totalRows : undefined
      const tableDataRows: TableRow[] = []
      let gi = 0

      for (const group of ngayGroups) {
        const ngayRs = group.rows.length > 1 ? group.rows.length : undefined
        for (let i = 0; i < group.rows.length; i++) {
          const row = group.rows[i]
          const isFirst = gi === 0
          const isFirstInNgay = i === 0
          const thanhTien = row.don_gia * row.so_luong
          const cells: TableCell[] = []

          if (isFirst) {
            cells.push(C(p(t(doan.ten_doan || '', { bold: true, size: 18 }), AlignmentType.CENTER), { rs, w: CW[0] }))
            cells.push(C(p(t(String(doan.so_khach || ''), { bold: true, size: 18 }), AlignmentType.CENTER), { rs, w: CW[1] }))
          }
          if (isFirstInNgay) {
            cells.push(C(p(t(fmtDate(row.ci), { size: 18 }), AlignmentType.CENTER), { rs: ngayRs, w: CW[2] }))
            cells.push(C(p(t(fmtDate(row.co), { size: 18 }), AlignmentType.CENTER), { rs: ngayRs, w: CW[3] }))
          }
          if (isFirst) {
            cells.push(C(p(t(ks?.ten || '', { bold: true, size: 18 }), AlignmentType.CENTER), { rs, w: CW[4] }))
            cells.push(C(p(t(maCode, { size: 18 }), AlignmentType.CENTER), { rs, w: CW[5] }))
          }
          cells.push(C(p(t(row.loai_phong || '', { size: 18 }), AlignmentType.CENTER), { w: CW[6] }))
          if (isFirstInNgay) cells.push(C(p(t('1', { size: 18 }), AlignmentType.CENTER), { rs: ngayRs, w: CW[7] }))
          cells.push(C(p(t(String(row.so_luong || ''), { size: 18 }), AlignmentType.CENTER), { w: CW[8] }))
          if (isFirst) cells.push(C(p(t(foc, { size: 18 }), AlignmentType.CENTER), { rs, w: CW[9] }))
          cells.push(C(p(t(fmt(row.don_gia), { size: 18 }), AlignmentType.RIGHT), { w: CW[10] }))
          cells.push(C(p(t(fmt(thanhTien), { size: 18 }), AlignmentType.RIGHT), { w: CW[11] }))

          if (isFirst) {
            // CW[12]: coc truong hop
            if (laCoc) {
              // TH1: Dang gui coc -> hien so tien coc (= tongTT), Tong TT = tongTT
              cells.push(C(p(t(fmt(tongTT), { color: 'FF0000', size: 18 }), AlignmentType.RIGHT), { rs, w: CW[12] }))
              cells.push(C(p(t(fmt(tongTT), { bold: true, size: 18 }), AlignmentType.RIGHT), { rs, w: CW[13] }))
            } else {
              // TH2: Thanh toan phan con lai hoac toan bo
              // Da coc = daCocTruoc (neu co), Tong TT = tongTT
              cells.push(C(p(t(daCocTruoc > 0 ? fmt(daCocTruoc) : '—', { color: daCocTruoc > 0 ? 'FF0000' : '000000', size: 18 }), AlignmentType.RIGHT), { rs, w: CW[12] }))
              cells.push(C(p(t(fmt(tongTT), { bold: true, size: 18 }), AlignmentType.RIGHT), { rs, w: CW[13] }))
            }

            // Thong tin ngan hang
            const nccChildren = tkttLines.length > 0
              ? tkttLines.map((line: string) => p(t(line, { size: 16 }), AlignmentType.CENTER))
              : [p(t('—', { size: 16 }), AlignmentType.CENTER)]
            cells.push(C(nccChildren, { rs, w: CW[14] }))
          }

          tableDataRows.push(new TableRow({ children: cells }))
          gi++
        }
      }
      return { rows: tableDataRows, laCoc }
    }

    // Bang ky ten
    const makeSignatureTable = () => {
      const sigW = Math.floor(TW / 5)
      const sigCols = ['NGƯỜI ĐỀ NGHỊ', 'TRƯỞNG BỘ PHẬN', 'KẾ TOÁN THANH TOÁN', 'KẾ TOÁN TRƯỞNG', 'GIÁM ĐỐC']
      const sigNames = ['', 'VÕ THỊ MINH XUÂN', 'TRẦN THỊ ÁNH HỒNG', 'NGUYỄN CHÍ LINH', 'NGUYỄN TIẾN DŨNG']
      return new Table({
        width: { size: TW, type: WidthType.DXA },
        columnWidths: Array(5).fill(sigW),
        borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideH: { style: BorderStyle.NONE, size: 0 }, insideV: { style: BorderStyle.NONE, size: 0 } },
        rows: [
          new TableRow({ children: sigCols.map((label) => C([p(t(label, { bold: true, size: 18 }), AlignmentType.CENTER), p(t('(Ký, ghi rõ họ tên)', { italic: true, size: 16 }), AlignmentType.CENTER)], { noBorder: true, w: sigW })) }),
          new TableRow({ height: { value: 800, rule: HeightRule.EXACT }, children: sigCols.map(() => C(p(t('')), { noBorder: true, w: sigW })) }),
          new TableRow({ children: sigNames.map((name) => C(p(t(name, { bold: true, size: 18, italic: true }), AlignmentType.CENTER), { noBorder: true, w: sigW })) }),
        ]
      })
    }

    // Thu thap tat ca rows — moi DNTT co the co la_coc khac nhau
    // Nhom theo la_coc de tao bang rieng neu can, nhung o day gop chung 1 bang
    // Dung la_coc cua DNTT dau tien
    const allTableRows: TableRow[] = []
    let firstLaCoc = false
    for (let i = 0; i < ids.length; i++) {
      const result = await buildTableRows(ids[i])
      if (i === 0) firstLaCoc = result.laCoc
      allTableRows.push(...result.rows)
    }

    const allChildren: (Paragraph | Table)[] = [
      p(t('CÔNG TY TNHH DU LỊCH S8', { bold: true, size: 24 }), AlignmentType.LEFT),
      p(t('MST: 0402021137', { size: 18 }), AlignmentType.LEFT),
      p(t('Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam', { size: 18 }), AlignmentType.LEFT),
      p(t('Email: s8travel.hddt@gmail.com', { size: 18 }), AlignmentType.LEFT),
      p(t(fmtDateVN(), { italic: true, size: 18 }), AlignmentType.RIGHT),
      emptyP(),
      p(t('GIẤY ĐỀ NGHỊ THANH TOÁN KHÁCH SẠN', { bold: true, size: 28 }), AlignmentType.CENTER),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 120 }, children: [t('Đoàn: ' + (doan.ten_doan || ''), { size: 22 })] }),
      p([t('Kính gửi: ', { bold: true, size: 20 }), t('Giám đốc công ty TNHH du lịch S8 Travel', { size: 20 })]),
      p([t('Lý do thanh toán: ', { bold: true, size: 20 }), t('Thanh toán tiền phòng khách sạn', { size: 20 })]),
      emptyP(),
      new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: CW, rows: [makeHeaderRow(firstLaCoc), ...allTableRows] }),
      emptyP(),
      emptyP(),
      makeSignatureTable(),
    ]

    const doc = new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 600, right: 600, bottom: 600, left: 600 } } }, children: allChildren }] })
    const buffer = await Packer.toBuffer(doc)
    const filename = (doan.ten_doan ?? 'dntt') + '_DNTT_KS.docx'
    return new Response(buffer, { headers: { ...corsHeaders, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"' } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Edge function error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
