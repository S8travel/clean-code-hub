import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { DecimalInput } from "./decimal-input";

describe("DecimalInput", () => {
  it("chỉ commit onChange lúc blur, KHÔNG commit khi đang gõ", () => {
    const onChange = vi.fn();
    render(<DecimalInput value={0} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "21275460" } });
    expect(onChange).not.toHaveBeenCalled(); // chưa blur → chưa đẩy lên cha
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(21275460);
  });

  it("nhận cả ',' và '.' làm dấu thập phân", () => {
    const onChange = vi.fn();
    render(<DecimalInput value={0} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1500,5" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1500.5);
  });

  it("không gọi onChange khi giá trị không đổi", () => {
    const onChange = vi.fn();
    render(<DecimalInput value={1000} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  // Regression: ChiPhiXeSection/VisaSection bị mất giá xe/visa vì handleRowSave đọc
  // editRow từ closure (state) trong khi DecimalInput commit onChange + gọi onBlur qua
  // setTimeout → closure chưa có giá vừa nhập. Fix: blur-save phải đọc qua REF.
  // Harness dưới tái hiện đúng pattern đã fix và chứng minh giá được lưu.
  function BlurSaveHarness({ onSave }: { onSave: (v: number) => void }) {
    const ref = useRef(0);
    const [val, setVal] = useState(0);
    const commit = (v: number) => { ref.current = v; setVal(v); };
    return (
      <DecimalInput
        value={val}
        onChange={(v) => commit(v)}
        onBlur={() => onSave(ref.current)} // đọc REF, không phải `val` closure
      />
    );
  }

  it("blur-save đọc qua ref → lưu đúng giá vừa nhập", async () => {
    const onSave = vi.fn();
    render(<BlurSaveHarness onSave={onSave} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "21275460" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(21275460));
  });
});
