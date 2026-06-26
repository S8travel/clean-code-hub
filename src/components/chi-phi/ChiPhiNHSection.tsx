import { forwardRef, useImperativeHandle } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { NHDocEntry } from "@/lib/export-dntt-nh-word";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import NHRow from "./NHRow";
import NHOrphanRows from "./NHOrphanRows";
import NHDnttModal from "./NHDnttModal";
import NHAggCommitModal from "./NHAggCommitModal";
import NHCancelModal from "./NHCancelModal";
import DungVoucherModal from "./DungVoucherModal";
import { useNHSection } from "./use-nh-section";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  doanId: number;
  soKhachDefault?: number;
  soKhachKhongTL?: number;
  coTinhSuatTLNhaHang?: boolean;
  tenDoan?: string;
  doanNhomId?: number | null;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

export interface ChiPhiNHSectionHandle {
  /** Build entries từ selection hiện tại (undefined nếu không có gì chọn) */
  buildSelectedEntries: () => NHDocEntry[] | undefined;
  clearSelection: () => void;
  getSelectedCount: () => number;
}

// Tab Chi phí Nhà hàng — chỉ render. Toàn bộ state/logic ở useNHSection.
const ChiPhiNHSection = forwardRef<ChiPhiNHSectionHandle, Props>(function ChiPhiNHSection(
  { doanId, soKhachDefault = 0, soKhachKhongTL, coTinhSuatTLNhaHang, tenDoan = "", doanNhomId, locked = false },
  ref,
) {
  useTranslate();
  const s = useNHSection({ doanId, soKhachDefault, soKhachKhongTL, coTinhSuatTLNhaHang, tenDoan, doanNhomId });
  const {
    isLoading, meals, nhRowData, nhRowHandlers,
    selectedKeys, setSelectedKeys, chiPhiRows, dnttList, congNoList,
    buildSelectedEntries, handlePrintSelected, previewNHData, setPreviewNHData,
    dnttModalRow, dnttModalExtras, dnttModalNh, dnttModalCoverVe, dnttModalMode, setDnttModalMode,
    dnttDepositAmount, setDnttDepositAmount, dnttAlreadyPaid,
    dnttBsAmount, setDnttBsAmount, dnttNgayCan, setDnttNgayCan,
    dnttModalCanTru, setDnttModalCanTru, dnttSubmitting, handleDnttSubmit, closeDnttModal,
    aggCommit, aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru,
    handleAggCommit, insertPending, closeAggCommit,
    cancelTarget, setCancelTarget, cancelMode, setCancelMode,
    handleCancelSubmit, cancelPending,
    voucherTarget, handleApplyVoucher, closeVoucher, voucherSubmitting,
  } = s;

  // Expose imperative API cho ChiPhiTab (in DNTT gộp NH + DV).
  useImperativeHandle(ref, () => ({
    buildSelectedEntries,
    clearSelection: () => setSelectedKeys([]),
    getSelectedCount: () => selectedKeys.length,
  }), [buildSelectedEntries, selectedKeys.length, setSelectedKeys]);

  if (isLoading) return <div className="text-sm text-muted-foreground">{t("Đang tải nhà hàng...")}</div>;

  if (meals.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ {t("Nhà hàng")}
          <Badge variant="secondary" className="text-xs">{t("Điều tour")}</Badge>
        </h3>
        <p className="text-sm text-muted-foreground">{t("Chưa có nhà hàng trong lịch trình.")}</p>
      </div>
    );
  }

  const mealKeys = meals.map((m) => `${m.doan_ngay_id}_${m.bua_an}`);
  const allSelected = selectedKeys.length === meals.length && meals.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Header + toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ {t("Nhà hàng")}
          <Badge variant="secondary" className="text-xs">{t("Điều tour")}</Badge>
        </h3>
        {selectedKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handlePrintSelected}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              {t("In ĐNTT")} ({selectedKeys.length})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKeys([])}>
              {t("Bỏ chọn")}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-xs min-w-[820px] print:min-w-0">
          <colgroup>
            <col className="w-[28px]" />
            <col className="w-[64px]" />
            <col />
            <col className="w-[56px]" />
            <col className="w-[108px]" />
            <col className="w-[136px]" />
            <col className="w-[64px]" />
            <col className="w-[110px]" />
            <col className="w-[70px]" />
            <col className="w-[180px]" />
            <col className="w-[150px]" />
            <col className="w-[104px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead>
            <tr className="bg-muted/50 border-b border-border text-[11px] font-medium text-muted-foreground">
              <th className="px-2 py-1.5 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => v ? setSelectedKeys(mealKeys) : setSelectedKeys([])}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="px-3 py-2 text-center font-medium">{t("Ngày")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("Nhà hàng")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("Số khách")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("Đơn giá")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("CK%")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Thành tiền")}</th>
              <th className="px-2 py-2 text-center font-medium">{t("Nguồn")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("TT ĐNTT")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("TT Thanh toán")}</th>
              <th className="px-2 py-2 text-center font-medium">{t("Hóa đơn")}</th>
              <th className="px-2 py-2 sticky right-0 z-20 bg-muted" />
            </tr>
          </thead>
          <tbody>
            {meals.map((meal) => (
              <NHRow
                key={`${meal.doan_ngay_id}_${meal.bua_an}`}
                meal={meal}
                data={nhRowData}
                handlers={nhRowHandlers}
                locked={locked}
              />
            ))}
            <NHOrphanRows
              meals={meals}
              chiPhiRows={chiPhiRows}
              dnttList={dnttList}
              congNoList={congNoList}
            />
          </tbody>
        </table>
      </div>

      <NHDnttModal
        row={dnttModalRow}
        extras={dnttModalExtras}
        nh={dnttModalNh}
        mode={dnttModalMode}
        onModeChange={setDnttModalMode}
        depositAmount={dnttDepositAmount}
        onDepositAmountChange={setDnttDepositAmount}
        alreadyPaid={dnttAlreadyPaid}
        bsAmount={dnttBsAmount}
        onBsAmountChange={setDnttBsAmount}
        ngayCan={dnttNgayCan}
        onNgayCanChange={setDnttNgayCan}
        canTru={dnttModalCanTru}
        onCanTruChange={setDnttModalCanTru}
        submitting={dnttSubmitting}
        mainCoverVe={dnttModalCoverVe}
        onClose={closeDnttModal}
        onSubmit={handleDnttSubmit}
      />

      <NHAggCommitModal
        target={aggCommit}
        reason={aggReason}
        onReasonChange={setAggReason}
        ngayCan={aggNgayCan}
        onNgayCanChange={setAggNgayCan}
        surplusMode={aggSurplusMode}
        onSurplusModeChange={setAggSurplusMode}
        canTru={aggCanTru}
        onCanTruChange={setAggCanTru}
        submitting={insertPending}
        onClose={closeAggCommit}
        onSubmit={handleAggCommit}
      />

      <NHCancelModal
        target={cancelTarget}
        mode={cancelMode}
        onModeChange={setCancelMode}
        submitting={cancelPending}
        onClose={() => setCancelTarget(null)}
        onSubmit={handleCancelSubmit}
      />

      <DNTTNHPreviewModal
        open={!!previewNHData}
        data={previewNHData}
        onClose={() => setPreviewNHData(null)}
      />

      <DungVoucherModal
        target={voucherTarget}
        onClose={closeVoucher}
        onSelect={handleApplyVoucher}
        submitting={voucherSubmitting}
      />
    </div>
  );
});

export default ChiPhiNHSection;
