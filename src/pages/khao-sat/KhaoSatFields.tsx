import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";
import type { UIStrings } from "./khaosat-i18n";
import {
  SCORE_KEYS,
  CRITERIA_LABELS,
  DIEM_BAN_OPTIONS,
  NGUON_OPTIONS,
  YEUTO_OPTIONS,
  FIELD_LABELS,
  labelForLang,
  optionLabel,
  type Lang,
  type ScoreKey,
  type VocabOption,
} from "@/lib/khao-sat-vocab";
import { AGE_OPTS, type FormState } from "./khaosat-types";

// Toggle 1 code trong mảng multi-select (thêm nếu chưa có, bớt nếu đã có).
function toggleCode(arr: string[], code: string): string[] {
  return arr.includes(code) ? arr.filter((c) => c !== code) : [...arr, code];
}

// Nhóm nút chọn (single hoặc multi tuỳ cách caller định nghĩa `selected`/`onToggle`).
// Tô xanh khi chọn; aria-pressed cho trợ năng.
function ChoiceGroup({
  label,
  hint,
  options,
  lang,
  disabled,
  isSelected,
  onToggle,
}: {
  label: string;
  hint?: string;
  options: VocabOption[];
  lang: Lang;
  disabled: boolean;
  isSelected: (code: string) => boolean;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = isSelected(o.code);
          return (
            <button
              key={o.code}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onToggle(o.code)}
              className={
                "border rounded-md py-1.5 px-3 text-sm transition disabled:opacity-50 " +
                (on
                  ? "bg-[#0a3d7c] text-white border-[#0a3d7c]"
                  : "bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              {optionLabel(options, o.code, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Khối field của phiếu khảo sát (định dạng Đài Loan): thông tin khách + 7 tiêu chí
// điểm sao + chuyến đi lần sau + góp ý + 3 nhóm chọn (điểm bán / nguồn biết đến /
// lý do đặt tour). Tách khỏi KhaoSatPublicPage để trang chính gọn (quy ước CLAUDE.md).
export function KhaoSatFields({
  form,
  t,
  lang,
  submitting,
  onSet,
  onSetScore,
}: {
  form: FormState;
  t: UIStrings;
  lang: Lang;
  submitting: boolean;
  onSet: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onSetScore: (k: ScoreKey, v: number) => void;
}) {
  return (
    <>
      {/* ── Thông tin khách ── */}
      <div className="space-y-5">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          {t.guestSection}
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="ten_khach">{t.name}</Label>
          <Input
            id="ten_khach"
            value={form.ten_khach}
            onChange={(e) => onSet("ten_khach", e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t.genderLabel}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["nam", "nu"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={submitting}
                  aria-pressed={form.gioi_tinh === g}
                  onClick={() => onSet("gioi_tinh", form.gioi_tinh === g ? "" : g)}
                  className={
                    "border rounded-md py-2 px-3 text-sm transition " +
                    (form.gioi_tinh === g
                      ? "bg-[#0a3d7c] text-white border-[#0a3d7c]"
                      : "bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {g === "nam" ? t.male : t.female}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.ageLabel}</Label>
            <div className="grid grid-cols-3 gap-2">
              {AGE_OPTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={submitting}
                  aria-pressed={form.tuoi_range === a}
                  onClick={() => onSet("tuoi_range", form.tuoi_range === a ? "" : a)}
                  className={
                    "border rounded-md py-2 px-2 text-sm transition " +
                    (form.tuoi_range === a
                      ? "bg-[#0a3d7c] text-white border-[#0a3d7c]"
                      : "bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nghe_nghiep">{t.jobLabel}</Label>
          <Input
            id="nghe_nghiep"
            value={form.nghe_nghiep}
            onChange={(e) => onSet("nghe_nghiep", e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sdt">{t.phoneLabel}</Label>
            <Input
              id="sdt"
              type="tel"
              value={form.so_dien_thoai}
              onChange={(e) => onSet("so_dien_thoai", e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => onSet("email", e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
      </div>

      {/* ── Đánh giá 7 tiêu chí ── */}
      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          {t.ratingSection}
        </h3>
        <p className="text-xs text-muted-foreground">{t.ratingHint}</p>
        <div className="rounded-lg border border-slate-200 px-3">
          {SCORE_KEYS.map((k) => (
            <StarRating
              key={k}
              label={CRITERIA_LABELS[k][lang]}
              value={form.scores[k]}
              onChange={(v) => onSetScore(k, v)}
              disabled={submitting}
            />
          ))}
        </div>
      </div>

      {/* ── Chuyến đi lần sau (下次旅程) ── */}
      <div className="space-y-1.5">
        <Label htmlFor="next_trip">{labelForLang(FIELD_LABELS.next_trip, lang)}</Label>
        <Input
          id="next_trip"
          value={form.next_trip}
          onChange={(e) => onSet("next_trip", e.target.value)}
          placeholder={t.nextTripPlaceholder}
          disabled={submitting}
        />
      </div>

      {/* ── Góp ý du lịch (旅遊建議) ── */}
      <div className="space-y-1.5">
        <Label htmlFor="y_kien_khac">{labelForLang(FIELD_LABELS.y_kien_khac, lang)}</Label>
        <Textarea
          id="y_kien_khac"
          rows={3}
          value={form.y_kien_khac}
          onChange={(e) => onSet("y_kien_khac", e.target.value)}
          placeholder={t.commentsPlaceholder}
          disabled={submitting}
        />
      </div>

      {/* ── Điểm bán (營業據點, single-select) ── */}
      <ChoiceGroup
        label={labelForLang(FIELD_LABELS.diem_ban, lang)}
        options={DIEM_BAN_OPTIONS}
        lang={lang}
        disabled={submitting}
        isSelected={(code) => form.diem_ban === code}
        onToggle={(code) => onSet("diem_ban", form.diem_ban === code ? "" : code)}
      />

      {/* ── Nguồn biết đến (獲得資訊, multi-select) ── */}
      <ChoiceGroup
        label={labelForLang(FIELD_LABELS.nguon_thong_tin, lang)}
        hint={t.multiHint}
        options={NGUON_OPTIONS}
        lang={lang}
        disabled={submitting}
        isSelected={(code) => form.nguon_thong_tin.includes(code)}
        onToggle={(code) => onSet("nguon_thong_tin", toggleCode(form.nguon_thong_tin, code))}
      />

      {/* ── Lý do đặt tour (購買因素, multi-select) ── */}
      <ChoiceGroup
        label={labelForLang(FIELD_LABELS.yeu_to_mua, lang)}
        hint={t.multiHint}
        options={YEUTO_OPTIONS}
        lang={lang}
        disabled={submitting}
        isSelected={(code) => form.yeu_to_mua.includes(code)}
        onToggle={(code) => onSet("yeu_to_mua", toggleCode(form.yeu_to_mua, code))}
      />
    </>
  );
}
