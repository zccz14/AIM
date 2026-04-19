import { ScrollArea, Table, Text, TextInput } from "@mantine/core";
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
    <>
      <TextInput
        label="Filter Tasks"
        onChange={(event) => setFilterValue(event.currentTarget.value)}
        value={filterValue}
      />

      <ScrollArea>
        <Table highlightOnHover>
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.Th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>

          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr
                key={row.id}
                onClick={() => onSelectTask(row.original.id)}
                style={{ cursor: "pointer" }}
              >
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {table.getRowModel().rows.length === 0 ? (
        <Text>No matching tasks.</Text>
      ) : null}
    </>
  );
};
