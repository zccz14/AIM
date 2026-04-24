import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

const columns: ColumnDef<DashboardTask>[] = [
  {
    accessorKey: "title",
    header: "Task",
  },
  {
    accessorKey: "dashboardStatus",
    header: "Status",
    cell: ({ row }) => (
      <TaskStatusBadge status={row.original.dashboardStatus} />
    ),
  },
  {
    accessorFn: (task) => task.dependencies.length,
    id: "dependencies",
    header: "Dependencies",
  },
];

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
  const [filterValue, setFilterValue] = useState("");

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
    <section className="surface-table section-stack">
      <label className="field-stack">
        <span className="field-label">Filter Tasks</span>
        <input
          className="field-input"
          onChange={(event) => setFilterValue(event.currentTarget.value)}
          value={filterValue}
        />
      </label>

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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.getRowModel().rows.length === 0 ? (
        <p className="muted-text">No matching tasks.</p>
      ) : null}
    </section>
  );
};
