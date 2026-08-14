import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CHI_PHI_MUTATION_KEY, waitForChiPhiWrites } from "./chi-phi-writes";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bắn 1 lệnh ghi chi phí "đang bay" giống blur-save (fire-and-forget). */
function batLenhGhi(qc: QueryClient, keoDaiMs: number) {
  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: CHI_PHI_MUTATION_KEY,
    mutationFn: async () => {
      await sleep(keoDaiMs);
      return { ok: true };
    },
  });
  return mutation.execute(undefined);
}

describe("waitForChiPhiWrites", () => {
  it("không có lệnh nào đang bay → trả true ngay", async () => {
    const qc = new QueryClient();
    await expect(waitForChiPhiWrites(qc, 500, 5)).resolves.toBe(true);
  });

  it("chờ lệnh ghi đang bay xong RỒI mới trả về", async () => {
    const qc = new QueryClient();
    let xong = false;
    const p = batLenhGhi(qc, 120).then(() => { xong = true; });

    const ok = await waitForChiPhiWrites(qc, 2000, 5);
    expect(ok).toBe(true);
    expect(xong).toBe(true); // KHÔNG được trả về trước khi lệnh ghi kết thúc
    await p;
  });

  it("lệnh ghi bắn TRỄ 1 macrotask (onBlur hoãn setTimeout 0) vẫn được chờ", async () => {
    const qc = new QueryClient();
    let xong = false;
    // Mô phỏng DecimalInput: onBlur chạy ở macrotask kế tiếp, sau khi handler In gọi.
    setTimeout(() => { void batLenhGhi(qc, 100).then(() => { xong = true; }); }, 0);

    const ok = await waitForChiPhiWrites(qc, 2000, 5);
    expect(ok).toBe(true);
    expect(xong).toBe(true);
  });

  it("quá thời gian chờ mà lệnh vẫn chưa xong → trả false để caller cảnh báo", async () => {
    const qc = new QueryClient();
    const p = batLenhGhi(qc, 300);
    await expect(waitForChiPhiWrites(qc, 60, 5)).resolves.toBe(false);
    await p;
  });

  it("bỏ qua mutation KHÔNG phải ghi chi phí", async () => {
    const qc = new QueryClient();
    const p = qc.getMutationCache().build(qc, {
      mutationKey: ["viec_khac"],
      mutationFn: async () => { await sleep(200); return 1; },
    }).execute(undefined);

    await expect(waitForChiPhiWrites(qc, 500, 5)).resolves.toBe(true);
    await p;
  });
});
