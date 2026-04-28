import {
  type ContractClient,
  ContractClientError,
  createContractClient,
  type DirectorClarificationKind,
  directorClarificationKindSchema,
  type HealthError,
  type TaskError,
  type TaskStatus,
  taskStatusSchema,
} from "@aim-ai/contract";
import type { Command } from "@oclif/core";

export type CliSuccess<T> = {
  ok: true;
  data: T;
};

export type CliFailure = {
  ok: false;
  error: CliError;
};

export type CliLocalErrorCode =
  | "CLI_USAGE_ERROR"
  | "CLI_INVALID_BASE_URL"
  | "CLI_INVALID_FLAG_VALUE"
  | "UNAVAILABLE";

export type CliLocalError = {
  code: CliLocalErrorCode;
  message: string;
};

export type CliError = CliLocalError | TaskError | HealthError;

const cliError = (code: CliLocalErrorCode, message: string): CliLocalError => ({
  code,
  message,
});

const isCliError = (value: unknown): value is CliError => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      typeof value.code === "string" &&
      "message" in value &&
      typeof value.message === "string",
  );
};

export const requireFlag = (value: string | undefined, flagName: string) => {
  if (!value) {
    throw cliError("CLI_USAGE_ERROR", `missing required flag: --${flagName}`);
  }

  return value;
};

export const pickLastValue = (value: string[] | undefined) => {
  return value?.at(-1);
};

export const parseBooleanFlag = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw cliError(
    "CLI_INVALID_FLAG_VALUE",
    "invalid --done value: expected true or false",
  );
};

export const parseStatusFlag = (
  value: string | undefined,
): TaskStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = taskStatusSchema.safeParse(value);

  if (!parsed.success) {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      `invalid --status value: ${value}`,
    );
  }

  return parsed.data;
};

export const parseDirectorClarificationKindFlag = (
  value: string,
): DirectorClarificationKind => {
  const parsed = directorClarificationKindSchema.safeParse(value);

  if (!parsed.success) {
    throw cliError("CLI_INVALID_FLAG_VALUE", `invalid --kind value: ${value}`);
  }

  return parsed.data;
};

export const parseSourceMetadataJson = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      "invalid --source-metadata-json value: expected JSON object with string values",
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((entry) => typeof entry !== "string")
  ) {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      "invalid --source-metadata-json value: expected JSON object with string values",
    );
  }

  return Object.entries(parsed).map(([key, entry]) => ({
    key,
    value: entry as string,
  }));
};

export const parseJsonFlag = <T = unknown>(value: string, flagName: string) => {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      `invalid --${flagName} value: expected JSON`,
    );
  }
};

export const assertNoConflict = (
  value: unknown,
  clearSelected: boolean,
  valueFlagName: string,
  clearFlagName: string,
) => {
  if (value !== undefined && clearSelected) {
    throw cliError(
      "CLI_INVALID_FLAG_VALUE",
      `cannot combine --${valueFlagName} with --${clearFlagName}`,
    );
  }
};

export const hasOwnPatchField = (patch: Record<string, unknown>) => {
  return Object.keys(patch).length > 0;
};

export const normalizeBaseUrl = (baseUrl: URL) => {
  const normalizedBaseUrl = new URL(baseUrl);

  if (!normalizedBaseUrl.pathname.endsWith("/")) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }

  return normalizedBaseUrl;
};

export const resolveContractUrl = (
  baseUrl: URL,
  input: Parameters<typeof fetch>[0],
) => {
  const url =
    input instanceof Request
      ? new URL(input.url)
      : new URL(input instanceof URL ? input.href : String(input), baseUrl);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (url.pathname.startsWith(normalizedBaseUrl.pathname)) {
    return url;
  }

  return new URL(
    `${url.pathname.slice(1)}${url.search}${url.hash}`,
    normalizedBaseUrl,
  );
};

export const toAbsoluteRequest = (
  baseUrl: URL,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const resolvedUrl = resolveContractUrl(baseUrl, input);

  if (input instanceof Request) {
    return new Request(resolvedUrl, input);
  }

  return new Request(resolvedUrl, init);
};

export const parseBaseUrl = (rawBaseUrl: string) => {
  try {
    return new URL(rawBaseUrl);
  } catch {
    throw cliError(
      "CLI_INVALID_BASE_URL",
      `invalid --base-url value: ${rawBaseUrl}`,
    );
  }
};

export const createTaskContractClient = (
  rawBaseUrl: string,
): ContractClient => {
  const baseUrl = parseBaseUrl(rawBaseUrl);

  return createContractClient({
    fetch: (input, init) => fetch(toAbsoluteRequest(baseUrl, input, init)),
  });
};

export const createAimContractClient = createTaskContractClient;

export const writeSuccess = <T>(command: Command, data: T) => {
  command.log(JSON.stringify({ ok: true, data } satisfies CliSuccess<T>));
};

export const exitWithFailure = (command: Command, error: unknown): never => {
  const failure = {
    ok: false,
    error:
      error instanceof ContractClientError
        ? error.error
        : isCliError(error)
          ? error
          : cliError("UNAVAILABLE", "unexpected error"),
  } satisfies CliFailure;

  process.stderr.write(`${JSON.stringify(failure)}\n`);

  return command.exit(1);
};
