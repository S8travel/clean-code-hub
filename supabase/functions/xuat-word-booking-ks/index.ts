// Xuất Word 訂房確認單 (bản xác nhận đặt phòng gửi khách/đối tác) cho một đoàn.
// Mỗi khách sạn chiếm 3 dòng: tên · loại phòng (đỏ) · website; cột trái gộp "HOTEL".
//
// ⚠️ TRẠNG THÁI (rà 05/09/2026): còn ACTIVE trên prod nhưng KHÔNG tìm thấy nơi gọi
// trong repo CRM (0 lượt gọi trong log 24h). Có thể là bản tiền nhiệm của
// `xuat-word-dntt-ks`. Đừng xoá trên prod khi chưa xác minh cổng đối tác
// (repo s8-agent-portal) không dùng.
//
// 🔒 ĐÃ VÁ 05/09/2026 — LỖ RÒ DỮ LIỆU. Hàm chạy bằng SERVICE_ROLE_KEY (bỏ qua toàn
// bộ RLS) mà không hỏi người gọi là ai, chỉ nhận `doan_id` từ body. Đã kiểm chứng
// thật: gọi bằng publishable key (nằm sẵn trong bundle web, ai mở trình duyệt cũng
// có) tải về được file .docx 9 KB của đoàn 704 — tên đoàn, khách sạn, địa điểm, số
// điện thoại, loại phòng. Đổi số doan_id là ra đoàn khác, hệ thống có 748 đoàn.
// `verify_jwt = true` KHÔNG chặn được vì gateway tính publishable key là JWT hợp lệ
// (role "anon") — xem supabase/functions/extract-chuong-trinh/index.ts.
// Nay bắt buộc token phải thuộc một NGƯỜI đăng nhập (hỏi /auth/v1/user).
//
// Nguồn phòng/đêm: `doan_booking_ks.ks_final` (chưa có thì `ks_dat_truoc`) — text
// nhiều dòng, mỗi dòng một đêm. Bảng `doan_ks_dem` là bảng chết, đừng đọc.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageOrientation } from 'npm:docx@9.5.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Bản trên prod khai `any` ở 6 chỗ; ở đây khai tường minh để hợp quy ước repo
// (eslint cấm `any`) — hành vi runtime không đổi.
type KhachSan = {
  id: number
  ten: string | null
  dia_diem: string | null
  so_dien_thoai: string | null
  website: string | null
}
type NgayRow = {
  ngay_date: string
  ngay_so: number | null
  khach_san_id: number
  khach_san: KhachSan | null
}
type BookingKSRow = {
  id: number
  khach_san_id: number
  ks_dat_truoc: string | null
  ks_final: string | null
}
type TextOpt = { size?: number; bold?: boolean; color?: string; italic?: boolean }
type CellOpt = {
  fill?: string
  va?: (typeof VerticalAlign)[keyof typeof VerticalAlign]
  cs?: number
  rs?: number
  w?: number
}

