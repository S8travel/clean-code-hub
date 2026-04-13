import { externalSupabase } from "@/lib/supabase-external";
import { useCurrentSession } from "./use-current-user";
import { useNguoiDungByUserId } from "./use-nguoi-dung";

export function useAuth() {
  const session = useCurrentSession();
  const { data: user, isLoading } = useNguoiDungByUserId(session?.user?.id);

  const isAuthenticated = !!session && !!user && user.active;

  const logout = () => externalSupabase.auth.signOut();

  return { email: session?.user?.email ?? null, user, isLoading: !session && isLoading, isAuthenticated, logout };
}
