// Chạy useSaveDieuTour THẬT trên PostgREST giả (src/test/fake-postgrest.ts).
//
// Vì sao có file này: lưu Điều tour từng ghi lại TOÀN BỘ đoàn mỗi 1,5 giây OP gõ (~55 lượt
// gọi nối đuôi, ~8 giây; mỗi lệnh `update doan` y nguyên còn làm mọi máy tải lại danh sách
// đoàn — sự cố 02/10/2026). Bản tối ưu đọc gộp + bỏ lệnh ghi y nguyên. Đã đối chiếu từng
// bảng với bản gốc trên đủ các tình huống ở src/test/dieu-tour-tinh-huong.ts (DB ra y hệt);
// test này giữ lại các kết quả nghiệp vụ + trần số lượt gọi để không ai vô tình lùi lại.
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { FakeDb } from "@/test/fake-postgrest";
import { taoDb } from "@/test/dieu-tour-fixture";
import { TINH_HUONG } from "@/test/dieu-tour-tinh-huong";

const h = vi.hoisted(() => ({ db: null as unknown as { client(): { from(t: string): unknown } } }));
vi.mock("@/lib/supabase-external", () => ({
  externalSupabase: { from: (t: string) => h.db.client().from(t) },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { user_id: "u1", ho_ten: "Tester", role: "dieu_hanh" } }),
}));
vi.mock("@/hooks/use-chi-phi-lock", () => ({ useChiPhiLockGuard: () => () => {} }));

import { useSaveDieuTour } from "./use-dieu-tour";

type Row = Record<string, unknown>;

async function luu(ten: string) {
  const th = TINH_HUONG.find((t) => t.ten === ten);
  if (!th) throw new Error(`không có tình huống "${ten}"`);
  const du = taoDb();
  th.chuanBi?.(du);
  const db = new FakeDb(du);
  h.db = db;
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const { result } = renderHook(() => useSaveDieuTour(), { wrapper });
  const kq = await result.current.mutateAsync(th.payload());
  await new Promise((r) => setTimeout(r, 0)); // nhật ký ghi kiểu fire-and-forget
  const tim = (bang: string, loc: (r: Row) => boolean) => db.rows(bang).filter(loc);
  return { db, kq, tim };
}

