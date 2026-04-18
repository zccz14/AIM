import {
  ContractClientError,
  createContractClient,
  type HealthError,
} from "@cz-stack/contract";
import { Command, Flags } from "@oclif/core";

export type CliHealthSuccess = {
  ok: true;
  data: {
    status: "ok";
  };
};

export type CliHealthFailure = {
  ok: false;
  error: HealthError;
};

const fallbackError: HealthError = {
  code: "UNAVAILABLE",
  message: "unexpected error",
};

const normalizeBaseUrl = (baseUrl: URL) => {
  const normalizedBaseUrl = new URL(baseUrl);

  if (!normalizedBaseUrl.pathname.endsWith("/")) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }

  return normalizedBaseUrl;
};

const resolveContractUrl = (
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

const toAbsoluteRequest = (
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

export default class HealthCommand extends Command {
  static override description =
    "Check API health via the shared contract client";

  static override flags = {
    "base-url": Flags.string({
      description: "API base URL",
      required: true,
    }),
  };

  public async run(): Promise<CliHealthSuccess> {
    const { flags } = await this.parse(HealthCommand);
    const resolvedBaseUrl = new URL(flags["base-url"]);
    const client = createContractClient({
      fetch: (input, init) =>
        fetch(toAbsoluteRequest(resolvedBaseUrl, input, init)),
    });

    try {
      const response = await client.getHealth();
      const result: CliHealthSuccess = {
        ok: true,
        data: response,
      };

      this.log(JSON.stringify(result));

      return result;
    } catch (error) {
      const failure: CliHealthFailure = {
        ok: false,
        error:
          error instanceof ContractClientError ? error.error : fallbackError,
      };

      process.stderr.write(`${JSON.stringify(failure)}\n`);
      this.exit(1);
    }
  }
}
