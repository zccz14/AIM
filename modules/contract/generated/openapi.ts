// This file is auto-generated from the OpenAPI contract.
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CZ-Stack Contract",
    version: "0.0.0",
  },
  servers: [
    {
      url: "https://dev.api.cz-stack.local",
      description: "Development",
    },
    {
      url: "https://staging.api.cz-stack.local",
      description: "Staging",
    },
    {
      url: "https://api.cz-stack.local",
      description: "Production",
    },
  ],
  paths: {
    "/db/sqlite": {
      get: {
        operationId: "getDbSqlite",
        summary: "Download the current AIM SQLite database file",
        responses: {
          "200": {
            description: "AIM SQLite database file",
            content: {
              "application/vnd.sqlite3": {
                schema: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Read service health status",
        responses: {
          "200": {
            description: "Healthy response",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
          "503": {
            description: "Unhealthy response",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthError",
                },
              },
            },
          },
        },
      },
    },
    "/opencode/models": {
      get: {
        operationId: "listOpenCodeModels",
        summary: "List OpenCode provider and model combinations",
        responses: {
          "200": {
            description: "OpenCode provider and model combinations",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OpenCodeModelsResponse",
                },
              },
            },
          },
          "503": {
            description: "OpenCode models unavailable",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/projects": {
      post: {
        operationId: "createProject",
        summary: "Create a project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateProjectRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created project",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Project",
                },
              },
            },
          },
          "400": {
            description: "Invalid project payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      get: {
        operationId: "listProjects",
        summary: "List projects",
        responses: {
          "200": {
            description: "Project collection",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProjectListResponse",
                },
              },
            },
          },
        },
      },
    },
    "/projects/{projectId}": {
      patch: {
        operationId: "patchProjectById",
        summary: "Update a project",
        parameters: [
          {
            $ref: "#/components/parameters/ProjectIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PatchProjectRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated project",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Project",
                },
              },
            },
          },
          "400": {
            description: "Invalid project patch",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Project not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        operationId: "deleteProjectById",
        summary: "Delete a project",
        parameters: [
          {
            $ref: "#/components/parameters/ProjectIdPathParameter",
          },
        ],
        responses: {
          "204": {
            description: "Project deleted",
          },
          "404": {
            description: "Project not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/optimizer/status": {
      get: {
        operationId: "getOptimizerStatus",
        summary: "Read AIM optimizer runtime status",
        responses: {
          "200": {
            description: "Optimizer runtime status",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OptimizerStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/optimizer/start": {
      post: {
        operationId: "startOptimizer",
        summary: "Start AIM optimizer runtime",
        responses: {
          "200": {
            description: "Optimizer runtime status after start",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OptimizerStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/optimizer/stop": {
      post: {
        operationId: "stopOptimizer",
        summary: "Stop AIM optimizer runtime",
        responses: {
          "200": {
            description: "Optimizer runtime status after stop",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/OptimizerStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks": {
      post: {
        operationId: "createTask",
        summary: "Create a task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateTaskRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created task",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "400": {
            description: "Invalid task payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      get: {
        operationId: "listTasks",
        summary: "List tasks",
        parameters: [
          {
            $ref: "#/components/parameters/TaskStatusQueryParameter",
          },
          {
            $ref: "#/components/parameters/TaskDoneQueryParameter",
          },
          {
            $ref: "#/components/parameters/TaskSessionIdQueryParameter",
          },
        ],
        responses: {
          "200": {
            description: "Task collection",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TaskListResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid task filter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}": {
      get: {
        operationId: "getTaskById",
        summary: "Read a task",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        responses: {
          "200": {
            description: "Task detail",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      patch: {
        operationId: "patchTaskById",
        summary: "Update a task",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PatchTaskRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated task",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "400": {
            description: "Invalid task patch",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        operationId: "deleteTaskById",
        summary: "Delete a task",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        responses: {
          "204": {
            description: "Task deleted",
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/worktree_path": {
      put: {
        operationId: "putTaskWorktreePathById",
        summary: "Update a task worktree path",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TaskWorktreePathRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated task",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "400": {
            description: "Invalid task worktree path payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/pull_request_url": {
      put: {
        operationId: "putTaskPullRequestUrlById",
        summary: "Update a task pull request URL",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TaskPullRequestUrlRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated task",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "400": {
            description: "Invalid task pull request URL payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/dependencies": {
      put: {
        operationId: "putTaskDependenciesById",
        summary: "Update task dependencies",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TaskDependenciesRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated task",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Task",
                },
              },
            },
          },
          "400": {
            description: "Invalid task dependencies payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/resolve": {
      post: {
        operationId: "resolveTaskById",
        summary: "Resolve a task with a result",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TaskResultRequest",
              },
            },
          },
        },
        responses: {
          "204": {
            description: "Task resolved",
          },
          "400": {
            description: "Invalid task result",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/reject": {
      post: {
        operationId: "rejectTaskById",
        summary: "Reject a task with a result",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/TaskResultRequest",
              },
            },
          },
        },
        responses: {
          "204": {
            description: "Task rejected",
          },
          "400": {
            description: "Invalid task result",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/{taskId}/spec": {
      get: {
        operationId: "getTaskSpecById",
        summary: "Read a task spec markdown document",
        parameters: [
          {
            $ref: "#/components/parameters/TaskIdPathParameter",
          },
        ],
        responses: {
          "200": {
            description: "Task spec markdown",
            content: {
              "text/markdown": {
                schema: {
                  type: "string",
                },
              },
            },
          },
          "404": {
            description: "Task not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/tasks/batch": {
      post: {
        operationId: "createTaskBatch",
        summary: "Apply an atomic batch of task operations",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateTaskBatchRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Applied task batch operations",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TaskBatchResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid task batch payload or operation",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/dimensions": {
      post: {
        operationId: "createDimension",
        summary: "Create a project evaluation dimension",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateDimensionRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created dimension",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Dimension",
                },
              },
            },
          },
          "400": {
            description: "Invalid dimension payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      get: {
        operationId: "listDimensions",
        summary: "List dimensions for a project",
        parameters: [
          {
            $ref: "#/components/parameters/ProjectPathQueryParameter",
          },
        ],
        responses: {
          "200": {
            description: "Dimension collection",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DimensionListResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid dimension filter",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/dimensions/{dimensionId}": {
      get: {
        operationId: "getDimensionById",
        summary: "Read a dimension",
        parameters: [
          {
            $ref: "#/components/parameters/DimensionIdPathParameter",
          },
        ],
        responses: {
          "200": {
            description: "Dimension detail",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Dimension",
                },
              },
            },
          },
          "404": {
            description: "Dimension not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      patch: {
        operationId: "patchDimensionById",
        summary: "Update a dimension",
        parameters: [
          {
            $ref: "#/components/parameters/DimensionIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/PatchDimensionRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated dimension",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Dimension",
                },
              },
            },
          },
          "400": {
            description: "Invalid dimension patch",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Dimension not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      delete: {
        operationId: "deleteDimensionById",
        summary: "Delete a dimension and its evaluations",
        parameters: [
          {
            $ref: "#/components/parameters/DimensionIdPathParameter",
          },
        ],
        responses: {
          "204": {
            description: "Dimension deleted",
          },
          "404": {
            description: "Dimension not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/dimensions/{dimensionId}/evaluations": {
      get: {
        operationId: "listDimensionEvaluations",
        summary: "List append-only evaluations for a dimension",
        parameters: [
          {
            $ref: "#/components/parameters/DimensionIdPathParameter",
          },
        ],
        responses: {
          "200": {
            description: "Dimension evaluation collection",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DimensionEvaluationListResponse",
                },
              },
            },
          },
          "404": {
            description: "Dimension not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createDimensionEvaluation",
        summary: "Append a dimension evaluation",
        parameters: [
          {
            $ref: "#/components/parameters/DimensionIdPathParameter",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateDimensionEvaluationRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created dimension evaluation",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DimensionEvaluation",
                },
              },
            },
          },
          "400": {
            description: "Invalid dimension evaluation payload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Dimension not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    parameters: {
      TaskIdPathParameter: {
        name: "taskId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
      TaskStatusQueryParameter: {
        name: "status",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["processing", "resolved", "rejected"],
        },
      },
      TaskDoneQueryParameter: {
        name: "done",
        in: "query",
        required: false,
        schema: {
          type: "boolean",
        },
      },
      TaskSessionIdQueryParameter: {
        name: "session_id",
        in: "query",
        required: false,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
      ProjectIdPathParameter: {
        name: "projectId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
      ProjectPathQueryParameter: {
        name: "project_path",
        in: "query",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
      BulkIdPathParameter: {
        name: "bulkId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
      DimensionIdPathParameter: {
        name: "dimensionId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
      },
    },
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            description: "Health status reported by the service",
            enum: ["ok"],
          },
        },
      },
      HealthError: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            description: "Stable machine-readable error code",
            enum: ["UNAVAILABLE"],
          },
          message: {
            type: "string",
            description: "Human-readable error detail",
            minLength: 1,
          },
        },
      },
      Project: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "project_path",
          "global_provider_id",
          "global_model_id",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
            readOnly: true,
          },
          name: {
            type: "string",
            minLength: 1,
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          global_provider_id: {
            type: "string",
            minLength: 1,
          },
          global_model_id: {
            type: "string",
            minLength: 1,
          },
          created_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
          updated_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
        },
      },
      CreateProjectRequest: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "project_path",
          "global_provider_id",
          "global_model_id",
        ],
        properties: {
          name: {
            type: "string",
            minLength: 1,
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          global_provider_id: {
            type: "string",
            minLength: 1,
          },
          global_model_id: {
            type: "string",
            minLength: 1,
          },
        },
      },
      PatchProjectRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          global_provider_id: {
            type: "string",
            minLength: 1,
          },
          global_model_id: {
            type: "string",
            minLength: 1,
          },
        },
      },
      ProjectListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Project",
            },
          },
        },
      },
      Task: {
        type: "object",
        additionalProperties: false,
        required: [
          "task_id",
          "title",
          "task_spec",
          "project_id",
          "project_path",
          "developer_provider_id",
          "developer_model_id",
          "result",
          "session_id",
          "worktree_path",
          "pull_request_url",
          "dependencies",
          "done",
          "status",
          "source_metadata",
          "created_at",
          "updated_at",
        ],
        properties: {
          task_id: {
            type: "string",
            minLength: 1,
            readOnly: true,
          },
          task_spec: {
            type: "string",
            minLength: 1,
          },
          title: {
            type: "string",
            minLength: 1,
          },
          project_id: {
            type: "string",
            format: "uuid",
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          developer_provider_id: {
            type: "string",
            minLength: 1,
          },
          developer_model_id: {
            type: "string",
            minLength: 1,
          },
          result: {
            type: "string",
          },
          source_metadata: {
            type: "object",
            additionalProperties: true,
          },
          session_id: {
            type: ["string", "null"],
          },
          worktree_path: {
            type: ["string", "null"],
          },
          pull_request_url: {
            type: ["string", "null"],
          },
          dependencies: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          done: {
            type: "boolean",
            readOnly: true,
          },
          status: {
            type: "string",
            enum: ["processing", "resolved", "rejected"],
          },
          created_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
          updated_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
        },
      },
      CreateTaskRequest: {
        type: "object",
        additionalProperties: false,
        required: ["title", "task_spec", "project_id"],
        properties: {
          title: {
            type: "string",
            minLength: 1,
          },
          task_spec: {
            type: "string",
            minLength: 1,
          },
          project_id: {
            type: "string",
            format: "uuid",
          },
          dependencies: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          result: {
            type: "string",
            default: "",
          },
          session_id: {
            type: ["string", "null"],
          },
          worktree_path: {
            type: ["string", "null"],
          },
          pull_request_url: {
            type: ["string", "null"],
          },
          status: {
            type: "string",
            enum: ["processing", "resolved", "rejected"],
          },
        },
      },
      PatchTaskRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          task_spec: {
            type: "string",
            minLength: 1,
          },
          session_id: {
            type: ["string", "null"],
          },
          worktree_path: {
            type: ["string", "null"],
          },
          pull_request_url: {
            type: ["string", "null"],
          },
          dependencies: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          result: {
            type: "string",
          },
          status: {
            type: "string",
            enum: ["processing", "resolved", "rejected"],
          },
        },
      },
      CreateTaskBatchTask: {
        type: "object",
        additionalProperties: false,
        required: ["task_id", "title", "spec"],
        properties: {
          task_id: {
            type: "string",
            format: "uuid",
          },
          title: {
            type: "string",
            minLength: 1,
          },
          spec: {
            type: "string",
            minLength: 1,
          },
          dependencies: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
          result: {
            type: "string",
            default: "",
          },
          session_id: {
            type: ["string", "null"],
          },
          worktree_path: {
            type: ["string", "null"],
          },
          pull_request_url: {
            type: ["string", "null"],
          },
          status: {
            type: "string",
            enum: ["processing", "resolved", "rejected"],
          },
          source_metadata: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      CreateTaskBatchOperation: {
        type: "object",
        additionalProperties: false,
        required: ["type", "task"],
        properties: {
          type: {
            type: "string",
            enum: ["create"],
          },
          task: {
            $ref: "#/components/schemas/CreateTaskBatchTask",
          },
        },
      },
      DeleteTaskBatchOperation: {
        type: "object",
        additionalProperties: false,
        required: ["type", "task_id"],
        properties: {
          type: {
            type: "string",
            enum: ["delete"],
          },
          task_id: {
            type: "string",
            format: "uuid",
          },
        },
      },
      TaskBatchOperation: {
        oneOf: [
          {
            $ref: "#/components/schemas/CreateTaskBatchOperation",
          },
          {
            $ref: "#/components/schemas/DeleteTaskBatchOperation",
          },
        ],
        discriminator: {
          propertyName: "type",
        },
      },
      CreateTaskBatchRequest: {
        type: "object",
        additionalProperties: false,
        required: ["project_path", "operations"],
        properties: {
          project_path: {
            type: "string",
            minLength: 1,
          },
          operations: {
            type: "array",
            minItems: 1,
            items: {
              $ref: "#/components/schemas/TaskBatchOperation",
            },
          },
        },
      },
      TaskBatchOperationResult: {
        type: "object",
        additionalProperties: false,
        required: ["type", "task_id"],
        properties: {
          type: {
            type: "string",
            enum: ["create", "delete"],
          },
          task_id: {
            type: "string",
            format: "uuid",
          },
        },
      },
      TaskBatchResponse: {
        type: "object",
        additionalProperties: false,
        required: ["results"],
        properties: {
          results: {
            type: "array",
            items: {
              $ref: "#/components/schemas/TaskBatchOperationResult",
            },
          },
        },
      },
      TaskWorktreePathRequest: {
        type: "object",
        additionalProperties: false,
        required: ["worktree_path"],
        properties: {
          worktree_path: {
            type: ["string", "null"],
          },
        },
      },
      TaskPullRequestUrlRequest: {
        type: "object",
        additionalProperties: false,
        required: ["pull_request_url"],
        properties: {
          pull_request_url: {
            type: ["string", "null"],
          },
        },
      },
      TaskDependenciesRequest: {
        type: "object",
        additionalProperties: false,
        required: ["dependencies"],
        properties: {
          dependencies: {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
            },
          },
        },
      },
      TaskResultRequest: {
        type: "object",
        additionalProperties: false,
        required: ["result"],
        properties: {
          result: {
            type: "string",
            minLength: 1,
            pattern: "^(?!\\s*$).+",
          },
        },
      },
      TaskListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Task",
            },
          },
        },
      },
      Dimension: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "project_path",
          "name",
          "goal",
          "evaluation_method",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            readOnly: true,
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          name: {
            type: "string",
            minLength: 1,
          },
          goal: {
            type: "string",
            minLength: 1,
          },
          evaluation_method: {
            type: "string",
            minLength: 1,
          },
          created_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
          updated_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
        },
      },
      CreateDimensionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["project_path", "name", "goal", "evaluation_method"],
        properties: {
          project_path: {
            type: "string",
            minLength: 1,
          },
          name: {
            type: "string",
            minLength: 1,
          },
          goal: {
            type: "string",
            minLength: 1,
          },
          evaluation_method: {
            type: "string",
            minLength: 1,
          },
        },
      },
      PatchDimensionRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
          },
          goal: {
            type: "string",
            minLength: 1,
          },
          evaluation_method: {
            type: "string",
            minLength: 1,
          },
        },
      },
      DimensionListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Dimension",
            },
          },
        },
      },
      DimensionEvaluation: {
        type: "object",
        additionalProperties: false,
        description:
          "Immutable append-only evaluation result for one dimension at one commit by one evaluator model. Score bands: 0-20 缺失, 21-40 初始, 41-60 可用, 61-80 稳定, 81-95 优秀, 96-100 近似完成.",
        required: [
          "id",
          "dimension_id",
          "project_path",
          "commit_sha",
          "evaluator_model",
          "score",
          "evaluation",
          "created_at",
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            readOnly: true,
          },
          dimension_id: {
            type: "string",
            minLength: 1,
            readOnly: true,
          },
          project_path: {
            type: "string",
            minLength: 1,
          },
          commit_sha: {
            type: "string",
            minLength: 1,
          },
          evaluator_model: {
            type: "string",
            minLength: 1,
          },
          score: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description:
              "0-20 缺失; 21-40 初始; 41-60 可用; 61-80 稳定; 81-95 优秀; 96-100 近似完成.",
          },
          evaluation: {
            type: "string",
            minLength: 1,
          },
          created_at: {
            type: "string",
            format: "date-time",
            readOnly: true,
          },
        },
      },
      CreateDimensionEvaluationRequest: {
        type: "object",
        additionalProperties: false,
        required: [
          "project_path",
          "commit_sha",
          "evaluator_model",
          "score",
          "evaluation",
        ],
        properties: {
          project_path: {
            type: "string",
            minLength: 1,
          },
          commit_sha: {
            type: "string",
            minLength: 1,
          },
          evaluator_model: {
            type: "string",
            minLength: 1,
          },
          score: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description:
              "0-20 缺失; 21-40 初始; 41-60 可用; 61-80 稳定; 81-95 优秀; 96-100 近似完成.",
          },
          evaluation: {
            type: "string",
            minLength: 1,
          },
        },
      },
      DimensionEvaluationListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/DimensionEvaluation",
            },
          },
        },
      },
      OpenCodeModelCombination: {
        type: "object",
        additionalProperties: false,
        required: ["provider_id", "provider_name", "model_id", "model_name"],
        properties: {
          provider_id: {
            type: "string",
            minLength: 1,
          },
          provider_name: {
            type: "string",
            minLength: 1,
          },
          model_id: {
            type: "string",
            minLength: 1,
          },
          model_name: {
            type: "string",
            minLength: 1,
          },
        },
      },
      OpenCodeModelsResponse: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              $ref: "#/components/schemas/OpenCodeModelCombination",
            },
          },
        },
      },
      OptimizerStatusResponse: {
        type: "object",
        additionalProperties: false,
        required: [
          "enabled_triggers",
          "last_event",
          "last_scan_at",
          "lanes",
          "running",
        ],
        properties: {
          enabled_triggers: {
            type: "array",
            items: {
              $ref: "#/components/schemas/OptimizerTrigger",
            },
          },
          last_event: {
            anyOf: [
              {
                $ref: "#/components/schemas/OptimizerEventStatus",
              },
              {
                type: "null",
              },
            ],
          },
          last_scan_at: {
            type: ["string", "null"],
            format: "date-time",
          },
          lanes: {
            type: "object",
            additionalProperties: false,
            required: [
              "manager_evaluation",
              "coordinator_task_pool",
              "developer_follow_up",
            ],
            properties: {
              manager_evaluation: {
                $ref: "#/components/schemas/OptimizerLaneStatus",
              },
              coordinator_task_pool: {
                $ref: "#/components/schemas/OptimizerLaneStatus",
              },
              developer_follow_up: {
                $ref: "#/components/schemas/OptimizerLaneStatus",
              },
            },
          },
          running: {
            type: "boolean",
          },
        },
      },
      OptimizerLaneStatus: {
        type: "object",
        additionalProperties: false,
        required: ["last_error", "last_scan_at", "running"],
        properties: {
          last_error: {
            type: ["string", "null"],
          },
          last_scan_at: {
            type: ["string", "null"],
            format: "date-time",
          },
          running: {
            type: "boolean",
          },
        },
      },
      OptimizerTrigger: {
        type: "string",
        enum: ["task_resolved"],
      },
      OptimizerEventStatus: {
        type: "object",
        additionalProperties: false,
        required: ["task_id", "triggered_scan", "type"],
        properties: {
          task_id: {
            type: "string",
            minLength: 1,
          },
          triggered_scan: {
            type: "boolean",
          },
          type: {
            $ref: "#/components/schemas/OptimizerTrigger",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            enum: [
              "TASK_NOT_FOUND",
              "TASK_CONFLICT",
              "TASK_VALIDATION_ERROR",
              "TASK_UNSUPPORTED_STATUS",
              "PROJECT_NOT_FOUND",
              "PROJECT_CONFLICT",
              "PROJECT_VALIDATION_ERROR",
              "MANAGER_REPORT_NOT_FOUND",
              "MANAGER_REPORT_CONFLICT",
              "MANAGER_REPORT_VALIDATION_ERROR",
              "TASK_WRITE_BULK_NOT_FOUND",
              "TASK_WRITE_BULK_CONFLICT",
              "TASK_WRITE_BULK_VALIDATION_ERROR",
              "DIMENSION_NOT_FOUND",
              "DIMENSION_VALIDATION_ERROR",
              "OPENCODE_MODELS_UNAVAILABLE",
            ],
          },
          message: {
            type: "string",
            minLength: 1,
          },
        },
      },
    },
  },
} as const;
