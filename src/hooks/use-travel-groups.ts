// Placeholder — travel_groups table not yet created
export interface TravelGroup {
  id: string;
  ten_nhom: string;
  loai_nhom: string;
  ghi_chu: string;
  ngay_di: string;
  ngay_ve: string;
  so_khach: number;
  created_at: string;
  [key: string]: any;
}
export type TravelGroupInsert = Partial<TravelGroup>;
export type TravelGroupUpdate = Partial<TravelGroup>;

export function useTravelGroups() {
  return { data: [] as TravelGroup[], isLoading: false };
}
export function useCreateGroup() {
  return { mutateAsync: async (_g: TravelGroupInsert) => ({} as TravelGroup) };
}
export function useUpdateGroup() {
  return { mutateAsync: async (_g: TravelGroupUpdate & { id: string }) => ({} as TravelGroup) };
}
export function useDeleteGroup() {
  return { mutateAsync: async (_id: string) => {} };
}
