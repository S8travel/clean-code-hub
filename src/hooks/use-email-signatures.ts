import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
}

const STORAGE_KEY = "s8_email_signatures";
const DEFAULT_KEY = "s8_email_signatures_default_id";

function load(): EmailSignature[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function loadDefaultId(): string | null {
  try { return localStorage.getItem(DEFAULT_KEY) || null; } catch { return null; }
}

function persist(sigs: EmailSignature[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sigs));
  } catch {
    toast.error("Không thể lưu chữ ký: nội dung quá lớn");
  }
}

function persistDefault(id: string | null) {
  try {
    if (id) localStorage.setItem(DEFAULT_KEY, id);
    else localStorage.removeItem(DEFAULT_KEY);
  } catch { /* noop */ }
}

// Module-level singleton — shared across all hook instances
let _sigs: EmailSignature[] = load();
let _defaultId: string | null = loadDefaultId();
type Listener = (sigs: EmailSignature[], defaultId: string | null) => void;
const _listeners = new Set<Listener>();

function notifyAll() {
  _listeners.forEach((fn) => fn(_sigs, _defaultId));
}

export function useEmailSignatures() {
  const [sigs, setSigs] = useState<EmailSignature[]>(() => _sigs);
  const [defaultId, setDefaultIdState] = useState<string | null>(() => _defaultId);

  useEffect(() => {
    const listener: Listener = (s, d) => { setSigs(s); setDefaultIdState(d); };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const upsert = useCallback((sig: EmailSignature) => {
    _sigs = _sigs.some((s) => s.id === sig.id)
      ? _sigs.map((s) => (s.id === sig.id ? sig : s))
      : [..._sigs, sig];
    persist(_sigs);
    notifyAll();
  }, []);

  const remove = useCallback((id: string) => {
    _sigs = _sigs.filter((s) => s.id !== id);
    persist(_sigs);
    // Nếu xoá chữ ký đang mặc định → bỏ default
    if (_defaultId === id) {
      _defaultId = null;
      persistDefault(null);
    }
    notifyAll();
  }, []);

  const setDefault = useCallback((id: string | null) => {
    _defaultId = id;
    persistDefault(id);
    notifyAll();
  }, []);

  return { sigs, defaultId, upsert, remove, setDefault };
}
