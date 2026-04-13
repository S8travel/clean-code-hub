import { externalSupabase } from "@/lib/supabase-external";
import { useCurrentSession } from "./use-current-user";
import { useNguoiDungByUserId } from "./use-nguoi-dung";

export function useAuth() {
  const { loading: sessionLoading, session } = useCurrentSession();
  const { data: user, isLoading: userLoading } = useNguoiDungByUserId(session?.user?.id);

  const isLoading = sessionLoading || (!!session && userLoading);
  const isAuthenticated = !!session && !!user && user.active;

  const logout = () => externalSupabase.auth.signOut();

  return { email: session?.user?.email ?? null, user, isLoading, isAuthenticated, logout };
}
