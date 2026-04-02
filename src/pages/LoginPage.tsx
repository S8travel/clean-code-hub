import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useNguoiDungByEmail } from "@/hooks/use-nguoi-dung";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setEmail } = useCurrentUserEmail();
  const [inputEmail, setInputEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: user, isLoading } = useNguoiDungByEmail(submitted ? inputEmail.trim().toLowerCase() : null);

  const handleLogin = async () => {
    const email = inputEmail.trim().toLowerCase();
    if (!email) return;
    setSubmitted(true);
  };

  // Khi có kết quả trả về
  if (submitted && !isLoading) {
    if (!user) {
      toast.error("Email không tồn tại trong hệ thống");
      setSubmitted(false);
    } else if (!user.active) {
      toast.error("Tài khoản đã bị vô hiệu hoá");
      setSubmitted(false);
    } else {
      setEmail(inputEmail.trim().toLowerCase());
      navigate("/dashboard", { replace: true });
    }
  }

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
            <p className="text-sm text-muted-foreground">Nhập email để truy cập hệ thống</p>
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
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="h-10"
                autoFocus
              />
            </div>

            <Button
              className="w-full h-10 bg-[#0a3d7c] hover:bg-[#0a3d7c]/90"
              onClick={handleLogin}
              disabled={!inputEmail.trim() || isLoading}
            >
              {isLoading ? "Đang kiểm tra..." : "Đăng nhập"}
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
