import { execFile } from "node:child_process";

export const defaultExternalCommandTimeoutMs = 60_000;

const maxErrorDetailLength = 1200;

type ExecExternalCommandOptions = {
  args: string[];
  command: "gh" | "git";
  cwd?: string;
  signal?: AbortSignal;
  target?: string;
  timeoutMs?: number;
};

type ExternalCommandError = Error & {
  code?: null | number | string;
  killed?: boolean;
  signal?: NodeJS.Signals | string | null;
};

const redactSensitiveDetail = (value: string) =>
  value
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/\/\/[^\s/:]+:[^\s/@]+@/g, "//[REDACTED]@")
    .replace(/((?:token|password|passwd|secret)=)[^\s&]+/gi, "$1[REDACTED]")
    .replace(/\s+and stack\s+at\s+[^\s.]+(?:\.\w+)?:\d+/gi, "");

const truncate = (value: string) =>
  value.length > maxErrorDetailLength
    ? `${value.slice(0, maxErrorDetailLength)}... [truncated]`
    : value;

const safeDetail = (value: unknown) =>
  truncate(redactSensitiveDetail(String(value ?? "").trim()));

const quoteArg = (arg: string) => {
  const safeArg = redactSensitiveDetail(arg);

  return /^[A-Za-z0-9_./:=@[\]-]+$/.test(safeArg)
    ? safeArg
    : JSON.stringify(safeArg);
};

const commandLabel = (command: string, args: string[]) =>
  [command, ...args.map(quoteArg)].join(" ");

const commandAdvice = (command: "gh" | "git") =>
  command === "gh"
    ? "Check GitHub CLI installation, authentication, repository access, and network connectivity."
    : "Check Git installation, repository access, authentication, and network connectivity.";

const isTimeoutError = (error: ExternalCommandError) =>
  error.killed === true ||
  error.signal === "SIGTERM" ||
  error.code === "ETIMEDOUT";

const isAbortError = (error: ExternalCommandError) =>
  error.name === "AbortError";

const buildError = ({
  args,
  command,
  cwd,
  error,
  stderr,
  target,
  timeoutMs,
}: ExecExternalCommandOptions & {
  error: ExternalCommandError;
  stderr: string;
  timeoutMs: number;
}) => {
  const location = cwd ? ` in ${cwd}` : "";
  const targetMessage = target ? ` Target: ${safeDetail(target)}.` : "";
  const stderrMessage = stderr.trim() ? ` stderr: ${safeDetail(stderr)}.` : "";
  const originalMessage = error.message
    ? ` detail: ${safeDetail(error.message)}.`
    : "";
  const exitMessage =
    typeof error.code === "number" ? ` Exit code: ${error.code}.` : "";
  const label = commandLabel(command, args);

  if (isAbortError(error)) {
    return new Error(
      `External command aborted: ${label}${location}.${targetMessage} ${commandAdvice(command)}${stderrMessage}${originalMessage}`,
    );
  }

  if (isTimeoutError(error)) {
    return new Error(
      `External command timed out after ${timeoutMs}ms: ${label}${location}.${targetMessage} ${commandAdvice(command)}${stderrMessage}${originalMessage}`,
    );
  }

  return new Error(
    `External command failed: ${label}${location}.${targetMessage}${exitMessage} ${commandAdvice(command)}${stderrMessage}${originalMessage}`,
  );
};

export const execExternalCommand = ({
  args,
  command,
  cwd,
  signal,
  target,
  timeoutMs = defaultExternalCommandTimeoutMs,
}: ExecExternalCommandOptions) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, encoding: "utf8", signal, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            buildError({
              args,
              command,
              cwd,
              error,
              signal,
              stderr: String(stderr ?? ""),
              target,
              timeoutMs,
            }),
          );
          return;
        }

        resolve(String(stdout));
      },
    );
  });

export const execGit = (
  cwd: string,
  args: string[],
  options: Omit<ExecExternalCommandOptions, "args" | "command" | "cwd"> = {},
) => execExternalCommand({ ...options, args, command: "git", cwd });

export const execGh = (
  args: string[],
  options: Omit<ExecExternalCommandOptions, "args" | "command"> = {},
) => execExternalCommand({ ...options, args, command: "gh" });
