import { useState, useMemo } from "react";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useNguoiDungList } from "@/hooks/use-nguoi-dung";
import { useActivityLogList, type ActivityLogFilters, type ActivityAction } from "@/hooks/use-activity-log";
import { t, useTranslate } from "@/lib/i18n";
import { ACTION_LABEL } from "./constants";

export function NhatKyTab() {
  useTranslate();
  const { data: userList = [] } = useNguoiDungList();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");

  const filters = useMemo<ActivityLogFilters>(() => ({
    fromDate: fromDate || null,
    toDate: toDate || null,
    userId: userId || null,
    action: (action as ActivityAction) || null,
  }), [fromDate, toDate, userId, action]);

  const { data: logs = [], isLoading } = useActivityLogList(filters);

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">{t("Nhật ký hoạt động")}</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Từ ngày")}</label>
          <DatePicker className="h-8 text-sm w-36" value={fromDate} onChange={setFromDate} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Đến ngày")}</label>
          <DatePicker className="h-8 text-sm w-36" value={toDate} onChange={setToDate} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Người dùng")}</label>
          <Select value={userId || "all"} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <span>{!userId ? t("Tất cả") : userList.find((u) => u.user_id === userId)?.ho_ten ?? userList.find((u) => u.user_id === userId)?.email ?? t("Tất cả")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              {userList.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.ho_ten ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Hành động")}</label>
          <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <span>{!action ? t("Tất cả") : t(ACTION_LABEL[action] ?? action)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              <SelectItem value="tao">{t("Tạo")}</SelectItem>
              <SelectItem value="sua">{t("Sửa")}</SelectItem>
              <SelectItem value="xoa">{t("Xóa")}</SelectItem>
              <SelectItem value="duyet">{t("Duyệt")}</SelectItem>
              <SelectItem value="tu_choi">{t("Từ chối")}</SelectItem>
              <SelectItem value="thanh_toan">{t("Thanh toán")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setFromDate(""); setToDate(""); setUserId(""); setAction(""); }}
        >
          {t("Đặt lại")}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-36">{t("Thời gian")}</TableHead>
              <TableHead className="w-36">{t("Người dùng")}</TableHead>
              <TableHead className="w-24">{t("Hành động")}</TableHead>
              <TableHead>{t("Mô tả")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  {t("Đang tải...")}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  {t("Không có dữ liệu")}
                </TableCell>
              </TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id} className="text-sm">
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                </TableCell>
                <TableCell className="text-sm">{log.ho_ten ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {t(ACTION_LABEL[log.action] ?? log.action)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{log.mo_ta ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
