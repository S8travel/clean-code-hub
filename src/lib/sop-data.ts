// Nội dung Sổ tay điều hành (SOP) — quy trình vận hành, xử lý tình huống, checklist.
//
// Cố ý để TRONG CODE chứ không nằm ở DB: nội dung ổn định, ít đổi, và để trong
// repo thì mỗi lần sửa đều có lịch sử git + đi qua PR review. Muốn cho phép sửa
// trực tiếp trên web thì phải chuyển sang bảng DB + màn quản trị (xem README ở
// cuối file).
//
// Nội dung viết bằng tiếng Việt và KHÔNG bọc t(): đây là tài liệu nghiệp vụ nội
// bộ, dịch sang zh-TW là một quyết định riêng (hơn 300 chuỗi). Phần khung trang
// (ô tìm, tab, nhãn) thì vẫn dịch bình thường.

export type SopCat = "quy_trinh" | "tinh_huong" | "checklist";

export interface SopBuoc {
  title: string;
  note?: string;
}

export interface SopMuc {
  id: string;
  cat: SopCat;
  icon: string;
  title: string;
  sub: string;
  /** Quy trình: thứ tự ưu tiên (nếu có) */
  uuTien?: string[];
  /** Quy trình: các bước thực hiện */
  buoc?: SopBuoc[];
  /** Tình huống: mô tả bối cảnh */
  tinhHuong?: string;
  /** Tình huống: phương án xử lý theo thứ tự */
  cachXuLy?: string[];
  /** Tình huống: mẫu câu nói với khách */
  mauCau?: string;
  /** Checklist: các mục cần tick */
  items?: string[];
}

export const SOP_CAT_LABEL: Record<SopCat, string> = {
  quy_trinh: "Quy trình vận hành",
  tinh_huong: "Xử lý tình huống",
  checklist: "Checklist",
};

