import { describe, it, expect } from "vitest";
import {
  soSanhXacNhan,
  type BanXacNhan,
  type KhachSanXacNhan,
} from "./ks-xac-nhan-diff";

const ks = (p: Partial<KhachSanXacNhan> & { ten: string }): KhachSanXacNhan => ({
  dia_chi: null,
  dien_thoai: null,
  ma_code: null,
  nhan_phong: "2026-09-09",
  tra_phong: "2026-09-11",
  dem: [],
  ...p,
});

const ban = (...list: KhachSanXacNhan[]): BanXacNhan => ({ version: 1, khach_san: list });

describe("soSanhXacNhan", () => {
  it("lần đầu có bản xác nhận không phải là thay đổi", () => {
    expect(soSanhXacNhan(null, ban(ks({ ten: "ROSAMIA" })))).toEqual([]);
  });

  it("hai bản giống hệt → không sinh phiên bản mới", () => {
    const a = ban(ks({ ten: "ROSAMIA", ma_code: "ABC" }));
    const b = ban(ks({ ten: "ROSAMIA", ma_code: "ABC" }));
    expect(soSanhXacNhan(a, b)).toEqual([]);
  });

  it("đổi khách sạn → báo bỏ cái cũ rồi thêm cái mới, bỏ đứng trước", () => {
    const kq = soSanhXacNhan(ban(ks({ ten: "ROSAMIA" })), ban(ks({ ten: "ROSEMARY" })));
    expect(kq.map((t) => t.kieu)).toEqual(["bo_ks", "them_ks"]);
    expect(kq[0]).toMatchObject({ ks: "ROSAMIA", tu: "2026-09-09~2026-09-11" });
    expect(kq[1]).toMatchObject({ ks: "ROSEMARY", den: "2026-09-09~2026-09-11" });
  });

  it("lùi ngày trả phòng", () => {
    const kq = soSanhXacNhan(
      ban(ks({ ten: "ROSAMIA", tra_phong: "2026-09-11" })),
      ban(ks({ ten: "ROSAMIA", tra_phong: "2026-09-12" })),
    );
    expect(kq).toEqual([
      { kieu: "doi_ngay", ks: "ROSAMIA", tu: "2026-09-09~2026-09-11", den: "2026-09-09~2026-09-12" },
    ]);
  });

  it("đổi số phòng một đêm — chỉ báo đúng đêm đó", () => {
    const truoc = ban(ks({
      ten: "ROSAMIA",
      dem: [
        { ngay: "2026-09-09", phong: "10 twn" },
        { ngay: "2026-09-10", phong: "10 twn" },
      ],
    }));
    const sau = ban(ks({
      ten: "ROSAMIA",
      dem: [
        { ngay: "2026-09-09", phong: "10 twn" },
        { ngay: "2026-09-10", phong: "11 twn" },
      ],
    }));
    expect(soSanhXacNhan(truoc, sau)).toEqual([
      { kieu: "doi_phong", ks: "ROSAMIA", ngay: "2026-09-10", tu: "10 twn", den: "11 twn" },
    ]);
  });

  it("bỏ hẳn một đêm cũng phải hiện, không im lặng", () => {
    const truoc = ban(ks({
      ten: "ROSAMIA",
      dem: [
        { ngay: "2026-09-09", phong: "10 twn" },
        { ngay: "2026-09-10", phong: "10 twn" },
      ],
    }));
    const sau = ban(ks({
      ten: "ROSAMIA",
      dem: [{ ngay: "2026-09-09", phong: "10 twn" }],
    }));
    expect(soSanhXacNhan(truoc, sau)).toEqual([
      { kieu: "doi_phong", ks: "ROSAMIA", ngay: "2026-09-10", tu: "10 twn", den: "" },
    ]);
  });

  it("đổi mã code / địa điểm / địa chỉ / điện thoại đều vào log", () => {
    const kq = soSanhXacNhan(
      ban(ks({ ten: "ROSAMIA", ma_code: "A1", dia_diem: "沙壩", dia_chi: "Cũ", dien_thoai: "024" })),
      ban(ks({ ten: "ROSAMIA", ma_code: "A2", dia_diem: "河內", dia_chi: "Mới", dien_thoai: "028" })),
    );
    expect(kq.map((t) => t.kieu))
      .toEqual(["doi_ma_code", "doi_dia_diem", "doi_dia_chi", "doi_dien_thoai"]);
  });

  it("ô phòng là free text — thêm chữ vào cũng là một thay đổi phải báo", () => {
    const kq = soSanhXacNhan(
      ban(ks({ ten: "SAPALY", dem: [{ ngay: "2026-09-09", phong: "5 cabin" }] })),
      ban(ks({ ten: "SAPALY", dem: [{ ngay: "2026-09-09", phong: "5 cabin + 1 vé lẻ HDV" }] })),
    );
    expect(kq).toEqual([
      { kieu: "doi_phong", ks: "SAPALY", ngay: "2026-09-09", tu: "5 cabin", den: "5 cabin + 1 vé lẻ HDV" },
    ]);
  });

  it("khoảng trắng thừa không tính là thay đổi", () => {
    const kq = soSanhXacNhan(
      ban(ks({ ten: "ROSAMIA", ma_code: "A1" })),
      ban(ks({ ten: " ROSAMIA ", ma_code: " A1 " })),
    );
    expect(kq).toEqual([]);
  });

  it("bản xác nhận rỗng đi (gỡ hết khách sạn) vẫn báo bỏ từng cái", () => {
    const kq = soSanhXacNhan(ban(ks({ ten: "ROSAMIA" }), ks({ ten: "ROSEMARY" })), ban());
    expect(kq.map((t) => t.kieu)).toEqual(["bo_ks", "bo_ks"]);
  });

  it("khách sạn không có tên thì bỏ qua, không dựng dòng log rỗng", () => {
    const kq = soSanhXacNhan(ban(), ban(ks({ ten: "  " })));
    expect(kq).toEqual([]);
  });
});
