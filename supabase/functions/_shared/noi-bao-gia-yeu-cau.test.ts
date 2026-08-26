import { describe, it, expect } from "vitest";
import { tinhBackfillYeuCau, tinhPatchBaoGia } from "./noi-bao-gia-yeu-cau";

describe("tinhBackfillYeuCau — điền crm_yeu_cau_id cho dòng cũ bên cổng", () => {
  it("bắc cầu qua lead: dòng thiếu được gán đúng yêu cầu CRM", () => {
    const ra = tinhBackfillYeuCau(
      [{ id: 1, crm_lead_id: 88, crm_yeu_cau_id: null }],
      [{ id: 501, lead_id: 88 }],
    );
    expect(ra).toEqual([{ id: 1, crm_yeu_cau_id: 501 }]);
  });

  it("bỏ qua dòng đã có, dòng không có lead, và lead không tra ra yêu cầu nào", () => {
    const ra = tinhBackfillYeuCau(
      [
        { id: 1, crm_lead_id: 88, crm_yeu_cau_id: 501 },
        { id: 2, crm_lead_id: null, crm_yeu_cau_id: null },
        { id: 3, crm_lead_id: 99, crm_yeu_cau_id: null },
      ],
      [{ id: 501, lead_id: 88 }],
    );
    expect(ra).toEqual([]);
  });

  it("KHÔNG gán chồng lên một yêu cầu CRM đã có chủ — cột đó UNIQUE", () => {
    const ra = tinhBackfillYeuCau(
      [
        { id: 1, crm_lead_id: 88, crm_yeu_cau_id: 501 },
        { id: 2, crm_lead_id: 88, crm_yeu_cau_id: null },
      ],
      [{ id: 501, lead_id: 88 }],
    );
    expect(ra).toEqual([]);
  });

  it("hai dòng cổng cùng trỏ một lead: chỉ dòng đầu được gán", () => {
    const ra = tinhBackfillYeuCau(
      [
        { id: 5, crm_lead_id: 88, crm_yeu_cau_id: null },
        { id: 2, crm_lead_id: 88, crm_yeu_cau_id: null },
      ],
      [{ id: 501, lead_id: 88 }],
    );
    expect(ra).toEqual([{ id: 2, crm_yeu_cau_id: 501 }]);
  });
});

describe("tinhPatchBaoGia — chỉ ghi thứ thật sự đổi", () => {
  const map = new Map([[501, 11], [502, 12]]);

  it("gom các báo giá cùng một yêu cầu vào một lệnh", () => {
    const ra = tinhPatchBaoGia(
      [
        { crm_bao_gia_id: 7, crm_yeu_cau_id: 501 },
        { crm_bao_gia_id: 3, crm_yeu_cau_id: 501 },
        { crm_bao_gia_id: 9, crm_yeu_cau_id: 502 },
      ],
      map,
      new Map(),
    );
    expect(ra).toEqual([
      { yeuCauId: 11, crmBaoGiaIds: [3, 7] },
      { yeuCauId: 12, crmBaoGiaIds: [9] },
    ]);
  });

  it("dòng đã đúng thì không ghi lại", () => {
    const ra = tinhPatchBaoGia(
      [{ crm_bao_gia_id: 7, crm_yeu_cau_id: 501 }],
      map,
      new Map([[7, 11]]),
    );
    expect(ra).toEqual([]);
  });

  it("báo giá không thuộc yêu cầu nào và bên cổng cũng đang trống → không ghi", () => {
    const ra = tinhPatchBaoGia(
      [{ crm_bao_gia_id: 7, crm_yeu_cau_id: null }],
      map,
      new Map([[7, null]]),
    );
    expect(ra).toEqual([]);
  });

  it("CRM đã gỡ liên kết → gỡ luôn bên cổng", () => {
    const ra = tinhPatchBaoGia(
      [{ crm_bao_gia_id: 7, crm_yeu_cau_id: null }],
      map,
      new Map([[7, 11]]),
    );
    expect(ra).toEqual([{ yeuCauId: null, crmBaoGiaIds: [7] }]);
  });

  it("chưa map được yêu cầu (bản sao bên cổng chưa có) → GIỮ NGUYÊN, không xoá", () => {
    const ra = tinhPatchBaoGia(
      [{ crm_bao_gia_id: 7, crm_yeu_cau_id: 999 }],
      map,
      new Map([[7, null]]),
    );
    expect(ra).toEqual([]);
  });

  it("nhóm gỡ liên kết xếp cuối để đọc log cho dễ", () => {
    const ra = tinhPatchBaoGia(
      [
        { crm_bao_gia_id: 1, crm_yeu_cau_id: null },
        { crm_bao_gia_id: 2, crm_yeu_cau_id: 502 },
        { crm_bao_gia_id: 3, crm_yeu_cau_id: 501 },
      ],
      map,
      new Map([[1, 11], [2, null], [3, null]]),
    );
    expect(ra.map((n) => n.yeuCauId)).toEqual([11, 12, null]);
  });
});
