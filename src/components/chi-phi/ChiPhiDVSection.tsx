import { forwardRef, useImperativeHandle } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { NHDocEntry } from "@/lib/export-dntt-nh-word";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import DVDnttModal from "./DVDnttModal";
import DVCancelModal from "./DVCancelModal";
import DVAggCommitModal from "./DVAggCommitModal";
import DVRow from "./DVRow";
import { useDVSection } from "./use-dv-section";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  tenDoan?: string;
  ngayBatDau?: string;
}

export interface ChiPhiDVSectionHandle {
  buildSelectedEntries: () => Promise<NHDocEntry[] | undefined>;
  clearSelection: () => void;
  getSelectedCount: () => number;
}

// Tab Chi phí Dịch vụ — chỉ render. Toàn bộ state/logic ở useDVSection.
const ChiPhiDVSection = forwardRef<ChiPhiDVSectionHandle, Props>(function ChiPhiDVSection({ doanId, tenDoan, ngayBatDau }, ref) {
  useTranslate();
  const s = useDVSection({ doanId, tenDoan, ngayBatDau });
  const {
    dvRows, total, sortedDays, dvData, dvHandlers,
    selectedIds, setSelectedIds, buildSelectedEntries, handlePrintSelected,
    previewDVData, setPreviewDVData,
    dvModal, setDvModal, dvModalMode, setDvModalMode,
    dvDepositAmount, setDvDepositAmount, dvNgayCan, setDvNgayCan,
    canTruByDv, setCanTruByDv, handleDvModalSubmit,
    aggCommit, setAggCommit, aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru, handleAggCommit,
    cancelTarget, setCancelTarget, cancelMode, setCancelMode, handleCancel,
    insertPending, cancelPending,
  } = s;

  // Expose imperative API cho ChiPhiTab (in DNTT gộp NH + DV).
  useImperativeHandle(ref, () => ({
    buildSelectedEntries,
    clearSelection: () => setSelectedIds([]),
    getSelectedCount: () => selectedIds.length,
  }), [buildSelectedEntries, selectedIds.length, setSelectedIds]);

  // Empty state — return SAU mọi hook (Rules of Hooks).
  if (dvRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        🎫 {t("Chưa có dịch vụ nào trong chương trình.")}
        <br />
        <span className="text-xs">{t("Vào mục Điều Tour → thêm dịch vụ có phí vào chương trình ngày.")}</span>
      </div>
    );
  }

  const allSelected = selectedIds.length === dvRows.length && dvRows.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-purple-900">🎫 {t("Dịch vụ")}</p>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={handlePrintSelected}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                {t("In ĐNTT")} ({selectedIds.length})
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
                {t("Bỏ chọn")}
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">{t("Tổng")}: {fmt(total)} ₫</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col style={{ width: "32px" }} />
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "136px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "76px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "130px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="px-2 py-2.5 text-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => v ? setSelectedIds(dvRows.map(r => r.id!)) : setSelectedIds([])}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="text-left px-3 py-2.5">Ngày</th>
              <th className="text-left px-3 py-2.5">Dịch vụ</th>
              <th className="text-center px-2 py-2.5">SL</th>
              <th className="text-center px-3 py-2.5">Đơn giá</th>
              <th className="text-right px-3 py-2.5">Thành tiền</th>
              <th className="text-center px-2 py-2.5">Nguồn</th>
              <th className="text-center px-3 py-2.5">TT ĐNTT</th>
              <th className="text-center px-3 py-2.5">TT Thanh toán</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedDays.map(([day, rows]) =>
              rows.map((row) => (
                <DVRow key={row.id} row={row} day={day} data={dvData} handlers={dvHandlers} />
              )),
            )}
          </tbody>
        </table>
      </div>

      <DVDnttModal
        target={dvModal}
        mode={dvModalMode}
        onModeChange={setDvModalMode}
        depositAmount={dvDepositAmount}
        onDepositAmountChange={setDvDepositAmount}
        ngayCan={dvNgayCan}
        onNgayCanChange={setDvNgayCan}
        canTru={dvModal ? (canTruByDv[dvModal.chiPhiId] ?? []) : []}
        onCanTruChange={(v) => dvModal && setCanTruByDv((prev) => ({ ...prev, [dvModal.chiPhiId]: v }))}
        onClose={() => setDvModal(null)}
        onSubmit={handleDvModalSubmit}
        submitting={insertPending}
      />

      <DVAggCommitModal
        target={aggCommit}
        doanId={doanId}
        reason={aggReason}
        onReasonChange={setAggReason}
        ngayCan={aggNgayCan}
        onNgayCanChange={setAggNgayCan}
        surplusMode={aggSurplusMode}
        onSurplusModeChange={setAggSurplusMode}
        canTru={aggCanTru}
        onCanTruChange={setAggCanTru}
        onClose={() => { setAggCommit(null); setAggReason(""); setAggNgayCan(""); setAggSurplusMode("con_du"); setAggCanTru(null); }}
        onSubmit={handleAggCommit}
        submitting={insertPending}
      />

      <DVCancelModal
        target={cancelTarget}
        mode={cancelMode}
        onModeChange={setCancelMode}
        onClose={() => setCancelTarget(null)}
        onSubmit={handleCancel}
        submitting={cancelPending}
      />

      <DNTTNHPreviewModal
        open={!!previewDVData}
        data={previewDVData}
        onClose={() => setPreviewDVData(null)}
      />
    </div>
  );
});

export default ChiPhiDVSection;
