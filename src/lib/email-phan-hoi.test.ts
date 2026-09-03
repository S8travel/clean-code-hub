import { describe, it, expect } from "vitest";
import { chonEmailPhanHoi } from "./email-phan-hoi";

describe("chonEmailPhanHoi", () => {
  it("ưu tiên email hồ sơ khi lệch mail đăng nhập (ca mail đăng nhập không tồn tại)", () => {
    expect(chonEmailPhanHoi("hop-thu-doi@example.com", "ten-dang-nhap-bia@example.com")).toBe(
      "hop-thu-doi@example.com",
    );
  });

  it("hai mail giống nhau → giữ nguyên (đa số người dùng)", () => {
    expect(chonEmailPhanHoi("op-a@example.com", "op-a@example.com")).toBe("op-a@example.com");
  });

  it("nhiều OP dùng chung một hộp thư đội là hợp lệ, không phải trùng lặp cần tách", () => {
    expect(chonEmailPhanHoi("hop-thu-doi@example.com", "mail-rieng@example.com")).toBe(
      "hop-thu-doi@example.com",
    );
  });

  it("hồ sơ chưa nhập email → rơi về mail đăng nhập", () => {
    expect(chonEmailPhanHoi(null, "op-b@example.com")).toBe("op-b@example.com");
    expect(chonEmailPhanHoi("", "op-b@example.com")).toBe("op-b@example.com");
    expect(chonEmailPhanHoi(undefined, "op-b@example.com")).toBe("op-b@example.com");
  });

  it("cắt khoảng trắng thừa hai đầu (email dán từ Excel)", () => {
    expect(chonEmailPhanHoi("  op-a@example.com \n", null)).toBe("op-a@example.com");
  });

  it("hồ sơ ghi rác không phải email → bỏ qua, dùng mail đăng nhập", () => {
    expect(chonEmailPhanHoi("chưa có", "op-b@example.com")).toBe("op-b@example.com");
    expect(chonEmailPhanHoi("-", "op-b@example.com")).toBe("op-b@example.com");
  });

  it("cả hai đều trống → để trống cho edge function rơi về mail công ty", () => {
    expect(chonEmailPhanHoi(null, null)).toBeUndefined();
    expect(chonEmailPhanHoi("  ", "rác")).toBeUndefined();
  });
});
