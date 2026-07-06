import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { externalSupabase } from "@/lib/supabase-external";
import { toast } from "sonner";
import { KhaoSatFields } from "./khao-sat/KhaoSatFields";
import { T, LANGS, detectLang } from "./khao-sat/khaosat-i18n";
import { SCORE_KEYS, type Lang, type ScoreKey } from "@/lib/khao-sat-vocab";
import { emptyForm, type FormState } from "./khao-sat/khaosat-types";

interface DoanInfo {
  doan_id: number;
  ma_doan: string | null;
  hdv_ten: string | null;
  truong_doan: string | null;
  hop_le: boolean;
}

// Khung nền dùng chung cho các màn phụ (loading / lỗi / cảm ơn).
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc] p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8 text-center space-y-4">
        {children}
      </div>
    </div>
  );
}

// Nút chuyển 4 ngôn ngữ. `dark` = đặt trên nền header xanh.
function LangSwitch({
  lang,
  onPick,
  dark,
}: {
  lang: Lang;
  onPick: (l: Lang) => void;
  dark?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {LANGS.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => onPick(l.code)}
            className={
              "px-2.5 py-1 rounded text-xs font-medium border transition " +
              (active
                ? "bg-white text-[#0a3d7c] border-white"
                : dark
                ? "bg-transparent text-blue-100 border-blue-300/50 hover:bg-white/10"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
            }
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export default function KhaoSatPublicPage() {
  const { doanId } = useParams<{ doanId: string }>();
  const progressKey = `khao-sat-progress-${doanId}`;
  const doneKey = `khao-sat-done-${doanId}`;

  const [lang, setLang] = useState<Lang>("zh-TW");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [info, setInfo] = useState<DoanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const hydratedRef = useRef(false);
  const t = T[lang];

  // Chống submit phiếu HOÀN TOÀN trống: cần ít nhất 1 field hoặc 1 sao > 0.
  const hasAnyInput =
    form.ten_khach.trim() !== "" ||
    form.gioi_tinh !== "" ||
    form.tuoi_range !== "" ||
    form.nghe_nghiep.trim() !== "" ||
    form.so_dien_thoai.trim() !== "" ||
    form.email.trim() !== "" ||
    form.next_trip.trim() !== "" ||
    form.y_kien_khac.trim() !== "" ||
    form.nguon_thong_tin.length > 0 ||
    form.yeu_to_mua.length > 0 ||
    SCORE_KEYS.some((k) => form.scores[k] > 0);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setScore = (k: ScoreKey, v: number) =>
    setForm((f) => ({ ...f, scores: { ...f.scores, [k]: v } }));

  // ── Hydrate: cờ đã-submit + progress + ngôn ngữ (1 lần khi mount) ──────────
  useEffect(() => {
    let savedLang: Lang | null = null;
    try {
      if (localStorage.getItem(doneKey) === "1") setDone(true);
      const raw = localStorage.getItem(progressKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { form?: Partial<FormState>; lang?: Lang };
        if (parsed.form) {
          setForm((f) => ({
            ...f,
            ...parsed.form,
            scores: { ...f.scores, ...(parsed.form?.scores ?? {}) },
          }));
        }
        if (parsed.lang) savedLang = parsed.lang;
      }
    } catch {
      // localStorage có thể bị chặn (private mode) — bỏ qua, không chặn form.
    }
    setLang(savedLang ?? detectLang(navigator.languages?.[0] ?? navigator.language));
    hydratedRef.current = true;
  }, [doanId, progressKey, doneKey]);

  // ── Persist progress mỗi khi form/lang đổi (sau khi đã hydrate) ────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ form, lang }));
    } catch {
      // ignore
    }
  }, [form, lang, progressKey]);

  // ── Lấy info đoàn để pre-fill + validate link ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const id = Number(doanId);
      if (!doanId || Number.isNaN(id)) {
        if (!cancelled) {
          setInvalid(true);
          setLoading(false);
        }
        return;
      }
      const { data, error } = await externalSupabase.rpc("get_khao_sat_doan_info", {
        p_doan_id: id,
      });
      if (cancelled) return;
      const row = data && data.length > 0 ? data[0] : null;
      if (error || !row || !row.hop_le) {
        setInvalid(true);
      } else {
        setInfo(row as DoanInfo);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [doanId]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!hasAnyInput) {
      toast.error(t.emptyError);
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, string | number | string[]> = {
        doan_id: Number(doanId),
        ngon_ngu: lang,
      };
      const strFields: [keyof FormState, string][] = [
        ["ten_khach", form.ten_khach.trim()],
        ["gioi_tinh", form.gioi_tinh],
        ["tuoi_range", form.tuoi_range],
        ["nghe_nghiep", form.nghe_nghiep.trim()],
        ["so_dien_thoai", form.so_dien_thoai.trim()],
        ["email", form.email.trim()],
        ["next_trip", form.next_trip.trim()],
        ["y_kien_khac", form.y_kien_khac.trim()],
      ];
      for (const [key, val] of strFields) {
        if (val) payload[key as string] = val;
      }
      if (form.nguon_thong_tin.length > 0) payload.nguon_thong_tin = form.nguon_thong_tin;
      if (form.yeu_to_mua.length > 0) payload.yeu_to_mua = form.yeu_to_mua;
      for (const k of SCORE_KEYS) {
        if (form.scores[k] > 0) payload[k] = form.scores[k];
      }

      const { error } = await externalSupabase.rpc("create_khao_sat_from_form", {
        payload,
      });
      if (error) {
        console.error("Khảo sát submit error:", error.message);
        toast.error(t.submitError);
        return;
      }
      try {
        localStorage.setItem(doneKey, "1");
        localStorage.removeItem(progressKey);
      } catch {
        // ignore
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  const fillAnother = () => {
    try {
      localStorage.removeItem(doneKey);
    } catch {
      // ignore
    }
    setForm(emptyForm());
    setDone(false); // quay lại màn form để điền phiếu mới
  };

  // ── Màn: đang tải ──────────────────────────────────────────────────────────
  if (loading && !done) {
    return (
      <Shell>
        <Loader2 className="w-10 h-10 text-[#0a3d7c] mx-auto animate-spin" />
        <p className="text-sm text-muted-foreground">{t.loading}</p>
      </Shell>
    );
  }

  // ── Màn: đã gửi (cảm ơn) ───────────────────────────────────────────────────
  if (done) {
    return (
      <Shell>
        <div className="flex justify-center">
          <LangSwitch lang={lang} onPick={setLang} />
        </div>
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
        <h1 className="text-2xl font-bold text-[#0a3d7c]">{t.thankTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.thankSub}</p>
        <Button variant="outline" onClick={fillAnother}>
          {t.fillAnother}
        </Button>
      </Shell>
    );
  }

  // ── Màn: link không hợp lệ / quá hạn ───────────────────────────────────────
  if (invalid) {
    return (
      <Shell>
        <div className="flex justify-center">
          <LangSwitch lang={lang} onPick={setLang} />
        </div>
        <XCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold text-[#0a3d7c]">{t.invalidTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.invalidSub}</p>
      </Shell>
    );
  }

  // ── Màn: form khảo sát ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col">
      <header className="bg-[#0a3d7c] text-white py-5 px-4 sm:px-8">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/logo.jpg"
                alt="S8 Travel"
                className="w-11 h-11 rounded bg-white p-1 object-contain shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">S8 TRAVEL</h1>
                <p className="text-xs text-blue-200 truncate">{t.brandTag}</p>
              </div>
            </div>
            <LangSwitch lang={lang} onPick={setLang} dark />
          </div>

          {info && (info.ma_doan || info.hdv_ten || info.truong_doan) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-100 border-t border-blue-400/30 pt-2">
              {info.ma_doan && (
                <span>
                  <span className="text-blue-300">{t.teamNo}:</span>{" "}
                  <span className="font-medium text-white">{info.ma_doan}</span>
                </span>
              )}
              {info.hdv_ten && (
                <span>
                  <span className="text-blue-300">{t.guide}:</span>{" "}
                  <span className="font-medium text-white">{info.hdv_ten}</span>
                </span>
              )}
              {info.truong_doan && (
                <span>
                  <span className="text-blue-300">{t.leader}:</span>{" "}
                  <span className="font-medium text-white">{info.truong_doan}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 py-8 px-4 sm:px-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-[#0a3d7c]">{t.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t.optionalNote}</p>
          </div>

          <KhaoSatFields
            form={form}
            t={t}
            lang={lang}
            submitting={submitting}
            onSet={set}
            onSetScore={setScore}
          />

          <Button
            onClick={handleSubmit}
            disabled={submitting || !hasAnyInput}
            className="w-full h-11 bg-[#0a3d7c] hover:bg-[#0a3d7c]/90 text-base font-semibold"
          >
            {submitting ? t.submitting : t.submit}
          </Button>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4">
        © S8 Travel
      </footer>
    </div>
  );
}
