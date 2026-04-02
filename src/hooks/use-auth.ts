import { useNguoiDungByEmail } from "./use-nguoi-dung";
import { useCurrentUserEmail } from "./use-current-user";

export function useAuth() {
  const { email, setEmail } = useCurrentUserEmail();
  const { data: user, isLoading } = useNguoiDungByEmail(email);

  const isAuthenticated = !!email && !!user && user.active;

  const logout = () => setEmail(null);

  return { email, user, isLoading, isAuthenticated, logout };
}
