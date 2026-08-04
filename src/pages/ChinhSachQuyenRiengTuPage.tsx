// Trang CHÍNH SÁCH QUYỀN RIÊNG TƯ — public (không cần đăng nhập), phục vụ App
// Review của Meta: điền vào 3 ô "URL chính sách quyền riêng tư" / "Xóa dữ liệu
// người dùng" (#xoa-du-lieu) / "URL Điều khoản dịch vụ" (#dieu-khoan) trong
// Cài đặt app trên developers.facebook.com. Song ngữ Việt–Anh (reviewer Meta
// đọc phần EN). Nội dung tĩnh, KHÔNG dùng t() — trang đứng ngoài i18n nội bộ.

import type { ReactNode } from "react";

const UPDATED_AT = "04/08/2026";

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function ChinhSachQuyenRiengTuPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        <header className="space-y-1 border-b pb-5">
          <h1 className="text-2xl font-bold">Chính sách quyền riêng tư</h1>
          <p className="text-sm text-muted-foreground">
            Privacy Policy — Hệ thống quản trị S8 Travel (S8 Travel CRM) · Cập nhật: {UPDATED_AT}
          </p>
        </header>

        {/* ─── TIẾNG VIỆT ─────────────────────────────────────────────── */}
        <Section title="1. Giới thiệu">
          <p>
            S8 Travel CRM là hệ thống quản trị nội bộ của <strong>Công ty TNHH Du lịch S8</strong>{" "}
            (&quot;chúng tôi&quot;), dùng để tiếp nhận và chăm sóc yêu cầu tư vấn du lịch của khách hàng.
            Hệ thống tích hợp với nền tảng Meta (Facebook) để tiếp nhận tin nhắn gửi tới các trang
            (fanpage) của chúng tôi và thông tin khách hàng để lại trên quảng cáo Facebook.
          </p>
        </Section>

        <Section title="2. Dữ liệu chúng tôi thu thập">
          <p>Khi bạn nhắn tin tới fanpage của S8 Travel hoặc điền form trên quảng cáo Facebook, chúng tôi tiếp nhận:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tên hiển thị trên Facebook của bạn;</li>
            <li>Mã định danh người nhắn theo trang (PSID) do Meta cấp;</li>
            <li>Nội dung tin nhắn bạn gửi tới fanpage và thời điểm gửi;</li>
            <li>Thông tin bạn tự điền vào form quảng cáo (họ tên, số điện thoại, email, nhu cầu du lịch);</li>
            <li>Fanpage mà bạn đã liên hệ.</li>
          </ul>
          <p>
            Chúng tôi <strong>không</strong> thu thập mật khẩu, danh bạ, vị trí, hình ảnh riêng tư
            hay bất kỳ dữ liệu nào ngoài phạm vi hội thoại với fanpage.
          </p>
        </Section>

        <Section title="3. Mục đích sử dụng">
          <ul className="list-disc pl-5 space-y-1">
            <li>Tiếp nhận, phản hồi và tư vấn yêu cầu đặt tour của bạn;</li>
            <li>Phân công nhân viên phụ trách chăm sóc và theo dõi tiến trình tư vấn;</li>
            <li>Thống kê nội bộ về hiệu quả kênh liên hệ.</li>
          </ul>
          <p>
            Chúng tôi <strong>không bán, không trao đổi, không chia sẻ</strong> dữ liệu của bạn cho bất kỳ
            bên thứ ba nào ngoài mục đích vận hành nêu trên.
          </p>
        </Section>

        <Section title="4. Lưu trữ và bảo mật">
          <p>
            Dữ liệu được lưu trên hệ quản trị cơ sở dữ liệu có kiểm soát truy cập; chỉ nhân viên được
            phân quyền của S8 Travel mới truy cập được. Mọi kết nối truyền dữ liệu đều qua HTTPS.
          </p>
        </Section>

        <Section title="5. Thời gian lưu trữ">
          <p>
            Dữ liệu được lưu trong thời gian cần thiết cho việc tư vấn và chăm sóc khách hàng,
            hoặc cho tới khi bạn yêu cầu xóa theo hướng dẫn dưới đây.
          </p>
        </Section>

        <Section id="xoa-du-lieu" title="6. Quyền của bạn — Hướng dẫn xóa dữ liệu">
          <p>Bạn có quyền yêu cầu xem, sửa hoặc xóa dữ liệu của mình. Để yêu cầu xóa dữ liệu:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nhắn tin nội dung <em>&quot;Yêu cầu xóa dữ liệu&quot;</em> tới chính fanpage bạn đã liên hệ; hoặc</li>
            <li>Gửi email tới <a className="text-primary underline" href="mailto:s8travel.op1.05@gmail.com">s8travel.op1.05@gmail.com</a> kèm tên Facebook đã dùng để nhắn tin.</li>
          </ul>
          <p>
            Chúng tôi sẽ xóa toàn bộ thông tin liên hệ và lịch sử tin nhắn của bạn khỏi hệ thống
            trong vòng <strong>30 ngày</strong> kể từ khi nhận yêu cầu và phản hồi xác nhận cho bạn.
          </p>
        </Section>

        <Section id="dieu-khoan" title="7. Điều khoản dịch vụ">
          <p>
            Việc bạn nhắn tin tới fanpage hoặc gửi thông tin qua quảng cáo của S8 Travel đồng nghĩa bạn
            đồng ý để chúng tôi sử dụng thông tin đó cho mục đích tư vấn dịch vụ du lịch như mô tả ở
            mục 3. Hệ thống chỉ phục vụ hoạt động kinh doanh hợp pháp của Công ty TNHH Du lịch S8;
            chúng tôi không dùng dữ liệu cho mục đích nào khác và có thể cập nhật chính sách này —
            bản mới nhất luôn được đăng tại trang này.
          </p>
        </Section>

        <Section title="8. Liên hệ">
          <p>
            Công ty TNHH Du lịch S8 · Email:{" "}
            <a className="text-primary underline" href="mailto:s8travel.op1.05@gmail.com">s8travel.op1.05@gmail.com</a>
          </p>
        </Section>

        {/* ─── ENGLISH ────────────────────────────────────────────────── */}
        <div className="border-t pt-6 space-y-8">
          <header className="space-y-1">
            <h1 className="text-xl font-bold">Privacy Policy (English)</h1>
            <p className="text-sm text-muted-foreground">S8 Travel CRM · Last updated: {UPDATED_AT}</p>
          </header>

          <Section title="1. Who we are">
            <p>
              S8 Travel CRM is the internal customer-care system of <strong>S8 Travel Co., Ltd</strong>{" "}
              (Vietnam). It integrates with Meta&apos;s platform to receive messages sent to our Facebook
              Pages and information customers submit through Facebook ads.
            </p>
          </Section>

          <Section title="2. Data we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>Your Facebook display name;</li>
              <li>Your Page-Scoped ID (PSID) issued by Meta;</li>
              <li>The content and time of messages you send to our Pages;</li>
              <li>Information you submit in lead forms (name, phone, email, travel request);</li>
              <li>Which of our Pages you contacted.</li>
            </ul>
            <p>We do <strong>not</strong> collect passwords, contact lists, location, or any data outside your conversation with our Pages.</p>
          </Section>

          <Section title="3. How we use it">
            <p>
              Solely to respond to and manage your travel inquiry: assigning a staff member, replying to
              your request, and internal statistics on contact channels. We <strong>never sell or share</strong>{" "}
              your data with third parties.
            </p>
          </Section>

          <Section title="4. Storage, security and retention">
            <p>
              Data is stored in an access-controlled database, reachable only by authorized S8 Travel
              staff over HTTPS, and kept only as long as needed for your inquiry or until you request deletion.
            </p>
          </Section>

          <Section id="data-deletion" title="5. Your rights — Data deletion instructions">
            <p>
              To have your data deleted, send the message <em>&quot;Delete my data&quot;</em> to the Facebook Page
              you contacted, or email{" "}
              <a className="text-primary underline" href="mailto:s8travel.op1.05@gmail.com">s8travel.op1.05@gmail.com</a>{" "}
              with the Facebook name you used. We will remove your contact information and message history
              within <strong>30 days</strong> and confirm back to you.
            </p>
          </Section>

          <Section title="6. Contact">
            <p>
              S8 Travel Co., Ltd · Email:{" "}
              <a className="text-primary underline" href="mailto:s8travel.op1.05@gmail.com">s8travel.op1.05@gmail.com</a>
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
