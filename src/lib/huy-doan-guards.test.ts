import { describe, it, expect } from "vitest";
import { coCanTruCheoDntt, demDnttChanHuyDoan } from "./huy-doan-guards";

describe("coCanTruCheoDntt — chặn xóa payment cấn trừ của đoàn khác (fix ①)", () => {
  it("không có payment tham chiếu → không chặn", () => {
    expect(coCanTruCheoDntt([], 10)).toBe(false);
  });

  it("payment đều thuộc chính ĐNTT đang hủy → không chặn (hiếm, nhưng an toàn xóa)", () => {
    expect(coCanTruCheoDntt([{ dntt_id: 10 }, { dntt_id: 10 }], 10)).toBe(false);
  });

  it("có payment thuộc ĐNTT KHÁC (đoàn khác đã cấn trừ) → CHẶN", () => {
    // Công nợ từ ĐNTT 10 bị ĐNTT 20 (đoàn khác) cấn trừ → không được auto-xóa.
    expect(coCanTruCheoDntt([{ dntt_id: 20 }], 10)).toBe(true);
  });

  it("trộn cả của mình lẫn của đoàn khác → vẫn CHẶN", () => {
    expect(coCanTruCheoDntt([{ dntt_id: 10 }, { dntt_id: 21 }], 10)).toBe(true);
  });

  it("dntt_id null (dữ liệu rác) khác id đang hủy → chặn cho an toàn", () => {
    expect(coCanTruCheoDntt([{ dntt_id: null }], 10)).toBe(true);
  });
});

describe("demDnttChanHuyDoan — ĐNTT đã thành công nợ không chặn hủy đoàn (fix ②)", () => {
  it("không ĐNTT nào → 0", () => {
    expect(demDnttChanHuyDoan([], new Set())).toBe(0);
  });

  it("ĐNTT còn sống, chưa có công nợ → vẫn chặn (đếm hết)", () => {
    expect(demDnttChanHuyDoan([1, 2, 3], new Set())).toBe(3);
  });

  it("mọi ĐNTT đã chuyển thành công nợ → 0 (không chặn)", () => {
    expect(demDnttChanHuyDoan([10, 11, 12], new Set([10, 11, 12]))).toBe(0);
  });

  it("chỉ một phần có công nợ → chỉ đếm phần chưa xử lý", () => {
    expect(demDnttChanHuyDoan([10, 11, 12], new Set([10, 11]))).toBe(1);
  });
});
