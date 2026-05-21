import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermission } from "@/hooks/use-permissions";

vi.mock("@/hooks/use-permissions", () => ({
  usePermission: vi.fn(),
}));

const mockUsePermission = usePermission as ReturnType<typeof vi.fn>;

describe("PermissionGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when permission is allowed", () => {
    mockUsePermission.mockReturnValue(true);
    render(
      <PermissionGate resource="doan" action="view">
        <span>Protected content</span>
      </PermissionGate>
    );
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("renders nothing when permission is denied and no fallback provided", () => {
    mockUsePermission.mockReturnValue(false);
    const { container } = render(
      <PermissionGate resource="doan" action="edit">
        <span>Hidden content</span>
      </PermissionGate>
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("renders the fallback when permission is denied and fallback is provided", () => {
    mockUsePermission.mockReturnValue(false);
    render(
      <PermissionGate resource="doan" action="delete" fallback={<span>Access denied</span>}>
        <span>Hidden content</span>
      </PermissionGate>
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("calls usePermission with the correct resource and action", () => {
    mockUsePermission.mockReturnValue(true);
    render(
      <PermissionGate resource="nguoi_dung" action="create">
        <span>child</span>
      </PermissionGate>
    );
    expect(mockUsePermission).toHaveBeenCalledWith("nguoi_dung", "create");
  });
});
