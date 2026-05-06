import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Session } from "@supabase/supabase-js";
import { externalSupabase } from "@/lib/supabase-external";

type SessionState = { loading: true; session: null } | { loading: false; session: Session | null };

let state: SessionState = { loading: true, session: null };
let listeners: Array<(s: SessionState) => void> = [];
let initialized = false;

function setState(newState: SessionState) {
  state = newState;
  listeners.forEach((fn) => fn(newState));
}

function initSession() {
  if (initialized) return;

  const sessionTimeout = setTimeout(() => {
    if (!initialized) setState({ loading: false, session: null });
  }, 3500);

  externalSupabase.auth.onAuthStateChange((_event, session) => {
    initialized = true;
    clearTimeout(sessionTimeout);
    setState({ loading: false, session });
  });

  externalSupabase.auth
    .getSession()
    .then(({ data }) => {
      initialized = true;
      clearTimeout(sessionTimeout);
      setState({ loading: false, session: data.session });
    })
    .catch(() => {
      initialized = true;
      clearTimeout(sessionTimeout);
      setState({ loading: false, session: null });
    });
}

initSession();

/** Gọi sau signInWithPassword để cập nhật state ngay — không chờ async event */
export function setCurrentSession(session: Session | null) {
  setState({ loading: false, session });
}

export function useCurrentSession() {
  const [s, setS] = useState<SessionState>(state);

  useEffect(() => {
    // Sync với state mới nhất (có thể đã resolved trước khi effect chạy)
    setS(state);
    listeners.push(setS);
    return () => {
      listeners = listeners.filter((fn) => fn !== setS);
    };
  }, []);

  return s;
}

export function useCurrentUserEmail() {
  const { session } = useCurrentSession();
  const userId = session?.user?.id ?? null;

  const { data } = useQuery({
    queryKey: ["current-user-role-email", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("email")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return (data as { email: string | null }).email;
    },
  });

  return { email: data ?? null };
}
