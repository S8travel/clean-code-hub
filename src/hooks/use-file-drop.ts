import { useCallback, useRef, useState, type DragEvent } from "react";

/** Kéo-thả file vào một vùng bất kỳ.
 *  - `dragging`: đang rê file lên vùng → tô viền cho biết thả được.
 *  - `dropProps`: spread thẳng vào phần tử nhận file.
 *
 *  Đếm enter/leave (depth) vì rê qua phần tử CON cũng bắn `dragleave` — tắt
 *  highlight ngay theo mỗi lần leave thì viền nhấp nháy, vùng thả trông như đã
 *  mất trong khi vẫn thả được. */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  // Rê chữ / link cũng bắn drag event — chỉ bắt khi payload thật sự là file.
  const hasFiles = (e: DragEvent<HTMLElement>) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, [disabled]);

  const onDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (disabled || !hasFiles(e)) return;
    // BẮT BUỘC: không chặn default thì trình duyệt tự mở file khi thả (mất trang).
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [disabled]);

  const onDragLeave = useCallback(() => {
    if (disabled) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, [disabled]);

  const onDrop = useCallback((e: DragEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onFiles(files);
  }, [disabled, onFiles]);

  return { dragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
