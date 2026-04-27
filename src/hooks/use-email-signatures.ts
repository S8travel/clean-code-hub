import { useState, useCallback } from "react";

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
}

const STORAGE_KEY = "s8_email_signatures";

function load(): EmailSignature[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

export function useEmailSignatures() {
  const [sigs, setSigs] = useState<EmailSignature[]>(load);

  const upsert = useCallback((sig: EmailSignature) => {
    setSigs((prev) => {
      const next = prev.some((s) => s.id === sig.id)
        ? prev.map((s) => (s.id === sig.id ? sig : s))
        : [...prev, sig];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSigs((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { sigs, upsert, remove };
}
