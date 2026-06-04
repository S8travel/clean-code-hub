import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiSelect } from "@/components/MultiSelect";

const OPTIONS = [
  { value: "1", label: "Agent A" },
  { value: "2", label: "Agent B" },
  { value: "3", label: "Agent C" },
];

describe("MultiSelect", () => {
  it("hiện allLabel khi chưa chọn gì", () => {
    render(<MultiSelect options={OPTIONS} value={[]} onChange={vi.fn()} allLabel="Tất cả Agent" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Tất cả Agent");
  });

  it("hiện tên mục khi chọn đúng 1", () => {
    render(<MultiSelect options={OPTIONS} value={["2"]} onChange={vi.fn()} allLabel="Tất cả Agent" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Agent B");
  });

  it("hiện 'allLabel · N' khi chọn ≥2", () => {
    render(<MultiSelect options={OPTIONS} value={["1", "3"]} onChange={vi.fn()} allLabel="Tất cả Agent" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Tất cả Agent · 2");
  });

  it("tích 1 mục → onChange THÊM value vào mảng", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} value={["1"]} onChange={onChange} allLabel="Tất cả Agent" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Agent C"));
    expect(onChange).toHaveBeenCalledWith(["1", "3"]);
  });

  it("bỏ tích mục đang chọn → onChange XÓA khỏi mảng", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} value={["1", "2"]} onChange={onChange} allLabel="Tất cả Agent" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Agent A"));
    expect(onChange).toHaveBeenCalledWith(["2"]);
  });

  it("'Bỏ chọn tất cả' → onChange mảng rỗng", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} value={["1", "2"]} onChange={onChange} allLabel="Tất cả Agent" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText(/Bỏ chọn tất cả/));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("lọc theo ô tìm kiếm", () => {
    render(<MultiSelect options={OPTIONS} value={[]} onChange={vi.fn()} allLabel="Tất cả Agent" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Gõ để tìm..."), { target: { value: "B" } });
    expect(screen.getByText("Agent B")).toBeInTheDocument();
    expect(screen.queryByText("Agent A")).not.toBeInTheDocument();
  });
});
