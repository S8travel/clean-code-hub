// Placeholder — travel_groups table not yet created
export type TravelGroup = Record<string, unknown>;
export type TravelGroupInsert = Record<string, unknown>;
export type TravelGroupUpdate = Record<string, unknown>;

export function useTravelGroups() {
  return { data: [] as TravelGroup[], isLoading: false };
}
export function useCreateGroup() {
  return { mutateAsync: async (_g: TravelGroupInsert) => ({}) };
}
export function useUpdateGroup() {
  return { mutateAsync: async (_g: TravelGroupUpdate & { id: string }) => ({}) };
}
export function useDeleteGroup() {
  return { mutateAsync: async (_id: string) => {} };
}