describe("useSaveDieuTour — lưu Điều tour", () => {
  it("lưu lại y nguyên → KHÔNG ghi gì (không bắn realtime), ít lượt gọi", async () => {
    const { db, kq } = await luu("lưu lại y nguyên");
    expect(db.soLenhGhi()).toBe(0);
    expect(kq.doanUpdated).toBe(false);
    expect(db.nhatKy.length).toBeLessThanOrEqual(20); // bản cũ: 52 lượt, 15 lệnh ghi
  });

  it("đổi trường của đoàn → mới ghi bảng doan, kèm nhật ký", async () => {
    const { db, kq, tim } = await luu("đổi bảng đón (trường của đoàn)");
    expect(kq.doanUpdated).toBe(true);
    expect(tim("doan", () => true)[0].bang_don).toBe("S8 TRAVEL");
    expect(db.soLenhGhi("doan_ngay") + db.soLenhGhi("doan_ngay_item")).toBe(0);
    expect(tim("activity_log", () => true).map((r) => r.mo_ta)).toEqual([`Đổi bảng đơn "S8" → "S8 TRAVEL"`]);
  });

  it("đổi nhà hàng trưa ngày 2 → xoá booking chưa gửi + chi phí cũ chưa trả, tạo dòng mới có snapshot", async () => {
    const { db, kq, tim } = await luu("đổi nhà hàng trưa ngày 2 (booking chưa gửi bị xoá, chi phí cũ thành mồ côi)");
    expect(tim("doan_booking_nh", (r) => r.id === 3003)).toHaveLength(0);
    expect(kq.nhBookingLacDeleted).toBe(1);
    expect(tim("doan_chi_phi", (r) => r.id === 2103)).toHaveLength(0);
    expect(kq.nhOrphanDeleted).toBe(1);
    const moi = tim("doan_chi_phi", (r) => r.danh_muc === "nha_hang" && r.ngay_so === 2);
    expect(moi).toHaveLength(1);
    expect(moi[0]).toMatchObject({ mo_ta: "NH DAO (trưa)", nha_cung_cap_id: 9, tien_cong_ty: 0, ref_doan_ngay_id: 102 });
    // Ngày 1 và 3 không đổi → không bị ghi lại
    expect(db.nhatKy.filter((l) => l.bang === "doan_ngay" && l.lenh === "update")).toHaveLength(1);
  });

  it("thêm cảnh điểm có phí → tạo item + chi phí; gỡ cảnh điểm → xoá cả item lẫn chi phí", async () => {
    const { tim } = await luu("thêm cảnh điểm ngày 1, gỡ cảnh điểm ngày 3");
    const item = tim("doan_ngay_item", (r) => r.doan_ngay_id === 101 && r.canh_diem_id === 5);
    expect(item).toHaveLength(1);
    expect(item[0]).toMatchObject({ thu_tu: 3, don_gia: 500000, so_luong: 20, co_phi: true });
    expect(tim("doan_chi_phi", (r) => r.ref_doan_ngay_item_id === item[0].id)[0])
      .toMatchObject({ mo_ta: "Cáp treo", so_luong: 20, don_gia: 500000, tien_cong_ty: 10000000, nha_cung_cap_id: 8 });
    expect(tim("doan_ngay_item", (r) => r.id === 1004)).toHaveLength(0);
    expect(tim("doan_chi_phi", (r) => r.id === 2003)).toHaveLength(0);
  });

  it("đổi số khách → item + chi phí tính lại (FOC theo snapshot), xoá điều chỉnh thực tế cũ", async () => {
    const { kq, tim } = await luu("đổi số khách 20 → 25");
    expect(tim("doan_ngay_item", () => true).every((r) => r.so_luong === 25)).toBe(true);
    expect(tim("doan_chi_phi", (r) => r.id === 2001)[0]).toMatchObject({ so_luong: 25, tien_cong_ty: 7500000 });
    // FOC 15 miễn 1: 25 khách → tính 24; HDV trả
    expect(tim("doan_chi_phi", (r) => r.id === 2002)[0]).toMatchObject({ so_luong: 25, tien_hdv: 14400000, tien_cong_ty: 0 });
    expect(kq.thucTeClearCount).toBe(3);
    expect(kq.doanUpdated).toBe(true);
  });

  it("cảnh điểm hai nhóm cùng ngày → chi phí gộp số khách cả hai nhóm", async () => {
    const { tim } = await luu("lưu nhóm 2 với số khách khác → chi phí gộp tính lại");
    expect(tim("doan_chi_phi", (r) => r.id === 2001)[0]).toMatchObject({ so_luong: 26, tien_cong_ty: 7800000 });
  });

  it("chi phí OP đã sửa tay → giữ số lượng/tiền, chỉ đổi tên theo danh mục", async () => {
    const { tim } = await luu("chi phí OP đã sửa tay (is_overridden) + đổi tên cảnh điểm trong danh mục");
    expect(tim("doan_chi_phi", (r) => r.id === 2001)[0])
      .toMatchObject({ mo_ta: "Vịnh Hạ Long (tàu)", so_luong: 18, tien_cong_ty: 5400000 });
  });

  it("nhà hàng ngoài danh mục cả trưa lẫn tối → chỉ MỘT dòng chi phí (bữa sau thấy dòng bữa trước)", async () => {
    const { tim } = await luu("nhà hàng không có trong danh mục cả trưa lẫn tối (mo_ta rỗng trùng nhau)");
    expect(tim("doan_chi_phi", (r) => r.danh_muc === "nha_hang" && r.ngay_so === 3 && r.mo_ta === "")).toHaveLength(1);
  });

  it("ngày chỉ còn dòng cảnh điểm canh_diem_id NULL → được dọn khi bỏ hết cảnh điểm", async () => {
    const { tim } = await luu("ngày chỉ còn dòng cảnh điểm canh_diem_id NULL sót lại, bỏ hết cảnh điểm");
    expect(tim("doan_ngay_item", (r) => r.doan_ngay_id === 103)).toHaveLength(0);
  });

  it("dòng ghi chú tự do → chỉ ghi vào ngày (đúng chỗ, bỏ dòng rỗng), không đụng cảnh điểm / chi phí", async () => {
    const { db, tim } = await luu("thêm dòng ghi chú tự do ngày 1 (đầu ngày + cuối ngày)");
    expect(tim("doan_ngay", (r) => r.id === 101)[0].dong_ghi_chu).toEqual([
      { sau: 0, noi_dung: "Bay VN1823 HAN→PQC 07:00" },
      { sau: 2, noi_dung: "19:00 Gala dinner" },
    ]);
    expect(db.nhatKy.filter((l) => l.bang === "doan_ngay" && l.lenh === "update")).toHaveLength(1);
    expect(db.soLenhGhi("doan_ngay_item") + db.soLenhGhi("doan_chi_phi")).toBe(0);
    expect(tim("activity_log", () => true).map((r) => r.mo_ta)).toEqual([
      `Ngày 1: thêm ghi chú "Bay VN1823 HAN→PQC 07:00"`,
      `Ngày 1: thêm ghi chú "19:00 Gala dinner"`,
    ]);
  });

  it("ngày đã có dòng ghi chú, lưu lại y nguyên → KHÔNG ghi gì", async () => {
    const { db } = await luu("lưu lại y nguyên khi ngày đã có dòng ghi chú");
    expect(db.soLenhGhi()).toBe(0);
  });

  it("đổi set menu → booking nhà hàng nhận set mới + món", async () => {
    const { tim } = await luu("đổi set menu trưa ngày 1");
    expect(tim("doan_booking_nh", (r) => r.id === 3001)[0])
      .toMatchObject({ set_menu_id: 51, ten_set_snapshot: "Set B", gia_snapshot: 250000, mon_an_snapshot: ["Bún chả", "Nem"] });
  });

  it("KS mới → tạo booking; KS khách tự trả → xoá booking chưa gửi; KS từng hủy quay lại → mở lại", async () => {
    expect((await luu("đổi khách sạn ngày 2 sang KS mới")).tim("doan_booking_ks", (r) => r.khach_san_id === 902)).toHaveLength(1);
    expect((await luu("cả đoàn chuyển sang KS khách tự trả (booking chưa gửi bị xoá)")).tim("doan_booking_ks", () => true)).toHaveLength(0);
    expect((await luu("KS từng hủy (da_huy) quay lại tour")).tim("doan_booking_ks", () => true)[0].trang_thai).toBe("active");
  });

  it("thêm ngày mới chưa có id → tạo ngày, cảnh điểm, chi phí và booking KS", async () => {
    const { tim } = await luu("thêm ngày 4 mới (chưa có id) có cảnh điểm + nhà hàng");
    const ngay4 = tim("doan_ngay", (r) => r.ngay_so === 4 && r.doan_nhom_id === 10);
    expect(ngay4).toHaveLength(1);
    expect(tim("doan_ngay_item", (r) => r.doan_ngay_id === ngay4[0].id)).toHaveLength(1);
    expect(tim("doan_chi_phi", (r) => r.ngay_so === 4).map((r) => r.mo_ta).sort()).toEqual(["Cáp treo", "NH SEN (trưa)"]);
    expect(tim("doan_booking_ks", (r) => r.khach_san_id === 902)).toHaveLength(1);
  });
});
