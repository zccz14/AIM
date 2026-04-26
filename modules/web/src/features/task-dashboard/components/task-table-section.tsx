import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import { Field, FieldLabel } from "../../../components/ui/field.js";
import { Input } from "../../../components/ui/input.js";
import { useI18n } from "../../../lib/i18n.js";
import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

const filterTask = (task: DashboardTask, filterValue: string) => {
  const normalizedFilter = filterValue.trim().toLowerCase();

  if (!normalizedFilter) {
    return true;
  }

  const searchText = [
    task.title,
    task.taskSpec,
    task.id,
    task.contractStatus,
    task.dashboardStatus,
    ...task.dependencies,
  ]
    .join(" ")
    .toLowerCase();

  return searchText.includes(normalizedFilter);
};

export const TaskTableSection = ({
  onSelectTask,
  tasks,
}: {
  onSelectTask: (taskId: string) => void;
  tasks: DashboardTask[];
}) => {
  const { t } = useI18n();
  const [filterValue, setFilterValue] = useState("");
  const columns = useMemo<ColumnDef<DashboardTask>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("tableTask"),
      },
      {
        accessorKey: "dashboardStatus",
        header: t("tableStatus"),
        cell: ({ row }) => (
          <TaskStatusBadge status={row.original.dashboardStatus} />
        ),
      },
      {
        accessorFn: (task) => task.dependencies.length,
        id: "dependencies",
        header: t("tableDependencies"),
      },
    ],
    [t],
  );

  const table = useReactTable({
    columns,
    data: tasks,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, value) => filterTask(row.original, value),
    onGlobalFilterChange: setFilterValue,
    state: {
      globalFilter: filterValue,
    },
  });

  return (
    <Card className="surface-table section-stack">
      <CardHeader className="surface-panel__header">
        <p className="eyebrow">{t("taskPool")}</p>
        <CardTitle className="section-title">
          {t("activeUnfinishedTasks")}
        </CardTitle>
      </CardHeader>
      <CardContent className="section-stack">
        <Field>
          <FieldLabel htmlFor="task-filter">{t("filterTasks")}</FieldLabel>
          <Input
            id="task-filter"
            onChange={(event) => setFilterValue(event.currentTarget.value)}
            value={filterValue}
          />
        </Field>

        <div className="table-scroll">
          <table className="task-table">
            <thead data-testid="dashboard-table-header">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  className="table-row"
                  key={row.id}
                  onClick={() => onSelectTask(row.original.id)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectTask(row.original.id);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.getRowModel().rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{t("noMatchingTasks")}</EmptyTitle>
              <EmptyDescription>
                Adjust the task filter or refresh the configured server.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </CardContent>
    </Card>
  );
};
