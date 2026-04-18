// This file is auto-generated from the OpenAPI contract.
export const openApiDocument = {
  "openapi": "3.1.0",
  "info": {
    "title": "CZ-Stack Contract",
    "version": "0.0.0"
  },
  "servers": [
    {
      "url": "https://dev.api.cz-stack.local",
      "description": "Development"
    },
    {
      "url": "https://staging.api.cz-stack.local",
      "description": "Staging"
    },
    {
      "url": "https://api.cz-stack.local",
      "description": "Production"
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "operationId": "getHealth",
        "summary": "Read service health status",
        "responses": {
          "200": {
            "description": "Healthy response",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthResponse"
                }
              }
            }
          },
          "503": {
            "description": "Unhealthy response",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthError"
                }
              }
            }
          }
        }
      }
    },
    "/tasks": {
      "post": {
        "operationId": "createTask",
        "summary": "Create a task",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateTaskRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created task",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Task"
                }
              }
            }
          },
          "400": {
            "description": "Invalid task payload",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "get": {
        "operationId": "listTasks",
        "summary": "List tasks",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskStatusQueryParameter"
          },
          {
            "$ref": "#/components/parameters/TaskDoneQueryParameter"
          },
          {
            "$ref": "#/components/parameters/TaskSessionIdQueryParameter"
          }
        ],
        "responses": {
          "200": {
            "description": "Task collection",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TaskListResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid task filter",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/tasks/{taskId}": {
      "get": {
        "operationId": "getTaskById",
        "summary": "Read a task",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskIdPathParameter"
          }
        ],
        "responses": {
          "200": {
            "description": "Task detail",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Task"
                }
              }
            }
          },
          "404": {
            "description": "Task not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "patch": {
        "operationId": "patchTaskById",
        "summary": "Update a task",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskIdPathParameter"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/PatchTaskRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Updated task",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Task"
                }
              }
            }
          },
          "400": {
            "description": "Invalid task patch",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Task not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "delete": {
        "operationId": "deleteTaskById",
        "summary": "Delete a task",
        "parameters": [
          {
            "$ref": "#/components/parameters/TaskIdPathParameter"
          }
        ],
        "responses": {
          "204": {
            "description": "Task deleted"
          },
          "404": {
            "description": "Task not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      }
    },
    "parameters": {
      "TaskIdPathParameter": {
        "name": "taskId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      },
      "TaskStatusQueryParameter": {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "created",
            "waiting_assumptions",
            "running",
            "outbound",
            "pr_following",
            "closing",
            "succeeded",
            "failed"
          ]
        }
      },
      "TaskDoneQueryParameter": {
        "name": "done",
        "in": "query",
        "required": false,
        "schema": {
          "type": "boolean"
        }
      },
      "TaskSessionIdQueryParameter": {
        "name": "session_id",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "schemas": {
      "HealthResponse": {
        "type": "object",
        "required": [
          "status"
        ],
        "properties": {
          "status": {
            "type": "string",
            "description": "Health status reported by the service",
            "enum": [
              "ok"
            ]
          }
        }
      },
      "HealthError": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string",
            "description": "Stable machine-readable error code",
            "enum": [
              "UNAVAILABLE"
            ]
          },
          "message": {
            "type": "string",
            "description": "Human-readable error detail",
            "minLength": 1
          }
        }
      },
      "Task": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "task_id",
          "task_spec",
          "session_id",
          "worktree_path",
          "pull_request_url",
          "dependencies",
          "done",
          "status",
          "created_at",
          "updated_at"
        ],
        "properties": {
          "task_id": {
            "type": "string",
            "minLength": 1,
            "readOnly": true
          },
          "task_spec": {
            "type": "string",
            "minLength": 1
          },
          "session_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "worktree_path": {
            "type": [
              "string",
              "null"
            ]
          },
          "pull_request_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "dependencies": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "done": {
            "type": "boolean",
            "readOnly": true
          },
          "status": {
            "type": "string",
            "enum": [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed"
            ]
          },
          "created_at": {
            "type": "string",
            "format": "date-time",
            "readOnly": true
          },
          "updated_at": {
            "type": "string",
            "format": "date-time",
            "readOnly": true
          }
        }
      },
      "CreateTaskRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "task_spec"
        ],
        "properties": {
          "task_spec": {
            "type": "string",
            "minLength": 1
          },
          "dependencies": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "session_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "worktree_path": {
            "type": [
              "string",
              "null"
            ]
          },
          "pull_request_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed"
            ]
          }
        }
      },
      "PatchTaskRequest": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "task_spec": {
            "type": "string",
            "minLength": 1
          },
          "session_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "worktree_path": {
            "type": [
              "string",
              "null"
            ]
          },
          "pull_request_url": {
            "type": [
              "string",
              "null"
            ]
          },
          "dependencies": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "status": {
            "type": "string",
            "enum": [
              "created",
              "waiting_assumptions",
              "running",
              "outbound",
              "pr_following",
              "closing",
              "succeeded",
              "failed"
            ]
          }
        }
      },
      "TaskListResponse": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Task"
            }
          }
        }
      },
      "ErrorResponse": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string",
            "enum": [
              "TASK_NOT_FOUND",
              "TASK_CONFLICT",
              "TASK_VALIDATION_ERROR",
              "TASK_UNSUPPORTED_STATUS"
            ]
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    }
  }
} as const;
