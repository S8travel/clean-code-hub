// Đánh dấu thời điểm client NÀY vừa tự lưu chi phí của 1 đoàn.
// Bộ nhận realtime (useChiPhiChangeSignal) dùng để bỏ qua "echo" của
// chính mình → tránh banner "Tải lại" hiện ngay trên máy người vừa sửa.
const lastLocalSave = new Map<number, number>();

export function markChiPhiSavedLocally(doanId: number | null | undefined) {
  if (doanId != null) lastLocalSave.set(doanId, Date.now());
}

export function getLastChiPhiLocalSave(doanId: number | null | undefined): number {
  if (doanId == null) return 0;
  return lastLocalSave.get(doanId) ?? 0;
}
