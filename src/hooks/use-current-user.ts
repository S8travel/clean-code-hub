import { useState, useEffect } from "react";
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

// Khởi tạo ngay khi module load — không chờ component mount.
// Có timeout để preview/root route không bị kẹt màn hình trắng nếu auth storage/network bị treo.
const sessionTimeout = window.setTimeout(() => {
  if (!initialized) setState({ loading: false, session: null });
}, 3500);

externalSupabase.auth
  .getSession()
  .then(({ data }) => {
    initialized = true;
    window.clearTimeout(sessionTimeout);
    setState({ loading: false, session: data.session });
  })
  .catch(() => {
    initialized = true;
    window.clearTimeout(sessionTimeout);
    setState({ loading: false, session: null });
  });

externalSupabase.auth.onAuthStateChange((_event, session) => {
  initialized = true;
  window.clearTimeout(sessionTimeout);
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
