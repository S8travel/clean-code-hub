import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { isBefore, isToday, startOfDay } from "date-fns";
import { Users, Plus, Search, List, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLeadsList, LEAD_TRANG_THAI_OPTS, LEAD_NGUON_OPTS, type Lead, type LeadTrangThai } from "@/hooks/use-leads";
import { useUserRoles } from "@/hooks/use-doan";
import { useAuth } from "@/hooks/use-auth";
import { LeadTable } from "@/components/leads/LeadTable";
import { LeadKanban } from "@/components/leads/LeadKanban";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadFormDrawer } from "@/components/leads/LeadFormDrawer";
import { LeadStatsWidget, type LeadStatsPreset } from "@/components/leads/LeadStatsWidget";
import { t, useTranslate } from "@/lib/i18n";

type ViewMode = "list" | "kanban";
type FollowUpFilter = "all" | "today" | "overdue";

export default function LeadsPage() {
  useTranslate();
  const { user } = useAuth();
  const { data: userRoles = [] } = useUserRoles();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSales, setFilterSales] = useState("");
  const [filterNguon, setFilterNguon] = useState("");
  const [filterLoaiTour, setFilterLoaiTour] = useState("");
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>("all");

  // Read URL params one time on mount (entry from dashboard widget)
  useEffect(() => {
    const status     = searchParams.get("status");
    const assignedTo = searchParams.get("assigned_to");
    const followUp   = searchParams.get("follow_up");

    if (status) setFilterStatus(status);
    if (assignedTo === "me" && user?.user_id) setFilterSales(user.user_id);
    else if (assignedTo) setFilterSales(assignedTo);
    if (followUp === "today" || followUp === "overdue") setFollowUpFilter(followUp);

    // Clear URL params after consumed
    if (status || assignedTo || followUp) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const { data: rawLeads = [], isLoading } = useLeadsList({
    trang_thai: (filterStatus as LeadTrangThai) || null,
    assigned_to: filterSales || null,
    nguon: filterNguon || null,
    loai_tour: filterLoaiTour || null,
    search: search.trim() || null,
  });

  // Apply client-side follow-up filter
  const leads = useMemo(() => {
    if (followUpFilter === "all") return rawLeads;
    const today = startOfDay(new Date());
    return rawLeads.filter((l) => {
      if (!l.ngay_follow_up_tiep) return false;
      if (l.trang_thai === "chot_deal" || l.trang_thai === "mat_khach") return false;
      const d = new Date(l.ngay_follow_up_tiep);
      if (followUpFilter === "today") return isToday(d);
      return isBefore(startOfDay(d), today);
    });
  }, [rawLeads, followUpFilter]);

  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Detail drawer
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Form drawer (create / edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const openDetail = (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setDetailOpen(true);
  };

  const openCreate = () => {
    setEditLead(null);
    setFormOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setFormOpen(true);
    setDetailOpen(false);
  };

  const userOptions = useMemo(() =>
    userRoles.map((u) => ({ value: u.user_id, label: u.ho_ten })),
    [userRoles]
  );

  // Widget click → áp filter local thay vì navigate
  const applyStatsPreset = (preset: LeadStatsPreset) => {
    if (!user?.user_id) return;
    setFilterSales(user.user_id);
    if (preset === "moi") {
      setFilterStatus("moi");
      setFollowUpFilter("all");
    } else if (preset === "today") {
      setFilterStatus("");
      setFollowUpFilter("today");
    } else {
      setFilterStatus("");
      setFollowUpFilter("overdue");
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">{t("Quản lý Lead")}</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground ml-1">({leads.length})</span>
          )}
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> {t("Thêm Lead")}
        </Button>
      </div>

      {/* Stats widget — chỉ cho user bộ phận sales */}
      {user?.bo_phan === "sales" && (
        <div className="shrink-0 px-6 pt-4 pb-1 bg-background">
          <LeadStatsWidget userId={user.user_id} onSelect={applyStatsPreset} />
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 px-6 py-3 border-b bg-muted/20 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Tìm tên, SĐT, tổ chức...")}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Filter: Trạng thái */}
        <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder={t("Trạng thái")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-xs">{t("Tất cả trạng thái")}</SelectItem>
            {LEAD_TRANG_THAI_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{t(o.label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filter: Nguồn */}
        <Select value={filterNguon || "_all"} onValueChange={(v) => setFilterNguon(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[120px]">
            <SelectValue placeholder={t("Nguồn")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-xs">{t("Tất cả nguồn")}</SelectItem>
            {LEAD_NGUON_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{t(o.label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filter: Loại tour */}
        <Select value={filterLoaiTour || "_all"} onValueChange={(v) => setFilterLoaiTour(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[120px]">
            <SelectValue placeholder={t("Loại tour")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-xs">{t("Tất cả")}</SelectItem>
            <SelectItem value="outbound" className="text-xs">{t("Outbound")}</SelectItem>
            <SelectItem value="noi_dia" className="text-xs">{t("Nội địa")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter: Sales */}
        <Select value={filterSales || "_all"} onValueChange={(v) => setFilterSales(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder={t("Sales phụ trách")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-xs">{t("Tất cả sales")}</SelectItem>
            {userOptions.map((u) => (
              <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Active follow-up chip */}
        {followUpFilter !== "all" && (
          <button onClick={() => setFollowUpFilter("all")}
            className={`flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium border ${
              followUpFilter === "overdue"
                ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            }`}>
            {followUpFilter === "overdue" ? t("⚠️ Quá hạn follow-up") : t("⏰ Follow-up hôm nay")}
            <span className="ml-1 opacity-60">×</span>
          </button>
        )}

        {/* View toggle */}
        <div className="flex rounded-lg border overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            title={t("Danh sách")}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={`p-1.5 transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            title={t("Kanban")}
          >
            <Columns3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            {t("Đang tải...")}
          </div>
        ) : viewMode === "list" ? (
          <LeadTable leads={leads} onRowClick={openDetail} />
        ) : (
          <div className="p-4">
            <LeadKanban leads={leads} onLeadClick={openDetail} />
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <LeadDrawer
        leadId={selectedLeadId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={openEdit}
      />

      {/* Form Drawer (create / edit) */}
      <LeadFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        lead={editLead}
      />
    </div>
  );
}
