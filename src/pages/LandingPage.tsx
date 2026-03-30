import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Star, ChevronRight, Menu, X, Plane, Hotel, Camera, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-travel.jpg";
import destHalong from "@/assets/dest-halong.jpg";
import destHoian from "@/assets/dest-hoian.jpg";
import destSapa from "@/assets/dest-sapa.jpg";
import destDanang from "@/assets/dest-danang.jpg";
import destPhuquoc from "@/assets/dest-phuquoc.jpg";

const destinations = [
  { name: "Vịnh Hạ Long", desc: "Di sản thiên nhiên thế giới", img: destHalong, price: "3.500.000 ₫" },
  { name: "Phố cổ Hội An", desc: "Thành phố đèn lồng", img: destHoian, price: "2.800.000 ₫" },
  { name: "Sa Pa", desc: "Ruộng bậc thang tuyệt đẹp", img: destSapa, price: "4.200.000 ₫" },
  { name: "Đà Nẵng", desc: "Thành phố đáng sống", img: destDanang, price: "3.100.000 ₫" },
  { name: "Phú Quốc", desc: "Đảo ngọc phương Nam", img: destPhuquoc, price: "5.500.000 ₫" },
];

const stats = [
  { icon: Users, value: "10,000+", label: "Khách hàng" },
  { icon: MapPin, value: "50+", label: "Điểm đến" },
  { icon: Plane, value: "200+", label: "Tour mỗi năm" },
  { icon: Star, value: "4.9", label: "Đánh giá" },
];

const services = [
  { icon: Plane, title: "Tour trọn gói", desc: "Lịch trình được thiết kế chuyên nghiệp, bao gồm vé máy bay, khách sạn và ăn uống." },
  { icon: Hotel, title: "Đặt khách sạn", desc: "Hệ thống khách sạn 3-5 sao được chọn lọc kỹ lưỡng tại mọi điểm đến." },
  { icon: Camera, title: "Trải nghiệm độc đáo", desc: "Khám phá văn hóa địa phương với hướng dẫn viên bản ngữ giàu kinh nghiệm." },
  { icon: Users, title: "Đoàn riêng", desc: "Tổ chức tour riêng cho công ty, gia đình với lịch trình tùy chỉnh linh hoạt." },
];

const testimonials = [
  { name: "Nguyễn Minh Anh", role: "Doanh nhân", text: "S8 Travel tổ chức tour cho công ty chúng tôi rất chuyên nghiệp. Mọi thứ được sắp xếp chu đáo từ A đến Z.", rating: 5 },
  { name: "Trần Văn Hùng", role: "Kỹ sư", text: "Chuyến đi Hạ Long cùng gia đình tuyệt vời! Hướng dẫn viên nhiệt tình, dịch vụ 5 sao.", rating: 5 },
  { name: "Lê Thị Hương", role: "Giáo viên", text: "Đã đi 3 tour với S8 Travel và lần nào cũng hài lòng. Giá cả hợp lý, trải nghiệm tuyệt vời.", rating: 5 },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md shadow-sm border-b border-border" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">S8</div>
              <span className={`font-bold text-lg ${scrolled ? "text-foreground" : "text-white"}`}>Travel</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              {["Điểm đến", "Dịch vụ", "Về chúng tôi", "Liên hệ"].map((item) => (
                <a key={item} href={`#${item.toLowerCase().replace(/\s/g, "-")}`} className={`text-sm font-medium transition-colors hover:text-primary ${scrolled ? "text-foreground" : "text-white/90"}`}>
                  {item}
                </a>
              ))}
              <Button size="sm" className="rounded-full px-6">Đặt tour ngay</Button>
            </div>
            <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className={scrolled ? "text-foreground" : "text-white"} /> : <Menu className={scrolled ? "text-foreground" : "text-white"} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-background border-t border-border p-4 space-y-3">
            {["Điểm đến", "Dịch vụ", "Về chúng tôi", "Liên hệ"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/\s/g, "-")}`} className="block text-sm font-medium text-foreground" onClick={() => setMenuOpen(false)}>
                {item}
              </a>
            ))}
            <Button size="sm" className="w-full rounded-full">Đặt tour ngay</Button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="Vietnam landscape" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
        </div>
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-white/80 text-sm tracking-[0.3em] uppercase mb-4">
            Khám phá Việt Nam
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-tight mb-6">
            Hành trình<br />
            <span className="text-amber-400">tuyệt vời</span> bắt đầu
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="text-white/80 text-lg max-w-2xl mx-auto mb-8">
            Trải nghiệm du lịch đẳng cấp cùng S8 Travel — Đối tác tin cậy cho mọi chuyến đi.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="rounded-full px-8 text-base">
              Khám phá tour <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8 text-base bg-white/10 border-white/30 text-white hover:bg-white/20">
              Liên hệ tư vấn
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <s.icon className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm opacity-80">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destinations */}
      <section id="điểm-đến" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-2">Điểm đến nổi bật</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Khám phá vẻ đẹp Việt Nam</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {destinations.slice(0, 3).map((d, i) => (
              <motion.div key={d.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                className="group rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-shadow">
                <div className="relative h-56 overflow-hidden">
                  <img src={d.img} alt={d.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-semibold text-primary">{d.price}</div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-foreground">{d.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{d.desc}</p>
                  <Button variant="link" className="px-0 mt-2 text-primary">
                    Xem chi tiết <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            {destinations.slice(3).map((d, i) => (
              <motion.div key={d.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                className="group rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-shadow">
                <div className="relative h-56 overflow-hidden">
                  <img src={d.img} alt={d.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-semibold text-primary">{d.price}</div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-foreground">{d.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{d.desc}</p>
                  <Button variant="link" className="px-0 mt-2 text-primary">
                    Xem chi tiết <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="dịch-vụ" className="py-20 px-4 bg-muted/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-2">Dịch vụ</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Chúng tôi mang đến gì?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((s, i) => (
              <motion.div key={s.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card rounded-2xl p-6 border border-border hover:shadow-md transition-shadow text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-2">Đánh giá</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Khách hàng nói gì?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card rounded-2xl p-6 border border-border">
                <div className="flex gap-1 mb-3">
                  {[...Array(t.rating)].map((_, j) => <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-sm text-muted-foreground mb-4 italic">"{t.text}"</p>
                <div>
                  <p className="font-semibold text-foreground text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="liên-hệ" className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Sẵn sàng cho chuyến đi tiếp theo?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Liên hệ ngay để được tư vấn miễn phí và nhận báo giá tour phù hợp nhất.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              <span className="font-medium">0909 123 456</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              <span className="font-medium">info@s8travel.vn</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <span className="font-medium">TP. Hồ Chí Minh</span>
            </div>
          </div>
          <Button size="lg" variant="secondary" className="rounded-full px-8 text-base">
            Nhận tư vấn miễn phí
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">S8</div>
            <span className="font-bold">Travel</span>
          </div>
          <p className="text-sm text-background/60">© 2026 S8 Travel. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