// Token phải thuộc về một NGƯỜI đang đăng nhập. Publishable key qua được verify_jwt
// nhưng /auth/v1/user trả 401 cho nó — đó là chỗ chặn thật.
async function nguoiDangNhap(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
  if (!supabaseUrl) return false
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const user = await res.json()
    return Boolean(user?.id)
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!(await nguoiDangNhap(req))) {
    return new Response(JSON.stringify({ error: 'Cần đăng nhập để tải bản đặt phòng' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json()
    const doan_id = body.doan_id
    const booking_ids: number[] = body.booking_ids || []

    if (!doan_id) {
      return new Response(JSON.stringify({ error: 'doan_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: doan, error: doanErr } = await supabase
      .from('doan').select('ten_doan').eq('id', doan_id).single()
    if (doanErr) return new Response(JSON.stringify({ error: 'Loi doan: ' + doanErr.message }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: ngayRows, error: ngayErr } = await supabase
      .from('doan_ngay')
      .select('ngay_date, ngay_so, khach_san_id, khach_san:khach_san_id(id, ten, dia_diem, so_dien_thoai, website)')
      .eq('doan_id', doan_id)
      .not('khach_san_id', 'is', null)
      .order('ngay_date', { ascending: true })
    if (ngayErr) return new Response(JSON.stringify({ error: 'Loi ngay: ' + ngayErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: bkRows, error: bkErr } = await supabase
      .from('doan_booking_ks').select('id, khach_san_id, ks_dat_truoc, ks_final').eq('doan_id', doan_id)
    if (bkErr) return new Response(JSON.stringify({ error: 'Loi booking: ' + bkErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const bookings: BookingKSRow[] = bkRows || []
    const bkMap: Record<number, BookingKSRow> = {}
    for (const bk of bookings) bkMap[bk.khach_san_id] = bk

    let rows: NgayRow[] = ngayRows || []
    if (booking_ids.length > 0) {
      const validKsIds = bookings.filter(bk => booking_ids.includes(bk.id)).map(bk => bk.khach_san_id)
      rows = rows.filter(r => validKsIds.includes(r.khach_san_id))
    }

    if (rows.length === 0) return new Response(JSON.stringify({ error: 'Khong co du lieu' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const bS = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
    const AB = { top: bS, bottom: bS, left: bS, right: bS }
    const CM = { top: 80, bottom: 80, left: 120, right: 120 }
    const TW = 14400
    const CW = [900, 1400, 1600, 7800, 2700]

    const t = (text: string, o: TextOpt = {}) => new TextRun({
      text: String(text ?? ''), font: 'Arial', size: o.size ?? 18,
      bold: o.bold ?? false, color: o.color ?? '000000', italic: o.italic ?? false
    })
    const p = (runs: TextRun | TextRun[], align = AlignmentType.LEFT) =>
      new Paragraph({ alignment: align, children: Array.isArray(runs) ? runs : [runs] })
    const C = (children: Paragraph | Paragraph[], o: CellOpt = {}) => new TableCell({
      borders: AB,
      shading: { fill: o.fill ?? 'FFFFFF', type: ShadingType.CLEAR },
      margins: CM,
      verticalAlign: o.va ?? VerticalAlign.CENTER,
      columnSpan: o.cs, rowSpan: o.rs,
      width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
      children: Array.isArray(children) ? children : [children],
    })

    const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth()+1}/${d.getDate()}` }

    const nTotal = rows.length * 3
    const tableRows: TableRow[] = []

    rows.forEach((r: NgayRow, i: number) => {
      const ks: Partial<KhachSan> = r.khach_san || {}
      const bk: Partial<BookingKSRow> = bkMap[r.khach_san_id] || {}
      const loaiPhong = bk.ks_final || bk.ks_dat_truoc || ''
      const isFirst = i === 0
      const rowA: TableCell[] = []
      if (isFirst) rowA.push(C(p(t('HOTEL', { bold: true }), AlignmentType.CENTER), { rs: nTotal, w: CW[0], va: VerticalAlign.CENTER }))
      rowA.push(
        C(p(t(fmtDate(r.ngay_date)), AlignmentType.CENTER), { rs: 3, w: CW[1], va: VerticalAlign.CENTER }),
        C(p(t(ks.dia_diem ?? ''), AlignmentType.CENTER), { rs: 3, w: CW[2], va: VerticalAlign.CENTER }),
        C(p(t(ks.ten ?? '', { bold: true }), AlignmentType.CENTER), { w: CW[3] }),
        C(p(t(ks.so_dien_thoai ?? '', { size: 16 }), AlignmentType.CENTER), { rs: 3, w: CW[4], va: VerticalAlign.CENTER }),
      )
      tableRows.push(new TableRow({ children: rowA }))
      tableRows.push(new TableRow({ children: [C(p(t(loaiPhong, { bold: true, color: 'FF0000' }), AlignmentType.CENTER), { w: CW[3] })] }))
      tableRows.push(new TableRow({ children: [C(p(t(ks.website ?? '', { color: '0563C1', size: 16 }), AlignmentType.CENTER), { w: CW[3] })] }))
    })

    const totalPhong = rows.map((r: NgayRow) => { const bk: Partial<BookingKSRow> = bkMap[r.khach_san_id] || {}; return bk.ks_final || bk.ks_dat_truoc || '' }).filter(Boolean).join(', ')

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            // LANDSCAPE: pass portrait dimensions (short=width, long=height), library swaps internally
            size: {
              width: 11906,   // short edge (A4 portrait width)
              height: 16838,  // long edge (A4 portrait height)
              orientation: PageOrientation.LANDSCAPE
            },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: [
          p(t('S8 TRAVEL LTD.  雙發旅遊', { bold: true, size: 22 }), AlignmentType.CENTER),
          p(t(' ')),
          p(t('訂房確認單', { bold: true, size: 44 }), AlignmentType.CENTER),
          p(t(' ')),
          new Table({
            width: { size: TW, type: WidthType.DXA },
            columnWidths: CW,
            rows: [
              new TableRow({ children: [
                C(p(t('圖號', { bold: true }), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[0] }),
                C(p(t(doan.ten_doan ?? '', { bold: true }), AlignmentType.CENTER), { cs: 4 }),
              ]}),
              new TableRow({ children: [
                C(p(t(''), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[0] }),
                C(p(t('入住日', { bold: true }), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[1] }),
                C(p(t('地點', { bold: true }), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[2] }),
                C(p(t('飯店/網址', { bold: true }), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[3] }),
                C(p(t('TEL', { bold: true }), AlignmentType.CENTER), { fill: 'D9D9D9', w: CW[4] }),
              ]}),
              ...tableRows,
              new TableRow({ children: [
                C(p(t('TOTAL:', { bold: true }), AlignmentType.LEFT), { fill: 'D9D9D9', cs: 2, w: CW[0]+CW[1] }),
                C(p(t(totalPhong, { bold: true, color: 'FF0000' }), AlignmentType.CENTER), { cs: 3 }),
              ]}),
              new TableRow({ children: [
                C(p(t('D/L:', { bold: true }), AlignmentType.LEFT), { fill: 'D9D9D9', cs: 2, w: CW[0]+CW[1] }),
                C(p(t('')), { cs: 3 }),
              ]}),
            ]
          }),
          p(t(' ')),
          p(t('飯店一經FINAL（包含給名單及正確房數）後取消，請注意各飯店的不同產生不同取消費用，屆時請見諒！！', { size: 20, bold: true })),
        ]
      }]
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = `${doan.ten_doan ?? 'booking'}_訂房確認單.docx`

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      }
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Edge function error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
