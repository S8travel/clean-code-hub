import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useNguoiDungByEmail } from "@/hooks/use-nguoi-dung";
import { hashPassword } from "@/lib/crypto";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setEmail } = useCurrentUserEmail();
  const [inputEmail, setInputEmail] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data: user, isLoading } = useNguoiDungByEmail(submitted ? inputEmail.trim().toLowerCase() : null);

  const handleLogin = () => {
    const email = inputEmail.trim().toLowerCase();
    if (!email || !inputPassword) return;
    setSubmitted(true);
  };

  useEffect(() => {
    if (!submitted || isLoading) return;

    const verify = async () => {
      setChecking(true);
      try {
        if (!user) {
          toast.error("Email không tồn tại trong hệ thống");
          setSubmitted(false);
          return;
        }
        if (!user.active) {
          toast.error("Tài khoản đã bị vô hiệu hoá");
          setSubmitted(false);
          return;
        }

        // Kiểm tra mật khẩu nếu đã được đặt
        if (user.password_hash) {
          const hash = await hashPassword(inputPassword);
          if (hash !== user.password_hash) {
            toast.error("Mật khẩu không đúng");
            setInputPassword("");
            setSubmitted(false);
            return;
          }
        }
        // Nếu chưa đặt password → cho qua (admin chưa cấu hình)
        setEmail(inputEmail.trim().toLowerCase());
        navigate("/dashboard", { replace: true });
      } finally {
        setChecking(false);
      }
    };

    verify();
  }, [submitted, isLoading, user]);

  const isPending = isLoading || checking;

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a3d7c] flex-col items-center justify-center gap-6 p-12">
        <img
          src="/logo.jpg"
          alt="S8 Travel"
          className="w-52 h-52 object-contain drop-shadow-xl"
        />
        <div className="text-center text-white space-y-2">
          <h1 className="text-3xl font-bold tracking-wide">S8 TRAVEL</h1>
          <p className="text-blue-200 text-sm">Hệ thống quản lý nội bộ</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo nhỏ trên mobile */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <img
              src="/logo.jpg"
              alt="S8 Travel"
              className="w-20 h-20 object-contain"
            />
            <p className="font-bold text-lg text-[#0a3d7c]">S8 TRAVEL</p>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Đăng nhập</h2>
            <p className="text-sm text-muted-foreground">Nhập thông tin tài khoản để truy cập</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@s8travel.vn"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && document.getElementById("password")?.focus()}
                className="h-10"
                autoFocus
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="h-10 pr-10"
                  disabled={isPending}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              className="w-full h-10 bg-[#0a3d7c] hover:bg-[#0a3d7c]/90"
              onClick={handleLogin}
              disabled={!inputEmail.trim() || !inputPassword || isPending}
            >
              {isPending ? "Đang kiểm tra..." : "Đăng nhập"}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Liên hệ Admin nếu bạn chưa có tài khoản
          </p>
        </div>
      </div>
    </div>
  );
}
