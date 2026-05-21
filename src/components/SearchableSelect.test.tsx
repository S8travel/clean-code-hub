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
