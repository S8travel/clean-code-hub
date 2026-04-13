import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { externalSupabase } from "@/lib/supabase-external";

let cachedSession: Session | null = null;
let listeners: Array<(s: Session | null) => void> = [];

// Shared singleton — avoids multiple onAuthStateChange subscriptions
function notifyListeners(s: Session | null) {
  cachedSession = s;
  listeners.forEach((fn) => fn(s));
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  externalSupabase.auth.getSession().then(({ data }) => {
    notifyListeners(data.session);
  });
  externalSupabase.auth.onAuthStateChange((_event, session) => {
    notifyListeners(session);
  });
}

export function useCurrentSession() {
  const [session, setSession] = useState<Session | null>(cachedSession);

  useEffect(() => {
    ensureSubscribed();
    // Sync with latest cached value in case it changed before we subscribed
    setSession(cachedSession);
    listeners.push(setSession);
    return () => {
      listeners = listeners.filter((fn) => fn !== setSession);
    };
  }, []);

  return session;
}

/** Backwards-compat shim — returns email from session */
export function useCurrentUserEmail() {
  const session = useCurrentSession();
  return { email: session?.user?.email ?? null };
}
