import type { TaskPullRequestStatusResponse } from "@aim-ai/contract";
import { useQuery } from "@tanstack/react-query";
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
import { cn } from "../../../lib/utils.js";
import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import {
  getTaskPullRequestStatusErrorMessage,
  taskPullRequestStatusQueryOptions,
} from "../queries.js";
import {
  Chip,
  cardHeader,
  eyebrow,
  mutedText,
  pageStack,
  sectionTitle,
  tableMeta,
} from "./dashboard-styles.js";
import { TaskStatusBadge } from "./task-status-badge.js";

const getPullRequestStatusClassName = (
  category: TaskPullRequestStatusResponse["category"],
) => {
  if (category === "ready_to_merge") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  }

  if (
    category === "failed_checks" ||
    category === "review_blocked" ||
    category === "merge_conflict"
  ) {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }

  if (category === "no_pull_request" || category === "closed_abandoned") {
    return "border-muted bg-muted text-muted-foreground";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
};

const TaskPullRequestStatusSummary = ({ taskId }: { taskId: string }) => {
  const { t } = useI18n();
  const pullRequestStatusQuery = useQuery(
    taskPullRequestStatusQueryOptions(taskId),
  );

  if (pullRequestStatusQuery.isPending) {
    return (
      <p aria-live="polite" className={tableMeta}>
        {t("pullRequestStatusLoading")}
      </p>
    );
  }

  if (pullRequestStatusQuery.isError) {
    return (
      <p aria-live="polite" className={tableMeta}>
        {getTaskPullRequestStatusErrorMessage(pullRequestStatusQuery.error)}
      </p>
    );
  }

  const status = pullRequestStatusQuery.data;

  if (!status) {
    return (
      <p aria-live="polite" className={tableMeta}>
        {t("pullRequestStatusNoPullRequest")}
      </p>
    );
  }

  return (
    <div aria-live="polite" className="flex min-w-[14rem] flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Chip
          className={cn(
            "border font-mono text-[0.68rem]",
            getPullRequestStatusClassName(status.category),
          )}
        >
          {status.category}
        </Chip>
        {status.category === "no_pull_request" ? (
          <span className={mutedText}>
            {t("pullRequestStatusNoPullRequest")}
          </span>
        ) : null}
      </div>
      <p className={tableMeta}>{status.summary}</p>
      <p className={tableMeta}>{status.recovery_action}</p>
    </div>
  );
};

const sourceBaselineClassName = (
  status: DashboardTask["sourceBaselineFreshness"]["status"],
) =>
  status === "current"
    ? "text-primary"
    : status === "stale"
      ? "text-destructive"
      : "text-muted-foreground";

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
        accessorFn: (task) => task.sourceBaselineFreshness.status,
        id: "sourceBaseline",
        header: t("tableSourceBaseline"),
        cell: ({ row }) => (
          <span
            className={sourceBaselineClassName(
              row.original.sourceBaselineFreshness.status,
            )}
          >
            {row.original.sourceBaselineFreshness.status}
          </span>
        ),
      },
      {
        accessorFn: (task) => task.dependencies.length,
        id: "dependencies",
        header: t("tableDependencies"),
      },
      {
        id: "pullRequestStatus",
        header: t("tablePullRequestStatus"),
        cell: ({ row }) => (
          <TaskPullRequestStatusSummary taskId={row.original.id} />
        ),
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
    <Card>
      <CardHeader className={cardHeader}>
        <p className={eyebrow}>{t("taskPool")}</p>
        <CardTitle className={sectionTitle}>
          {t("activeUnfinishedTasks")}
        </CardTitle>
      </CardHeader>
      <CardContent className={pageStack}>
        <Field>
          <FieldLabel htmlFor="task-filter">{t("filterTasks")}</FieldLabel>
          <Input
            id="task-filter"
            onChange={(event) => setFilterValue(event.currentTarget.value)}
            value={filterValue}
          />
        </Field>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead data-testid="dashboard-table-header">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      className="border-t bg-muted p-4 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground first:border-t-0"
                      key={header.id}
                    >
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
                  className="cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <td className="border-t p-4" key={cell.id}>
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