const QUY_TRINH: SopMuc[] = [
  {
    id: "qt-1", cat: "quy_trinh", icon: "📋",
    title: "I. Tiếp nhận đoàn",
    sub: "Nhận booking → kiểm tra thông tin ban đầu",
    buoc: [
      { title: "Xác định nguồn booking", note: "Đối tác (LINE) / Hệ thống / Email" },
      { title: "Kiểm tra code đoàn", note: "Khớp với booking gốc từ đối tác" },
      { title: "Xác nhận số khách", note: "Người lớn / trẻ em — đúng số lượng" },
      { title: "Đọc hành trình", note: "Kiểm tra từng ngày, địa điểm, dịch vụ" },
      { title: "Kiểm tra chuyến bay", note: "Số hiệu chuyến, giờ bay, sân bay đến/đi" },
      { title: "Ghi nhận yêu cầu đặc biệt", note: "Ăn chay, dị ứng, phòng đặc biệt, wheelchair..." },
    ],
  },
  {
    id: "qt-2", cat: "quy_trinh", icon: "🏨",
    title: "II. Đặt khách sạn",
    sub: "Kiểm tra → gửi booking → xác nhận confirm",
    uuTien: [
      "Khách sạn chỉ định (theo hợp đồng đối tác)",
      "Khách sạn công ty thường dùng",
      "Khách sạn đồng cấp (nếu 2 loại trên hết phòng)",
    ],
    buoc: [
      { title: "Kiểm tra hành trình & số đêm", note: "Xác nhận đúng ngày check-in / check-out" },
      { title: "Check tình trạng phòng", note: "Loại phòng: twin/double/triple — số lượng cần" },
      { title: "Gửi email booking", note: "Ghi đủ: code đoàn, ngày CI/CO, số phòng, loại phòng" },
      { title: "Nhận & kiểm tra confirm", note: "Đối chiếu: giá, hạng phòng, số phòng, COD" },
      { title: "Cập nhật bảng theo dõi", note: "Trạng thái: ĐÃ ĐẶT / CHỜ XÁC NHẬN / VẤN ĐỀ" },
    ],
  },
  {
    id: "qt-3", cat: "quy_trinh", icon: "🍽",
    title: "III. Đặt nhà hàng",
    sub: "Chọn nhà hàng → đặt menu → gửi booking",
    buoc: [
      { title: "Lựa chọn nhà hàng", note: "Tiêu chí: vị trí, sức chứa, mức giá, chất lượng" },
      { title: "Xác nhận menu", note: "Menu đoàn / Menu chay / Menu VIP" },
      { title: "Gửi booking", note: "Ghi: code đoàn, số khách, giờ ăn, menu" },
      { title: "Nhận confirm", note: "Xác nhận lại giờ ăn & số bàn được xếp" },
    ],
  },
  {
    id: "qt-4", cat: "quy_trinh", icon: "🎫",
    title: "IV. Đặt dịch vụ tour",
    sub: "Vé tham quan → cáp treo → du thuyền...",
    buoc: [
      { title: "Liệt kê dịch vụ cần đặt", note: "Đọc kỹ hành trình: Bà Nà, Fansipan, Ký Ức Hội An, du thuyền..." },
      { title: "Liên hệ nhà cung cấp", note: "Gửi yêu cầu: số lượng khách, ngày giờ, loại vé" },
      { title: "Nhận xác nhận & lưu vé", note: "Lưu file vé/QR vào thư mục Google Drive của đoàn" },
    ],
  },
  {
    id: "qt-5", cat: "quy_trinh", icon: "🔄",
    title: "V. Quản lý booking",
    sub: "Theo dõi thay đổi → quản lý COD",
    buoc: [
      { title: "Theo dõi tăng khách (pax up)", note: "Cập nhật lại phòng & nhà hàng ngay" },
      { title: "Theo dõi giảm khách (pax down)", note: "Thông báo ngay cho KS & nhà hàng" },
      { title: "Xử lý amend", note: "Ghi nhận rõ thay đổi & xác nhận lại với nhà cung cấp" },
      { title: "Nhắc final trước COD", note: "Liên hệ KS để xác nhận, không để quá hạn COD" },
      { title: "Xin gia hạn COD nếu cần", note: "Làm việc với KS sớm — ít nhất 2 ngày trước COD" },
    ],
  },
  {
    id: "qt-6", cat: "quy_trinh", icon: "✅",
    title: "VI. Final đoàn",
    sub: "Sau khi nhận FINAL từ đối tác",
    buoc: [
      { title: "Kiểm tra RML", note: "Đối chiếu số phòng, loại phòng, tên khách" },
      { title: "Xác nhận yêu cầu đặc biệt", note: "Ăn uống, phòng, dịch vụ thêm" },
      { title: "Gửi final cho khách sạn", note: "Đính kèm RML đầy đủ, xác nhận lại COD" },
      { title: "Gửi final cho nhà hàng", note: "Xác nhận số khách, giờ ăn, menu từng bữa" },
      { title: "Nhập chi phí bảng kê đoàn", note: "Cập nhật đầy đủ chi phí dịch vụ" },
      { title: "Làm đề nghị thanh toán", note: "Các dịch vụ cần thanh toán trước — làm ngay" },
    ],
  },
  {
    id: "qt-7", cat: "quy_trinh", icon: "📦",
    title: "VII. Chuẩn bị trước đoàn đến",
    sub: "Reconfirm → chuẩn bị hồ sơ HDV",
    buoc: [
      { title: "Reconfirm khách sạn", note: "Số phòng, giờ check-in, yêu cầu đặc biệt" },
      { title: "Reconfirm nhà hàng", note: "Giờ ăn, menu, số bàn" },
      { title: "Reconfirm xe & vé dịch vụ", note: "Giờ đón, điểm đón, lịch trình xe" },
      { title: "Chuẩn bị hồ sơ bàn giao HDV", note: "Biển đón, hợp đồng HDV, phiếu đánh giá tour" },
      { title: "Chuẩn bị tài liệu đoàn", note: "Menu, RML, điều tour tiếng Việt, heyueshu tiếng Trung" },
    ],
  },
  {
    id: "qt-8", cat: "quy_trinh", icon: "📡",
    title: "VIII. Theo dõi đoàn trong tour",
    sub: "Hỗ trợ HDV → xử lý phát sinh",
    buoc: [
      { title: "Hỗ trợ HDV xử lý tình huống", note: "Luôn online, phản hồi nhanh khi HDV liên hệ" },
      { title: "Xử lý khiếu nại", note: "Tiếp nhận → xác nhận → đề xuất phương án → báo quản lý" },
      { title: "Xử lý phát sinh", note: "Đổi nhà hàng, tăng/giảm khách, dị ứng thức ăn, sự cố xe..." },
    ],
  },
  {
    id: "qt-9", cat: "quy_trinh", icon: "📊",
    title: "IX. Sau khi đoàn kết thúc",
    sub: "Đối chiếu → quyết toán → đánh giá",
    buoc: [
      { title: "Đối chiếu chi phí", note: "So sánh chi phí thực tế với dự toán" },
      { title: "Quyết toán tour", note: "Hoàn tất hồ sơ trong vòng 3 ngày sau tour" },
      { title: "Đánh giá nhà cung cấp", note: "Ghi nhận chất lượng KS/nhà hàng/xe vào hồ sơ đối tác" },
    ],
  },
];

