import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { WebAnhKind } from "@/lib/web-anh";

interface Props {
  url: string | null;
  kind: WebAnhKind;
  canEdit: boolean;
  dangTai: boolean;
  onChon: (file: File) => void;
  onGo: () => void;
}

const KHUNG: Record<WebAnhKind, string> = {
  anh: "w-28 h-[4.5rem]",
  slide: "w-32 h-[4.5rem]",
  logo: "w-14 h-14",
};

const ACCEPT: Record<WebAnhKind, string> = {
  anh: "image/jpeg,image/png,image/webp",
  slide: "image/jpeg,image/png,image/webp",
  logo: "image/png,image/jpeg,image/webp,image/svg+xml",
};

/** Ô ảnh (thumbnail + nút tải/thay/gỡ) dùng chung cho ảnh, logo, slide. */
export default function WebAnhCell({ url, kind, canEdit, dangTai, onChon, onGo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Ảnh ngoài (web khách sạn chặn hotlink) hỏng → hiện chữ thay vì ô vỡ.
  const [loi, setLoi] = useState(false);
  useEffect(() => setLoi(false), [url]);
  const khoa = !canEdit || dangTai;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "relative rounded border bg-muted/40 overflow-hidden flex items-center justify-center",
          KHUNG[kind],
        )}
      >
        {url && !loi ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            className={cn("w-full h-full", kind === "logo" ? "object-contain p-1" : "object-cover")}
            onError={() => setLoi(true)}
          />
        ) : (
          <span className="text-[10px] text-muted-foreground px-1 text-center leading-tight">
            {url ? t("Không tải được ảnh") : t("Chưa có ảnh")}
          </span>
        )}
        {dangTai && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // chọn lại cùng file vẫn bắn onChange
            if (f) onChon(f);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-1.5 text-[11px]"
          disabled={khoa}
          onClick={() => inputRef.current?.click()}
        >
          <ImageUp className="h-3 w-3 mr-1" />
          {url ? t("Thay") : t("Tải")}
        </Button>
        {url && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            disabled={khoa}
            title={t("Gỡ ảnh")}
            onClick={onGo}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
