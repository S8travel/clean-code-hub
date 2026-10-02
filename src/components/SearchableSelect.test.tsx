import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchableSelect } from "@/components/SearchableSelect";

const OPTIONS = [
  { value: "ha-noi", label: "Hà Nội" },
  { value: "ho-chi-minh", label: "Hồ Chí Minh" },
  { value: "da-nang", label: "Đà Nẵng" },
];

describe("SearchableSelect", () => {
  it("shows placeholder when no value is selected", () => {
    render(
      <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} placeholder="Chọn địa điểm" />
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Chọn địa điểm");
  });

  it("shows the selected option label when a value is set", () => {
    render(
      <SearchableSelect options={OPTIONS} value="da-nang" onChange={vi.fn()} />
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Đà Nẵng");
  });

  it("uses the default placeholder when none is provided", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Chọn...");
  });

  it("opens the popover and shows options on trigger click", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Hà Nội")).toBeInTheDocument();
    expect(screen.getByText("Hồ Chí Minh")).toBeInTheDocument();
    expect(screen.getByText("Đà Nẵng")).toBeInTheDocument();
  });

  it("filters options based on search input", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Gõ để tìm...");
    fireEvent.change(input, { target: { value: "nẵng" } });
    expect(screen.queryByText("Hà Nội")).not.toBeInTheDocument();
    expect(screen.getByText("Đà Nẵng")).toBeInTheDocument();
  });

  it("shows emptyText when no options match the search", () => {
    render(
      <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} emptyText="No results" />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Gõ để tìm...");
    fireEvent.change(input, { target: { value: "xxxxxxx" } });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("calls onChange with the option value when an option is clicked", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Hồ Chí Minh"));
    expect(onChange).toHaveBeenCalledWith("ho-chi-minh");
  });

  it("tìm không phân biệt dấu và không cần đúng thứ tự từ", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Gõ để tìm...");
    fireEvent.change(input, { target: { value: "da nang" } });
    expect(screen.getByText("Đà Nẵng")).toBeInTheDocument();
    expect(screen.queryByText("Hà Nội")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "minh HO" } });
    expect(screen.getByText("Hồ Chí Minh")).toBeInTheDocument();
    expect(screen.queryByText("Đà Nẵng")).not.toBeInTheDocument();
  });

  describe("taoTuChu — dùng chữ đang gõ làm mục tự do", () => {
    const taoTuChu = (onTao = vi.fn()) => ({ nhan: "Dùng làm dòng ghi chú", ghiChu: "Không tính chi phí", onTao });

    it("không có prop → không bao giờ hiện dòng tạo", () => {
      render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("combobox"));
      fireEvent.change(screen.getByPlaceholderText("Gõ để tìm..."), { target: { value: "Bay VN1823" } });
      expect(screen.queryByText(/Dùng làm dòng ghi chú/)).not.toBeInTheDocument();
    });

    it("chưa gõ gì → chưa hiện dòng tạo", () => {
      render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} taoTuChu={taoTuChu()} />);
      fireEvent.click(screen.getByRole("combobox"));
      expect(screen.queryByText(/Dùng làm dòng ghi chú/)).not.toBeInTheDocument();
    });

    it("không khớp mục nào → báo không tìm thấy + dòng tạo; bấm vào → nhận chữ đã cắt khoảng trắng", () => {
      const onTao = vi.fn();
      const onChange = vi.fn();
      render(
        <SearchableSelect options={OPTIONS} value="" onChange={onChange} emptyText="Không tìm thấy" taoTuChu={taoTuChu(onTao)} />
      );
      fireEvent.click(screen.getByRole("combobox"));
      fireEvent.change(screen.getByPlaceholderText("Gõ để tìm..."), { target: { value: "  Bay VN1823 07:00 " } });
      expect(screen.getByText("Không tìm thấy")).toBeInTheDocument();
      expect(screen.getByText("Không tính chi phí")).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Dùng làm dòng ghi chú/));
      expect(onTao).toHaveBeenCalledWith("Bay VN1823 07:00");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("không khớp mục nào → Enter tạo luôn", () => {
      const onTao = vi.fn();
      render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} taoTuChu={taoTuChu(onTao)} />);
      fireEvent.click(screen.getByRole("combobox"));
      const input = screen.getByPlaceholderText("Gõ để tìm...");
      fireEvent.change(input, { target: { value: "Gala dinner" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onTao).toHaveBeenCalledWith("Gala dinner");
    });

    it("còn khớp mục → Enter vẫn chọn mục khớp (gõ thiếu dấu không biến cảnh điểm thành ghi chú)", () => {
      const onTao = vi.fn();
      const onChange = vi.fn();
      render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} taoTuChu={taoTuChu(onTao)} />);
      fireEvent.click(screen.getByRole("combobox"));
      const input = screen.getByPlaceholderText("Gõ để tìm...");
      fireEvent.change(input, { target: { value: "da nang" } });
      expect(screen.getByText(/Dùng làm dòng ghi chú/)).toBeInTheDocument(); // vẫn có, nằm cuối
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("da-nang");
      expect(onTao).not.toHaveBeenCalled();
    });
  });

  it("calls onChange with empty string when clicking the already-selected option (deselect)", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="ha-noi" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    // Two "Hà Nội" elements exist: the trigger label and the list item — click the list item
    const matches = screen.getAllByText("Hà Nội");
    fireEvent.click(matches[matches.length - 1]);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
