import {
  createManagerReportRequestSchema,
  managerReportByIdPath,
  managerReportsPath,
  taskErrorSchema,
} from "@aim-ai/contract";
import type { Hono } from "hono";

import { createManagerReportRepository } from "../manager-report-repository.js";

const managerReportByIdRoutePath = managerReportByIdPath.replace(
  "{reportId}",
  ":reportId",
);

const buildNotFoundError = (projectPath: string, reportId: string) =>
  taskErrorSchema.parse({
    code: "MANAGER_REPORT_NOT_FOUND",
    message: `Manager report ${reportId} for ${projectPath} was not found`,
  });

const buildConflictError = (projectPath: string, reportId: string) =>
  taskErrorSchema.parse({
    code: "MANAGER_REPORT_CONFLICT",
    message: `Manager report ${reportId} for ${projectPath} already exists`,
  });

const buildValidationError = (message: string) =>
  taskErrorSchema.parse({
    code: "MANAGER_REPORT_VALIDATION_ERROR",
    message,
  });

const parseProjectPath = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("project_path");

  if (!projectPath) {
    return buildValidationError("project_path query parameter is required");
  }

  return projectPath;
};

const parseCreateManagerReportRequest = async (request: Request) => {
  const payload = await request.json().catch(() => undefined);
  const result = createManagerReportRequestSchema.safeParse(payload);

  if (!result.success) {
    return {
      error: buildValidationError("Invalid manager report payload"),
      ok: false as const,
    };
  }

  return { data: result.data, ok: true as const };
};

type RegisterManagerReportRoutesOptions = {
  projectRoot?: string;
  resourceScope?: {
    use<T extends Partial<AsyncDisposable & Disposable>>(resource: T): T;
  };
};

export const registerManagerReportRoutes = (
  app: Hono,
  options: RegisterManagerReportRoutesOptions = {},
) => {
  const projectRoot = options.projectRoot ?? process.env.AIM_PROJECT_ROOT;
  let repository: null | ReturnType<typeof createManagerReportRepository> =
    null;
  const getRepository = () => {
    repository ??=
      options.resourceScope?.use(
        createManagerReportRepository({ projectRoot }),
      ) ?? createManagerReportRepository({ projectRoot });

    return repository;
  };

  app.post(managerReportsPath, async (context) => {
    const parsedRequest = await parseCreateManagerReportRequest(
      context.req.raw,
    );

    if (!parsedRequest.ok) {
      return context.json(parsedRequest.error, 400);
    }

    const managerReport = await getRepository().createManagerReport(
      parsedRequest.data,
    );

    if (!managerReport) {
      return context.json(
        buildConflictError(
          parsedRequest.data.project_path,
          parsedRequest.data.report_id,
        ),
        409,
      );
    }

    return context.json(managerReport, 201);
  });

  app.get(managerReportsPath, async (context) => {
    const projectPath = parseProjectPath(context.req.raw);

    if (typeof projectPath !== "string") {
      return context.json(projectPath, 400);
    }

    const managerReports =
      await getRepository().listManagerReports(projectPath);

    return context.json({ items: managerReports }, 200);
  });

  app.get(managerReportByIdRoutePath, async (context) => {
    const reportId = context.req.param("reportId") ?? "report-unknown";
    const projectPath = parseProjectPath(context.req.raw);

    if (typeof projectPath !== "string") {
      return context.json(projectPath, 400);
    }

    const managerReport = await getRepository().getManagerReport(
      projectPath,
      reportId,
    );

    if (!managerReport) {
      return context.json(buildNotFoundError(projectPath, reportId), 404);
    }

    return context.json(managerReport, 200);
  });
};
