import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
}

const STORAGE_KEY = "s8_email_signatures";

function load(): EmailSignature[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function persist(sigs: EmailSignature[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sigs));
  } catch {
    toast.error("Không thể lưu chữ ký: nội dung quá lớn");
  }
}

// Module-level singleton — shared across all hook instances
let _sigs: EmailSignature[] = load();
const _listeners = new Set<(sigs: EmailSignature[]) => void>();

function notifyAll(next: EmailSignature[]) {
  _sigs = next;
  _listeners.forEach((fn) => fn(next));
}

export function useEmailSignatures() {
  const [sigs, setSigs] = useState<EmailSignature[]>(() => _sigs);

  useEffect(() => {
    _listeners.add(setSigs);
    return () => { _listeners.delete(setSigs); };
  }, []);

  const upsert = useCallback((sig: EmailSignature) => {
    const next = _sigs.some((s) => s.id === sig.id)
      ? _sigs.map((s) => (s.id === sig.id ? sig : s))
      : [..._sigs, sig];
    persist(next);
    notifyAll(next);
  }, []);

  const remove = useCallback((id: string) => {
    const next = _sigs.filter((s) => s.id !== id);
    persist(next);
    notifyAll(next);
  }, []);

  return { sigs, upsert, remove };
}
