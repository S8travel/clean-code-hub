import { describe, it, expect } from "vitest";
import { ketQuaThanhLoi } from "./portal-thong-bao";
import type { KetQuaDay } from "@/hooks/use-portal-push";

const kq = (over: Partial<KetQuaDay> = {}): KetQuaDay => ({
  bao_gia: 0, doan: 0, xoa: 0, bo_qua: [], agent_thieu_tai_khoan: [], ...over,
});

describe("ketQuaThanhLoi — chỉ báo xanh khi đối tác thực sự xem được", () => {
  it("đẩy 0 dòng KHÔNG được báo thành công", () => {
    const r = ketQuaThanhLoi(kq());
    expect(r.kieu).toBe("warning");
  });

  it("đẩy 0 dòng thì nói thẳng lý do của dòng đầu tiên", () => {
    const r = ketQuaThanhLoi(kq({
      bo_qua: [{ loai: "bao_gia", id: 25, ly_do: "chưa chốt bảng giá" }],
    }));
    expect(r.kieu).toBe("warning");
    expect(r.loi).toContain("chưa chốt bảng giá");
  });

  it("nhiều dòng bị bỏ qua thì nêu thêm số còn lại, không nuốt mất", () => {
    const r = ketQuaThanhLoi(kq({
      bo_qua: [
        { loai: "bao_gia", id: 1, ly_do: "chưa chọn Đối tác bán" },
        { loai: "doan", id: 2, ly_do: "đoàn đã hủy" },
        { loai: "doan", id: 3, ly_do: "đoàn chưa gắn đối tác" },
      ],
    }));
    expect(r.loi).toContain("và 2 dòng khác");
  });

  it("đẩy được nhưng đối tác chưa có tài khoản → cảnh báo, vì họ VẪN chưa xem được", () => {
    const r = ketQuaThanhLoi(kq({
      bao_gia: 1,
      agent_thieu_tai_khoan: [{ crm_agent_id: 2, ten: "Cola" }],
    }));
    expect(r.kieu).toBe("warning");
    expect(r.loi).toContain("Cola");
    expect(r.loi).toContain("chưa có tài khoản");
  });

  it("mọi thứ trót lọt mới báo xanh", () => {
    const r = ketQuaThanhLoi(kq({ bao_gia: 2, doan: 1 }));
    expect(r.kieu).toBe("success");
    expect(r.loi).toContain("2 báo giá, 1 đoàn");
  });

  it("có gỡ dòng khỏi cổng thì nói rõ đã gỡ mấy dòng", () => {
    const r = ketQuaThanhLoi(kq({ bao_gia: 1, doan: 0, xoa: 3 }));
    expect(r.loi).toContain("gỡ 3 dòng");
  });
});
