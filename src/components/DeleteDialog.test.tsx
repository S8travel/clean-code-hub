import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode, MouseEventHandler } from "react";
import { DeleteDialog } from "@/components/DeleteDialog";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onClick, className }: {
      children?: ReactNode;
      onClick?: MouseEventHandler<HTMLDivElement>;
      className?: string;
    }) =>
      <div onClick={onClick} className={className}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const defaultProps = {
  open: true,
  name: "Tour Hà Nội",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  isDeleting: false,
};

describe("DeleteDialog — delete variant", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<DeleteDialog {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the default delete title", () => {
    render(<DeleteDialog {...defaultProps} />);
    expect(screen.getByText("Xác nhận xóa?")).toBeInTheDocument();
  });

  it("shows the tour name in the description", () => {
    render(<DeleteDialog {...defaultProps} />);
    expect(screen.getByText(/Tour Hà Nội/)).toBeInTheDocument();
  });

  it("renders the confirm button with default delete label", () => {
    render(<DeleteDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Xóa" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<DeleteDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when close button is clicked", () => {
    const onCancel = vi.fn();
    render(<DeleteDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(<DeleteDialog {...defaultProps} onCancel={onCancel} />);
    // The first motion.div is the backdrop
    const backdrop = container.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables confirm button when isDeleting=true", () => {
    render(<DeleteDialog {...defaultProps} isDeleting />);
    const btn = screen.getByRole("button", { name: "Đang xóa..." });
    expect(btn).toBeDisabled();
  });

  it("uses custom confirmLabel when provided", () => {
    render(<DeleteDialog {...defaultProps} confirmLabel="Remove it" />);
    expect(screen.getByRole("button", { name: "Remove it" })).toBeInTheDocument();
  });

  it("uses custom title and description when provided", () => {
    render(
      <DeleteDialog
        {...defaultProps}
        title="Custom Title"
        description="Custom description text"
      />
    );
    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom description text")).toBeInTheDocument();
  });
});

describe("DeleteDialog — cancel variant", () => {
  const cancelProps = { ...defaultProps, variant: "cancel" as const };

  it("shows the default cancel title", () => {
    render(<DeleteDialog {...cancelProps} />);
    expect(screen.getByText("Hủy đoàn?")).toBeInTheDocument();
  });

  it("renders the confirm button with cancel label", () => {
    render(<DeleteDialog {...cancelProps} />);
    expect(screen.getByRole("button", { name: "Hủy đoàn" })).toBeInTheDocument();
  });

  it("shows loading label for cancel variant when isDeleting=true", () => {
    render(<DeleteDialog {...cancelProps} isDeleting />);
    expect(screen.getByRole("button", { name: "Đang hủy..." })).toBeDisabled();
  });
});