const TINH_HUONG: SopMuc[] = [
  {
    id: "th-1", cat: "tinh_huong", icon: "🚫",
    title: "Khách sạn không đủ phòng twin",
    sub: "KS chỉ còn phòng double hoặc hết phòng",
    tinhHuong:
      "Đoàn đặt phòng twin nhưng KS thông báo chỉ còn phòng double (1 giường đôi) hoặc không đủ phòng loại yêu cầu.",
    cachXuLy: [
      "Yêu cầu KS nối thêm giường phụ (extra bed) nếu có thể.",
      "Đề nghị KS nâng cấp phòng không thu phụ thu (upgrade complimentary).",
      "Liên hệ KS khác gần đó cùng hạng sao để chuyển một phần đoàn.",
      "Nếu không giải quyết được → báo ngay quản lý TRƯỚC khi thông báo khách.",
      "Không tự ý thông báo cho khách trước khi có phương án chắc chắn.",
    ],
    mauCau:
      "Anh/chị [Tên], về phòng nghỉ tối nay, bên em đã sắp xếp để anh/chị được nghỉ tại phòng [loại phòng thay thế]. Em đảm bảo sẽ không ảnh hưởng đến chất lượng chuyến đi. Nếu anh/chị có bất kỳ yêu cầu gì thêm, anh chị cứ cho em biết nhé!",
  },
  {
    id: "th-2", cat: "tinh_huong", icon: "🚪",
    title: "Phòng sai tầng / view yêu cầu",
    sub: "KS xếp phòng không đúng yêu cầu",
    tinhHuong:
      "Khách đã yêu cầu phòng view biển/tầng cao nhưng KS xếp phòng không đúng yêu cầu khi nhận phòng.",
    cachXuLy: [
      "HDV xác nhận lại yêu cầu ban đầu với KS (dẫn bằng email/xác nhận đã gửi).",
      "Yêu cầu lễ tân KS đổi phòng nếu còn phòng phù hợp.",
      "Nếu KS không thể đổi → báo điều hành để khấu trừ/bồi hoàn phần phụ thu (nếu khách đã trả thêm).",
      "Xin lỗi khách và giải thích lịch sự, không đổ lỗi cho KS trước mặt khách.",
    ],
    mauCau:
      "Em xin lỗi về sự bất tiện này. Em đang làm việc với khách sạn để sắp xếp lại phòng cho anh/chị ngay. Anh/chị vui lòng chờ em khoảng [X] phút nhé!",
  },
  {
    id: "th-3", cat: "tinh_huong", icon: "➕",
    title: "Khách yêu cầu dịch vụ ngoài chương trình",
    sub: "Spa, tour riêng, nhà hàng đặc biệt...",
    tinhHuong: "Trong tour, khách yêu cầu thêm hoạt động/dịch vụ không có trong chương trình.",
    cachXuLy: [
      "Lắng nghe và ghi nhận yêu cầu cụ thể của khách.",
      "Kiểm tra khả năng đáp ứng (liên hệ nhà cung cấp, hỏi giá).",
      "Báo giá rõ ràng cho khách TRƯỚC khi thực hiện — không làm trước rồi tính tiền sau.",
      "Nếu không thể đáp ứng → giải thích lý do và gợi ý phương án thay thế gần nhất.",
      "Ghi nhận vào nhật ký tour để điều hành theo dõi.",
    ],
    mauCau:
      "Anh/chị muốn [dịch vụ yêu cầu] — để em kiểm tra và báo lại anh/chị trong vòng [X] phút nhé. Em sẽ cố gắng sắp xếp tốt nhất có thể!",
  },
  {
    id: "th-4", cat: "tinh_huong", icon: "👥",
    title: "Khách muốn tách đoàn / đi riêng",
    sub: "Một số khách không theo lịch đoàn",
    tinhHuong: "Trong tour, một số khách muốn tự đi riêng không theo lịch đoàn.",
    cachXuLy: [
      "Giải thích lịch trình đoàn và ảnh hưởng đến cả nhóm nếu tách.",
      "Nếu khách vẫn muốn đi riêng: yêu cầu ký xác nhận tự chịu trách nhiệm cá nhân.",
      "Thống nhất điểm và giờ gặp lại cụ thể — ghi rõ vào nhật ký.",
      "Báo ngay cho điều hành biết.",
      "Không chịu trách nhiệm về chi phí phát sinh do khách tự đi.",
    ],
    mauCau:
      "Em hoàn toàn tôn trọng quyết định của anh/chị. Để đảm bảo an toàn, anh/chị vui lòng để lại thông tin liên lạc và mình hẹn gặp lại tại [địa điểm] lúc [giờ] nhé.",
  },
  {
    id: "th-5", cat: "tinh_huong", icon: "🚑",
    title: "Khách bị ốm / tai nạn trong tour",
    sub: "Tình huống khẩn cấp sức khỏe",
    tinhHuong: "Khách có vấn đề sức khỏe hoặc bị thương trong chuyến đi.",
    cachXuLy: [
      "Ưu tiên số 1: đảm bảo an toàn và sơ cứu ban đầu cho khách.",
      "Liên hệ cơ sở y tế gần nhất nếu cần thiết.",
      "Báo ngay cho quản lý công ty — không tự xử lý một mình.",
      "Kiểm tra bảo hiểm du lịch của khách và hỗ trợ làm thủ tục nếu cần.",
      "Thông báo cho thân nhân khách (nếu nghiêm trọng) sau khi có chỉ đạo từ quản lý.",
      "Ghi chép đầy đủ diễn biến, thời gian, hành động đã xử lý.",
    ],
    mauCau:
      "Anh/chị [Tên], em đang liên hệ hỗ trợ ngay cho anh/chị. Anh/chị cứ yên tâm, em sẽ ở đây cùng anh/chị. [Nếu cần: Em đã gọi xe/bác sĩ, sẽ đến trong khoảng X phút.]",
  },
  {
    id: "th-6", cat: "tinh_huong", icon: "🚌",
    title: "Xe đón trễ / nhà xe gặp sự cố",
    sub: "Xe không đến đúng giờ hẹn",
    tinhHuong: "Xe đón đoàn trễ hơn giờ hẹn hoặc xe gặp sự cố kỹ thuật.",
    cachXuLy: [
      "Liên hệ ngay với nhà xe để xác nhận tình trạng và thời gian dự kiến.",
      "Thông báo cho khách ngay — không để khách đợi mà không biết lý do.",
      "Nếu trễ quá 30 phút → tìm xe thay thế song song.",
      "Cập nhật liên tục cho khách mỗi 10–15 phút.",
      "Ghi nhận sự cố để đánh giá nhà xe sau tour.",
    ],
    mauCau:
      "Anh/chị ơi, xe đang bị [lý do] nên sẽ đến trễ khoảng [X] phút. Em xin lỗi vì sự bất tiện. Em đang theo dõi sát và sẽ cập nhật ngay khi có thông tin mới nhé!",
  },
  {
    id: "th-7", cat: "tinh_huong", icon: "😤",
    title: "Khách phàn nàn / khiếu nại",
    sub: "Không hài lòng về chất lượng dịch vụ",
    tinhHuong:
      "Khách phàn nàn về chất lượng dịch vụ (đồ ăn, phòng, phương tiện...) trong hoặc sau tour.",
    cachXuLy: [
      "Lắng nghe đến cùng — không ngắt lời hoặc biện hộ ngay lập tức.",
      'Xác nhận cảm xúc của khách: "Em hiểu anh/chị cảm thấy không thoải mái..."',
      "Xin lỗi về trải nghiệm không tốt — dù lỗi thuộc về ai.",
      "Đề xuất phương án xử lý cụ thể (không hứa hẹn chung chung).",
      "Báo cáo lại cho quản lý ngay sau khi xử lý xong.",
    ],
    mauCau:
      "Em thành thật xin lỗi vì trải nghiệm chưa tốt này. Em hiểu anh/chị cảm thấy [cảm xúc] và điều đó hoàn toàn có lý. Để khắc phục, em sẽ [phương án cụ thể]. Anh/chị thấy như vậy được không ạ?",
  },
];

