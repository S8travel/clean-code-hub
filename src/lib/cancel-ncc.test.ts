import { describe, it, expect } from "vitest";
import { needAskNcc, suggestNcc } from "./cancel-ncc";

describe("needAskNcc — phải mirror nguồn mà guard hủy đọc (dòng chi phí)", () => {
  // ĐÂY LÀ CA GÂY BUG: dòng chi phí chưa gắn NCC, nhưng nhà hàng master CÓ NCC.
  // UI cũ xét master → kết luận "không cần hỏi" → ô chọn không hiện; guard vẫn
  // chặn → OP bế tắc, không hủy-cấn-trừ được.
  it("dòng chi phí trống NHƯNG master có NCC → VẪN phải hỏi", () => {
    expect(needAskNcc({ chiPhiNccId: null, masterNccId: 7 })).toBe(true);
  });

  it("dòng chi phí có NCC → không hỏi (guard tự resolve được)", () => {
    expect(needAskNcc({ chiPhiNccId: 7, masterNccId: null })).toBe(false);
  });

  it("cả hai trống → phải hỏi", () => {
    expect(needAskNcc({ chiPhiNccId: null, masterNccId: null })).toBe(true);
  });

  it("undefined coi như trống", () => {
    expect(needAskNcc({ chiPhiNccId: undefined })).toBe(true);
  });

  it("id = 0 coi như trống (không có NCC id hợp lệ nào bằng 0)", () => {
    expect(needAskNcc({ chiPhiNccId: 0 })).toBe(true);
  });
});

describe("suggestNcc — master chỉ để điền sẵn cho OP xác nhận", () => {
  it("master có NCC → gợi ý chính nó", () => {
    expect(suggestNcc({ chiPhiNccId: null, masterNccId: 7 })).toBe(7);
  });

  it("master trống → không gợi ý, OP tự chọn", () => {
    expect(suggestNcc({ chiPhiNccId: null, masterNccId: null })).toBeNull();
    expect(suggestNcc({ chiPhiNccId: null })).toBeNull();
  });
});
