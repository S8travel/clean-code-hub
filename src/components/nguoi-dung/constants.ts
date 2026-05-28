import type { UserRoleRow, VaiTro, BoPhan } from "@/hooks/use-nguoi-dung";
import type { Resource, RolePermission } from "@/hooks/use-permissions";

export const VAI_TRO_OPTS: { value: VaiTro; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "giam_doc", label: "Giám đốc" },
  { value: "truong_phong", label: "Trưởng phòng" },
  { value: "specialist", label: "Specialist (quyền riêng)" },
  { value: "nhan_vien_cao_cap", label: "Nhân viên cao cấp" },
  { value: "nhan_vien", label: "Nhân viên" },
];

export const BO_PHAN_OPTS: { value: BoPhan; label: string }[] = [
  { value: "dieu_hanh", label: "Điều hành" },
  { value: "ke_toan", label: "Kế toán" },
  { value: "sales", label: "Sales" },
  { value: "cong_tac_vien", label: "Cộng tác viên" },
];

export const VAI_TRO_LABEL: Record<VaiTro, string> = {
  admin: "Admin",
  giam_doc: "Giám đốc",
  truong_phong: "Trưởng phòng",
  specialist: "Specialist",
  nhan_vien_cao_cap: "NV Cao cấp",
  nhan_vien: "Nhân viên",
};

export interface ResourceItem { value: Resource; label: string }
export interface ResourceSection { section: string; items: ResourceItem[] }

export const RESOURCE_SECTIONS: ResourceSection[] = [
  {
    section: "Khách hàng",
    items: [
      { value: "lead", label: "Lead" },
      { value: "bao_cao_lead", label: "Báo cáo Lead" },
    ],
  },
  {
    section: "Quản lý đoàn",
    items: [
      { value: "dashboard", label: "Tổng quan" },
      { value: "my_job", label: "Công việc của tôi" },
      { value: "doan", label: "Danh sách đoàn" },
      { value: "theo_doi", label: "Theo dõi" },
      { value: "xep_hdv", label: "Xếp HDV" },
      { value: "lock_phong", label: "Lock Phòng" },
      { value: "invoice", label: "Invoice" },
      { value: "bao_gia", label: "Báo Giá" },
      { value: "chi_phi", label: "Chi phí (tab trong đoàn)" },
    ],
  },
  {
    section: "Danh mục",
    items: [
      { value: "danh_muc", label: "Danh mục (NH/KS/Xe/CĐ/HDV/Visa/NCC)" },
      { value: "seri", label: "Mẫu seri" },
    ],
  },
  {
    section: "Hệ thống",
    items: [
      { value: "dntt", label: "Đề nghị thanh toán" },
      { value: "thanh_toan_dk", label: "Thanh toán định kỳ" },
      { value: "hoa_don_unc", label: "Thanh toán, HĐ & UNC" },
      { value: "cong_no", label: "Công nợ" },
      { value: "nguoi_dung", label: "Người dùng" },
      { value: "agent", label: "Agent" },
      { value: "phan_cong_team", label: "Phân công team" },
    ],
  },
];

// Backward-compat: flat list
export const RESOURCES: ResourceItem[] = RESOURCE_SECTIONS.flatMap((s) => s.items);

export const ACTIONS: { field: keyof Pick<RolePermission, "can_view" | "can_create" | "can_edit" | "can_delete">; label: string }[] = [
  { field: "can_view", label: "Xem" },
  { field: "can_create", label: "Tạo" },
  { field: "can_edit", label: "Sửa" },
  { field: "can_delete", label: "Xóa" },
];

export const ACTION_LABEL: Record<string, string> = {
  tao: "Tạo",
  sua: "Sửa",
  xoa: "Xóa",
  duyet: "Duyệt",
  tu_choi: "Từ chối",
  thanh_toan: "Thanh toán",
};

export const THI_TRUONG_GROUPS = [
  { label: "Inbound", loai_tour: "inbound" },
  { label: "Outbound", loai_tour: "outbound" },
  { label: "Nội địa", loai_tour: "noi_dia" },
];

export const emptyForm = (): Omit<UserRoleRow, "id" | "created_at"> => ({
  user_id: "",
  ho_ten: "",
  email: "",
  role: "nhan_vien",
  bo_phan: null,
  van_phong_id: null,
  phan_loai_tour: null,
  so_dien_thoai: null,
  ghi_chu: null,
  active: true,
  password_hash: null,
});