const CHECKLIST: SopMuc[] = [
  {
    id: "cl-1", cat: "checklist", icon: "📋",
    title: "Checklist nhận đoàn",
    sub: "Tick đủ trước khi bắt đầu xử lý",
    items: [
      "Kiểm tra code đoàn — khớp với booking gốc",
      "Kiểm tra hành trình đầy đủ từng ngày",
      "Kiểm tra chuyến bay (số hiệu, giờ bay, sân bay)",
      "Xác nhận số khách (người lớn / trẻ em)",
      "Ghi nhận yêu cầu đặc biệt",
    ],
  },
  {
    id: "cl-2", cat: "checklist", icon: "🏨",
    title: "Checklist khách sạn",
    sub: "Đảm bảo đặt phòng hoàn chỉnh",
    items: [
      "Check tình trạng phòng theo hành trình",
      "Gửi email booking đầy đủ thông tin",
      "Nhận confirm từ khách sạn",
      "Đối chiếu confirm (giá, hạng phòng, số phòng, COD)",
      "Cập nhật bảng theo dõi đoàn",
    ],
  },
  {
    id: "cl-3", cat: "checklist", icon: "🍽",
    title: "Checklist nhà hàng",
    sub: "Xác nhận trước khi đoàn đến",
    items: [
      "Lựa chọn nhà hàng phù hợp hành trình",
      "Xác nhận menu (đoàn / chay / VIP)",
      "Gửi booking cho nhà hàng",
      "Nhận confirm (giờ ăn, số bàn, menu)",
    ],
  },
  {
    id: "cl-4", cat: "checklist", icon: "✅",
    title: "Checklist final đoàn",
    sub: "Hoàn tất trước ngày khởi hành",
    items: [
      "Nhận RML từ đối tác — kiểm tra kỹ",
      "Gửi final cho khách sạn kèm RML",
      "Gửi final cho nhà hàng",
      "Xác nhận toàn bộ dịch vụ tour",
      "Nhập chi phí vào bảng kê đoàn",
      "Làm đề nghị thanh toán (nếu cần)",
    ],
  },
  {
    id: "cl-5", cat: "checklist", icon: "🤝",
    title: "Checklist bàn giao HDV",
    sub: "Đủ hồ sơ trước khi đoàn xuất phát",
    items: [
      "Chương trình tour (điều tour tiếng Việt)",
      "Danh sách khách đầy đủ",
      "Rooming list (RML) đã xác nhận",
      "Menu đoàn từng bữa",
      "Danh sách nhà hàng theo ngày",
      "Biển đón đoàn",
      "Hợp đồng với HDV đã ký",
      "Phiếu đánh giá tour",
      "Heyueshu tiếng Trung (nếu cần)",
    ],
  },
  {
    id: "cl-6", cat: "checklist", icon: "📡",
    title: "Checklist theo dõi đoàn",
    sub: "Theo dõi trong suốt quá trình tour",
    items: [
      "Xác nhận HDV check-in khách sạn thành công",
      "Xác nhận HDV check nhà hàng (menu đúng, đủ bàn)",
      "Theo dõi & xử lý phát sinh trong tour",
    ],
  },
  {
    id: "cl-7", cat: "checklist", icon: "📊",
    title: "Checklist sau tour",
    sub: "Hoàn tất trong vòng 3 ngày",
    items: [
      "Đối chiếu chi phí thực tế với dự toán",
      "Hoàn tất quyết toán tour (trong 3 ngày)",
      "Đánh giá chất lượng dịch vụ (KS / nhà hàng / xe)",
    ],
  },
];

export const SOP_DATA: SopMuc[] = [...QUY_TRINH, ...TINH_HUONG, ...CHECKLIST];
