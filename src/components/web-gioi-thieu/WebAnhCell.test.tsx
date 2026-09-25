import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WebAnhCell from "./WebAnhCell";

const URL_ANH = "https://example.test/storage/v1/object/public/web-images/showcase/khach_san/1/anh-1.jpg";

function dung(props: Partial<ComponentProps<typeof WebAnhCell>> = {}) {
  const onChon = vi.fn();
  const onGo = vi.fn();
  const r = render(
    <WebAnhCell url={null} kind="anh" canEdit dangTai={false} onChon={onChon} onGo={onGo} {...props} />,
  );
  return { ...r, onChon, onGo };
}

describe("WebAnhCell", () => {
  it("chưa có ảnh: hiện chữ trống, chỉ có nút Tải, không có nút gỡ", () => {
    dung();
    expect(screen.getByText("Chưa có ảnh")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tải/ })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(document.querySelector("img")).toBeNull();
  });

  // alt="" là ảnh trang trí → không có role "img" → tìm thẳng thẻ <img>.
  it("có ảnh: hiện thumbnail, nút Thay và nút gỡ gọi onGo", () => {
    const { container, onGo } = dung({ url: URL_ANH });
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toBe(URL_ANH);
    expect(screen.getByRole("button", { name: /Thay/ })).toBeTruthy();
    fireEvent.click(screen.getByTitle("Gỡ ảnh"));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it("chọn file → onChon nhận đúng file", () => {
    const { container, onChon } = dung();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "anh.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChon).toHaveBeenCalledTimes(1);
    expect(onChon.mock.calls[0][0]).toBe(file);
  });

  it("chỉ xem hoặc đang tải → mọi nút khoá", () => {
    dung({ url: URL_ANH, canEdit: false });
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("đang tải → nút khoá dù có quyền", () => {
    dung({ url: URL_ANH, dangTai: true });
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("ảnh ngoài không tải được → thay bằng chữ, không để ô vỡ", () => {
    const { container } = dung({ url: "https://khach-san.example/anh.jpg" });
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Không tải được ảnh")).toBeTruthy();
  });

  it("logo nhận cả SVG, ảnh chụp thì không", () => {
    const a = dung({ kind: "logo" });
    const inputLogo = a.container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(inputLogo.accept).toContain("image/svg+xml");
    a.unmount();
    const b = dung({ kind: "anh" });
    const inputAnh = b.container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(inputAnh.accept).not.toContain("svg");
  });
});
