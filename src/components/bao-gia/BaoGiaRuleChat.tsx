import { useEffect, useRef, useState } from "react";
import { Brain, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/error";
import { useAuth } from "@/hooks/use-auth";
import { useIsReadOnly } from "@/hooks/use-permissions";
import type { KsBuaRule } from "@/lib/bao-gia-ai-resolve";
import {
  useBaoGiaRuleList, useTeachBaoGiaRule, useSaveBaoGiaRule, useDeactivateBaoGiaRule,
  type TeachRuleResult,
} from "@/hooks/use-bao-gia-rules";

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  /** AI hiểu được → đề xuất quy tắc chờ user bấm Lưu. */
  proposal?: { rule: NonNullable<TeachRuleResult["rule"]>; moTaGoc: string };
  saved?: boolean;
}

// Panel chat DẠY quy tắc tính giá — nhúng trong modal review AI (cột phải):
// user đọc kết quả thấy sai → gõ tiếng Việt tự nhiên → AI parse thành quy tắc
// có cấu trúc → user XÁC NHẬN mới lưu (bảng bao_gia_rule) + áp NGAY vào kết
// quả đang xem qua onRuleSaved. AI không tự nhớ — bộ nhớ là DB, lần báo giá
// sau code áp dụng deterministic (applyKsBuaRules).
export function BaoGiaRuleChatPanel({ onRuleSaved }: {
  /** Gọi sau khi LƯU thành công → caller áp quy tắc vào rows đang review. */
  onRuleSaved?: (rule: KsBuaRule) => void;
}) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const readOnly = useIsReadOnly();
  const { data: rules = [] } = useBaoGiaRuleList();
  const teach = useTeachBaoGiaRule();
  const save = useSaveBaoGiaRule();
  const remove = useDeactivateBaoGiaRule();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || teach.isPending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    teach.mutate(text, {
      onSuccess: (kq) => {
        setMsgs((m) => [...m, {
          role: "ai",
          text: kq.ly_do,
          ...(kq.hieu && kq.rule ? { proposal: { rule: kq.rule, moTaGoc: text } } : {}),
        }]);
      },
      onError: (e) => {
        setMsgs((m) => [...m, { role: "ai", text: `Lỗi: ${errMsg(e) || "không phân tích được"}` }]);
      },
    });
  };

  const handleSave = (idx: number) => {
    const msg = msgs[idx];
    if (!msg?.proposal || save.isPending) return;
    const { rule } = msg.proposal;
    save.mutate(
      { rule, mo_ta_goc: msg.proposal.moTaGoc, dien_giai: msg.text, userId: user?.user_id },
      {
        onSuccess: () => {
          setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, saved: true } : x)));
          onRuleSaved?.({ id: -1, khach_san_id: rule.khach_san_id, bua: rule.bua, gia_phong: rule.gia_phong });
          toast.success(onRuleSaved
            ? "Đã ghi nhớ + áp vào kết quả đang xem"
            : "Đã ghi nhớ quy tắc — báo giá sau tự áp dụng");
        },
        onError: (e) => toast.error(errMsg(e) || "Không lưu được quy tắc"),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <Brain className="h-3.5 w-3.5" /> Sửa & dạy quy tắc
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {/* Quy tắc đã ghi nhớ */}
        <div className="rounded-md border">
          <p className="rounded-t-md bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
            🧠 Đã ghi nhớ ({rules.length})
          </p>
          {rules.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Chưa có quy tắc nào.</p>
          ) : (
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="flex items-start gap-1.5 px-2 py-1.5 text-[11px]">
                  <span className="min-w-0 flex-1 break-words">
                    {r.dien_giai || r.mo_ta_goc || `Quy tắc #${r.id}`}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      title="Gỡ quy tắc này"
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-red-500"
                      onClick={() =>
                        remove.mutate(r.id, {
                          onSuccess: () => toast.success("Đã gỡ quy tắc"),
                          onError: (e) => toast.error(errMsg(e) || "Không gỡ được"),
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Hội thoại dạy */}
        {msgs.length === 0 && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Thấy giá sai? Gõ sửa tại đây — hệ thống áp ngay vào kết quả đang xem và nhớ cho mọi
            báo giá sau. VD: <i>"Amina Lantana khi có ăn tối thì giá phòng 3tr, không tính tiền ăn tối"</i>
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[11px] ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.text}
              {m.proposal && (
                <div className="mt-1.5 flex items-center gap-2">
                  {m.saved ? (
                    <span className="text-[10px] font-medium text-emerald-700">✓ Đã ghi nhớ + áp dụng</span>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={save.isPending || readOnly}
                        onClick={() => handleSave(i)}
                      >
                        {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Lưu & áp dụng"}
                      </Button>
                      <span className="text-[10px] text-slate-500">hoặc gõ lại</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {teach.isPending && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> AI đang phân tích...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <div className="flex items-center gap-1.5 pt-1.5">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Gõ điều cần sửa/ghi nhớ..."
            className="h-8 text-[11px]"
          />
          <Button size="sm" className="h-8 px-2.5" onClick={handleSend} disabled={teach.isPending || !input.trim()}
            title="Gửi cho AI phân tích">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
