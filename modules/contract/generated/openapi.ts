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
          enum: [
            "created",
            "waiting_assumptions",
            "running",
            "outbound",
            "pr_following",
            "closing",
            "succeeded",
            "failed",
          ],
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
      Task: {
        type: "object",
        additionalProperties: false,
        required: [
          "task_id",
          "title",
          "task_spec",
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
            enum: [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed",
            ],
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
        required: [
          "title",
          "task_spec",
          "project_path",
          "developer_provider_id",
          "developer_model_id",
        ],
        properties: {
          title: {
            type: "string",
            minLength: 1,
          },
          task_spec: {
            type: "string",
            minLength: 1,
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
            enum: [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed",
            ],
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
            enum: [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed",
            ],
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
