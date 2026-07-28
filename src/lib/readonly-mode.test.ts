import { describe, it, expect, beforeEach } from "vitest";
import {
  isWriteRequest,
  isReadOnlyMode,
  setReadOnlyMode,
  READONLY_SAFE_RPCS,
} from "@/lib/readonly-mode";

const BASE = "https://lflsbwoqzmbknzdpaequ.supabase.co";

describe("isWriteRequest", () => {
  it("cho qua mọi lời gọi đọc", () => {
    expect(isWriteRequest("GET", `${BASE}/rest/v1/doan?select=*`)).toBe(false);
    expect(isWriteRequest("HEAD", `${BASE}/rest/v1/doan?select=id`)).toBe(false);
    expect(isWriteRequest("OPTIONS", `${BASE}/rest/v1/doan`)).toBe(false);
    // method thiếu → supabase-js mặc định GET
    expect(isWriteRequest(undefined, `${BASE}/rest/v1/doan`)).toBe(false);
    expect(isWriteRequest("get", `${BASE}/rest/v1/doan`)).toBe(false);
  });

  it("chặn insert / update / delete trên bảng", () => {
    expect(isWriteRequest("POST", `${BASE}/rest/v1/doan_chi_phi`)).toBe(true);
    expect(isWriteRequest("PATCH", `${BASE}/rest/v1/doan?id=eq.1`)).toBe(true);
    expect(isWriteRequest("PUT", `${BASE}/rest/v1/doan`)).toBe(true);
    expect(isWriteRequest("DELETE", `${BASE}/rest/v1/doan_chi_phi?id=eq.9`)).toBe(true);
  });

  it("chặn RPC có ghi, cho qua RPC chỉ đọc", () => {
    expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/recalc_chi_phi_payment_status`)).toBe(true);
    expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/create_dntt_with_allocations`)).toBe(true);
    expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/update_lead_status`)).toBe(true);

    for (const fn of READONLY_SAFE_RPCS) {
      expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/${fn}`)).toBe(false);
    }
  });

  it("RPC chỉ đọc kèm query string vẫn qua được", () => {
    expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/get_lead_funnel?select=*`)).toBe(false);
  });

  it("KHÔNG chặn luồng auth — nếu chặn thì không đăng nhập được", () => {
    expect(isWriteRequest("POST", `${BASE}/auth/v1/token?grant_type=password`)).toBe(false);
    expect(isWriteRequest("POST", `${BASE}/auth/v1/logout`)).toBe(false);
  });

  it("chặn upload storage (RLS bảng public không phủ tới)", () => {
    expect(isWriteRequest("POST", `${BASE}/storage/v1/object/hoa-don/a.pdf`)).toBe(true);
    expect(isWriteRequest("DELETE", `${BASE}/storage/v1/object/hoa-don/a.pdf`)).toBe(true);
    expect(isWriteRequest("GET", `${BASE}/storage/v1/object/public/hoa-don/a.pdf`)).toBe(false);
  });

  it("tên RPC bị url-encode vẫn nhận đúng", () => {
    expect(isWriteRequest("POST", `${BASE}/rest/v1/rpc/get%5Flead%5Fstats`)).toBe(false);
  });
});

describe("setReadOnlyMode", () => {
  beforeEach(() => setReadOnlyMode(false));

  it("mặc định tắt", () => {
    expect(isReadOnlyMode()).toBe(false);
  });

  it("bật/tắt được", () => {
    setReadOnlyMode(true);
    expect(isReadOnlyMode()).toBe(true);
    setReadOnlyMode(false);
    expect(isReadOnlyMode()).toBe(false);
  });
});
