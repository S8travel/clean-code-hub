import { useEffect } from "react";
import { externalSupabase } from "@/lib/supabase-external";
import { setReadOnlyMode } from "@/lib/readonly-mode";
import { useCurrentSession } from "./use-current-user";
import { useNguoiDungByUserId } from "./use-nguoi-dung";

export function useAuth() {
  const { loading: sessionLoading, session } = useCurrentSession();
  const { data: user, isLoading: userLoading, isError: userError } = useNguoiDungByUserId(session?.user?.id);

  const isLoading = sessionLoading || (!!session && userLoading && !userError);
  const isAuthenticated = !!session && !!user && user.active;

  // Đồng bộ cờ chỉ-xem xuống lớp chặn ghi của supabase client. Đặt ở đây vì
  // useAuth là nơi duy nhất luôn có hồ sơ user; các hook mutation không cần biết.
  const chiXem = !!user?.chi_xem;
  useEffect(() => { setReadOnlyMode(chiXem); }, [chiXem]);

  const logout = () => externalSupabase.auth.signOut();

  return { email: session?.user?.email ?? null, user, isLoading, isAuthenticated, logout };
}
