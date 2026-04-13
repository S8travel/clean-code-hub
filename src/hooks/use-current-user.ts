import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { externalSupabase } from "@/lib/supabase-external";

type SessionState = { loading: true; session: null } | { loading: false; session: Session | null };

let state: SessionState = { loading: true, session: null };
let listeners: Array<(s: SessionState) => void> = [];

function setState(newState: SessionState) {
  state = newState;
  listeners.forEach((fn) => fn(newState));
}

// Khởi tạo ngay khi module load — không chờ component mount
// Để onAuthStateChange bắt được SIGNED_IN từ signInWithPassword()
externalSupabase.auth.getSession().then(({ data }) => {
  setState({ loading: false, session: data.session });
});

externalSupabase.auth.onAuthStateChange((_event, session) => {
  setState({ loading: false, session });
});

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

/** Backwards-compat shim */
export function useCurrentUserEmail() {
  const { session } = useCurrentSession();
  return { email: session?.user?.email ?? null };
}
