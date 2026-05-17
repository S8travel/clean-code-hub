import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEFAULT_GIFTS = ["Dầu", "Nón", "Nước", "Ảnh", "Sim", "Túi xách", "Mũ lưỡi trai", "Quạt"];

interface Props {
  gifts: string[];
  setGifts: (v: string[]) => void;
}

export default function GiftTagsSection({ gifts, setGifts }: Props) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Active = tag is in gifts array
  const allTags = [...new Set([...DEFAULT_GIFTS, ...gifts])];

  const toggle = (tag: string) => {
    if (gifts.includes(tag)) {
      setGifts(gifts.filter((g) => g !== tag));
    } else {
      setGifts([...gifts, tag]);
    }
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !allTags.includes(trimmed)) {
      setGifts([...gifts, trimmed]);
    } else if (trimmed && !gifts.includes(trimmed)) {
      setGifts([...gifts, trimmed]);
    }
    setNewTag("");
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">🎁 Tặng phẩm</h3>
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const active = gifts.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-green-100 border-green-500 text-green-800"
                  : "bg-background border-border text-muted-foreground hover:border-muted-foreground print:hidden"
              }`}
            >
              {active && <Check className="inline h-3 w-3 mr-1" />}
              {tag}
            </button>
          );
        })}
        <span className="print-hide">
        {adding ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              className="h-7 w-28 text-xs"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } if (e.key === "Escape") setAdding(false); }}
              placeholder="Tên tag..."
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-foreground transition-colors"
          >
            <Plus className="inline h-3 w-3 mr-0.5" /> Thêm
          </button>
        )}
        </span>
      </div>
    </div>
  );
}
