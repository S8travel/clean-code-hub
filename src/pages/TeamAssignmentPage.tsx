import { useState } from "react";
import { X, Plus, Users2 } from "lucide-react";
import { toast } from "sonner";
import {
  useTeamList,
  useTeamAgents,
  useTeamTaskAssignments,
  useAddTeamAgent,
  useDeleteTeamAgent,
  useAddTeamTaskAssignment,
  useDeleteTeamTaskAssignment,
  type TeamAgentRow,
  type TeamTaskAssignmentRow,
} from "@/hooks/use-teams";
import { useAgents } from "@/hooks/use-doan";
import { useNguoiDungList } from "@/hooks/use-nguoi-dung";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TASK_TYPES = [
  { value: "ks",   label: "Khách sạn" },
  { value: "nh",   label: "Nhà hàng" },
  { value: "dv",   label: "Dịch vụ" },
  { value: "xe",   label: "Xe" },
  { value: "visa", label: "Visa" },
];

// ── PersonBadge ───────────────────────────────────────────────────────────────
function PersonBadge({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1">
      {name}
      <button
        onClick={onRemove}
        className="hover:text-blue-600 transition-colors"
        title="Xóa"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── AgentBadge ────────────────────────────────────────────────────────────────
function AgentBadge({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1">
      {name}
      <button
        onClick={onRemove}
        className="hover:text-green-600 transition-colors"
        title="Xóa"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── TeamTab ───────────────────────────────────────────────────────────────────
function TeamTab({ teamId }: { teamId: number }) {
  const { data: teamAgentRows = [], isLoading: loadingAgents } = useTeamAgents(teamId);
  const { data: assignments = [], isLoading: loadingAssignments } = useTeamTaskAssignments(teamId);
  const { data: allAgents = [] } = useAgents();
  const { data: allUsers = [] } = useNguoiDungList();

  const addAgent = useAddTeamAgent();
  const deleteAgent = useDeleteTeamAgent();
  const addAssignment = useAddTeamTaskAssignment();
  const deleteAssignment = useDeleteTeamTaskAssignment();

  const [addingAgent, setAddingAgent] = useState(false);
  const [addingTaskType, setAddingTaskType] = useState<string | null>(null);

  const assignedAgentIds = new Set(teamAgentRows.map((r) => r.agent_id));
  const availableAgents = allAgents.filter((a: any) => !assignedAgentIds.has(a.id));

  function agentName(agentId: number) {
    return allAgents.find((a: any) => a.id === agentId)?.ten ?? `Agent #${agentId}`;
  }

  function userName(userId: string) {
    const u = allUsers.find((u) => u.user_id === userId);
    return u?.ho_ten ?? u?.email ?? userId;
  }

  function getTaskAssignments(taskType: string): TeamTaskAssignmentRow[] {
    return assignments.filter((a) => a.task_type === taskType);
  }

  function isUserInTask(taskType: string, userId: string): boolean {
    return assignments.some((a) => a.task_type === taskType && a.user_id === userId);
  }

  const availableUsersForTask = (taskType: string) =>
    allUsers.filter((u) => u.active && !isUserInTask(taskType, u.user_id));

  async function handleAddAgent(agentId: string) {
    try {
      await addAgent.mutateAsync({ team_id: teamId, agent_id: Number(agentId) });
      setAddingAgent(false);
    } catch {
      toast.error("Không thể thêm agent");
    }
  }

  async function handleRemoveAgent(row: TeamAgentRow) {
    try {
      await deleteAgent.mutateAsync({ id: row.id, team_id: teamId });
    } catch {
      toast.error("Không thể xóa agent");
    }
  }

  async function handleAddUser(taskType: string, userId: string) {
    try {
      await addAssignment.mutateAsync({ team_id: teamId, task_type: taskType, user_id: userId });
      setAddingTaskType(null);
    } catch {
      toast.error("Không thể thêm phân công");
    }
  }

  async function handleRemoveUser(row: TeamTaskAssignmentRow) {
    try {
      await deleteAssignment.mutateAsync({ id: row.id, team_id: teamId });
    } catch {
      toast.error("Không thể xóa phân công");
    }
  }

  if (loadingAgents || loadingAssignments) {
    return (
      <div className="space-y-3 pt-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Agents section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Agents trong team
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {teamAgentRows.length === 0 && (
            <span className="text-xs text-muted-foreground">Chưa có agent nào</span>
          )}
          {teamAgentRows.map((row) => (
            <AgentBadge
              key={row.id}
              name={agentName(row.agent_id)}
              onRemove={() => handleRemoveAgent(row)}
            />
          ))}
          {addingAgent ? (
            <Select
              onValueChange={(v) => handleAddAgent(v)}
              onOpenChange={(open) => { if (!open) setAddingAgent(false); }}
            >
              <SelectTrigger className="h-7 w-44 text-xs" autoFocus>
                <SelectValue placeholder="Chọn agent..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgents.length === 0 ? (
                  <SelectItem value="__none" disabled>Không còn agent</SelectItem>
                ) : (
                  availableAgents.map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.ten}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          ) : (
            <button
              onClick={() => setAddingAgent(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground text-xs px-2.5 py-1 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="h-3 w-3" /> Thêm agent
            </button>
          )}
        </div>
      </div>

      {/* Task assignments section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Phân công công việc
        </h3>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold w-32">Mảng</TableHead>
                <TableHead className="text-xs font-semibold">Người phụ trách</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TASK_TYPES.map((tt) => {
                const taskAssignments = getTaskAssignments(tt.value);
                const isAddingThisTask = addingTaskType === tt.value;
                const usersAvail = availableUsersForTask(tt.value);

                return (
                  <TableRow key={tt.value} className="align-middle">
                    <TableCell className="py-2 px-3 text-xs font-medium text-foreground whitespace-nowrap">
                      {tt.label}
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {taskAssignments.map((a) => (
                          <PersonBadge
                            key={a.id}
                            name={userName(a.user_id)}
                            onRemove={() => handleRemoveUser(a)}
                          />
                        ))}
                        {isAddingThisTask ? (
                          <Select
                            onValueChange={(v) => handleAddUser(tt.value, v)}
                            onOpenChange={(open) => { if (!open) setAddingTaskType(null); }}
                          >
                            <SelectTrigger className="h-7 w-48 text-xs" autoFocus>
                              <SelectValue placeholder="Chọn người..." />
                            </SelectTrigger>
                            <SelectContent>
                              {usersAvail.length === 0 ? (
                                <SelectItem value="__none" disabled>Không còn người dùng</SelectItem>
                              ) : (
                                usersAvail.map((u) => (
                                  <SelectItem key={u.user_id} value={u.user_id}>
                                    {u.ho_ten ?? u.email}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <button
                            onClick={() => setAddingTaskType(tt.value)}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground text-xs px-2.5 py-1 hover:border-primary hover:text-primary transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Thêm
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TeamAssignmentPage() {
  const { data: teams = [], isLoading } = useTeamList();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Users2 className="h-5 w-5 text-primary" />
          Phân công team
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Gắn agent vào team và phân công mảng công việc cho từng thành viên
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có team nào trong hệ thống</p>
      ) : (
        <Tabs defaultValue={String(teams[0].id)}>
          <TabsList>
            {teams.map((t) => (
              <TabsTrigger key={t.id} value={String(t.id)} className="text-sm">
                Team {t.ten_team}
              </TabsTrigger>
            ))}
          </TabsList>
          {teams.map((t) => (
            <TabsContent key={t.id} value={String(t.id)}>
              <TeamTab teamId={t.id} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
