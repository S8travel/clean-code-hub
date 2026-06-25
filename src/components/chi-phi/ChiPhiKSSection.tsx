import { Printer } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveKSFoc } from "@/lib/foc-calc";
import { calcTotalKS } from "@/lib/foc-calc";
import KSDNTTModal from "./KSDNTTModal";
import KSAdjustModal from "./KSAdjustModal";
import DNTTKSPreviewModal from "./DNTTKSPreviewModal";
import KSCard from "./KSCard";
import KSCancelModal from "./KSCancelModal";
import KSAggCommitModal from "./KSAggCommitModal";
import KSLegacyAdjustModal from "./KSLegacyAdjustModal";
import KSNgoaiTourPanel from "./KSNgoaiTourPanel";
import { useKSSection } from "./use-ks-section";
import { t, useTranslate } from "@/lib/i18n";

// Re-export shared types — giữ tương thích cho importer cũ.
export type { KSLoaiRow, LocalKSRow } from "./ks-section-shared";

interface Props {
  doanId: number;
  soKhach?: number;
  tenDoan?: string;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// Tab Chi phí Khách sạn — chỉ render. Toàn bộ state/logic ở useKSSection.
export default function ChiPhiKSSection({ doanId, soKhach = 0, tenDoan = "", locked = false }: Props) {
  useTranslate();
  const s = useKSSection({ doanId, soKhach, tenDoan });
  const {
    ksLoading,
    localRows,
    distinctKsIdsFromNgay,
    cardData, cardHandlers,
    selectedKsIds, setSelectedKsIds,
    allSelected, ksWithDnttSelected,
    batchPrinting,
    handlePrintSelected, handleExportExcel,
    activeDnttByKs,
    previewItems, setPreviewItems,
    modalOpen, setModalOpen, modalKsId, setModalKsId,
    khachSanMap, grouped, cocByKs, canTruAmtByKsId,
    canTruByKs, setCanTruByKs,
    ksAdjustTarget, setKsAdjustTarget,
    aggCommit, aggCommitMode, setAggCommitMode,
    aggDepositAmount, setAggDepositAmount,
    aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru,
    handleAggCommit, closeAggCommit, insertPending,
    adjustTarget, setAdjustTarget,
    adjustAmount, setAdjustAmount,
    adjustReason, setAdjustReason,
    adjustSurplusMode, setAdjustSurplusMode,
    handleLegacyAdjustSubmit, legacyAdjustSubmitDisabled, closeLegacyAdjust,
    cancelTarget, setCancelTarget, cancelMode, setCancelMode,
    handleCancelSubmit, cancelPending,
  } = s;

  if (ksLoading) return <div className="text-sm text-muted-foreground">{t("Đang tải KS...")}</div>;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-900 px-3 py-1.5 rounded-md">
        🏨 {t("Khách sạn")}
        <Badge variant="secondary" className="text-xs">
          {t("Điều tour")}
        </Badge>
      </h3>

      {distinctKsIdsFromNgay.length === 0 && localRows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("Chưa có chi phí khách sạn.")}</p>
      )}

      {/* Toolbar select + print */}
      {distinctKsIdsFromNgay.length > 0 && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) =>
                v ? setSelectedKsIds([...distinctKsIdsFromNgay]) : setSelectedKsIds([])
              }
              id="select-all-ks"
            />
            <label htmlFor="select-all-ks" className="text-xs text-muted-foreground cursor-pointer select-none">
              {selectedKsIds.length > 0
                ? `${t("Đã chọn")} ${selectedKsIds.length}/${distinctKsIdsFromNgay.length} KS`
                : t("Chọn tất cả")}
            </label>
          </div>
          {selectedKsIds.length > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => handlePrintSelected(activeDnttByKs)}
                disabled={ksWithDnttSelected === 0}
                title={ksWithDnttSelected === 0 ? t("Không có KS nào đang có ĐNTT") : undefined}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                {`${t("In Word")}${ksWithDnttSelected > 0 ? ` (${ksWithDnttSelected})` : ""}`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleExportExcel(activeDnttByKs)}
                disabled={batchPrinting || ksWithDnttSelected === 0}
                title={ksWithDnttSelected === 0 ? t("Không có KS nào đang có ĐNTT") : undefined}
              >
                {t("Xuất Excel")}{ksWithDnttSelected > 0 ? ` (${ksWithDnttSelected})` : ""}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKsIds([])}>
                {t("Bỏ chọn")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Render từng KS có trong doan_ngay (không phụ thuộc localRows nữa) */}
      {distinctKsIdsFromNgay.map((ksId) => (
        <KSCard key={ksId} ksId={ksId} data={cardData} handlers={cardHandlers} locked={locked} />
      ))}

      {/* Khách sạn ngoài tour — chi phí KS tự do không gắn lịch trình (panel độc lập) */}
      <KSNgoaiTourPanel doanId={doanId} tenDoan={tenDoan} locked={locked} />

      {/* "Điều chỉnh" modal — per-booking, sửa so_phong/gia_phong nhiều row sau khi paid */}
      {ksAdjustTarget && (
        <KSAdjustModal
          open={true}
          onClose={() => setKsAdjustTarget(null)}
          doanId={doanId}
          ksName={ksAdjustTarget.ksName}
          rows={ksAdjustTarget.rows}
          focKhach={ksAdjustTarget.focKhach}
          focMien={ksAdjustTarget.focMien}
          sumPaid={ksAdjustTarget.sumPaid}
        />
      )}

      {/* ĐNTT Modal */}
      {modalOpen && modalKsId != null && (
        <KSDNTTModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalKsId(null);
          }}
          doanId={doanId}
          ksId={modalKsId}
          ksName={khachSanMap[modalKsId]?.ten || `KS #${modalKsId}`}
          nccId={khachSanMap[modalKsId]?.nha_cung_cap_id || null}
          nccTen={khachSanMap[modalKsId]?.ten_ncc || null}
          nccStk={khachSanMap[modalKsId]?.ncc_so_tai_khoan || null}
          nccNganHang={khachSanMap[modalKsId]?.ncc_ngan_hang || null}
          totalKS={(() => {
            // Loại dòng dịch vụ HDV trả khỏi ĐNTT (công ty không trả phần này)
            const modalRows = (grouped[modalKsId] || []).filter((r) => !r.is_hdv);
            const modalKs = khachSanMap[modalKsId];
            // Dùng FOC snapshot per tour (giống display card) — không lấy master trực tiếp
            const modalFoc = resolveKSFoc(modalRows, modalKs);
            return calcTotalKS(modalRows, modalFoc.foc_khach, modalFoc.foc_mien);
          })()}
          daCoc={(cocByKs[modalKsId] || 0) + (canTruAmtByKsId[modalKsId] || 0)}
          localRows={(grouped[modalKsId] || []).filter((r) => !r.is_hdv)}
          chiPhiRowIds={(grouped[modalKsId] || []).filter((r) => r.id && !r.is_hdv).map((r) => r.id!)}
          canTru={canTruByKs[modalKsId] ?? []}
          onCanTruChange={(v) => setCanTruByKs((prev) => ({ ...prev, [modalKsId]: v }))}
          tenDoanMoi={tenDoan}
          serviceDate={(() => {
            const rows = grouped[modalKsId] || [];
            const dates = rows.map((r) => r.ngay_date).filter(Boolean).sort();
            return dates[0] || undefined;
          })()}
        />
      )}

      {/* Aggregate Commit Dialog — chốt chênh lệch sau OP edit so_phong/gia_phong/FOC */}
      <KSAggCommitModal
        target={aggCommit}
        commitMode={aggCommitMode}
        onCommitModeChange={setAggCommitMode}
        depositAmount={aggDepositAmount}
        onDepositAmountChange={setAggDepositAmount}
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

      {/* Adjustment dialog (legacy — vẫn giữ code nhưng button đã ẩn) */}
      <KSLegacyAdjustModal
        target={adjustTarget}
        amount={adjustAmount}
        onAmountChange={setAdjustAmount}
        reason={adjustReason}
        onReasonChange={setAdjustReason}
        surplusMode={adjustSurplusMode}
        onSurplusModeChange={setAdjustSurplusMode}
        submitDisabled={legacyAdjustSubmitDisabled}
        onClose={closeLegacyAdjust}
        onSubmit={handleLegacyAdjustSubmit}
      />

      {/* Cancel dialog */}
      <KSCancelModal
        target={cancelTarget}
        mode={cancelMode}
        onModeChange={setCancelMode}
        submitting={cancelPending}
        onClose={() => setCancelTarget(null)}
        onSubmit={handleCancelSubmit}
      />

      {/* ĐNTT preview modal */}
      <DNTTKSPreviewModal
        open={!!previewItems}
        items={previewItems ?? []}
        onClose={() => setPreviewItems(null)}
      />
    </div>
  );
}
