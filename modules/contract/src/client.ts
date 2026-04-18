import { createClient as createGeneratedClient } from "../generated/_client/client/index.js";
import { getHealth } from "../generated/client.js";
import type {
  GetHealthError,
  GetHealthResponse,
  HealthError,
  HealthResponse,
} from "../generated/types.js";
import { schemas } from "../generated/zod.js";

export type ContractClientOptions = {
  fetch: typeof fetch;
};

type RequestWithDuplex = Request & {
  duplex?: "half";
};

type RequestInitWithDuplex = RequestInit & {
  duplex?: "half";
};

export class ContractClientError extends Error {
  readonly status: number;
  readonly error: HealthError;

  constructor(status: number, error: HealthError) {
    super(error.message);
    this.name = "ContractClientError";
    this.status = status;
    this.error = error;
  }
}

export type ContractClient = {
  getHealth(): Promise<HealthResponse>;
};

const generatedBaseUrl = "http://contract.internal";
const generatedBaseOrigin = new URL(generatedBaseUrl).origin;
const healthResponseSchema = schemas.HealthResponse;
const healthErrorSchema = schemas.HealthError;

const toPublicFetchInit = (request: Request): RequestInit => {
  const init: RequestInitWithDuplex = {
    body: request.body,
    cache: request.cache,
    credentials: request.credentials,
    headers: request.headers,
    integrity: request.integrity,
    keepalive: request.keepalive,
    method: request.method,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };

  const requestWithDuplex = request as RequestWithDuplex;

  if (request.body !== null && requestWithDuplex.duplex !== undefined) {
    init.duplex = requestWithDuplex.duplex;
  }

  return init;
};

export const adaptGeneratedRequestForPublicFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): [Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]?] => {
  const request =
    input instanceof Request ? input.clone() : new Request(input, init);
  const url = new URL(request.url);

  if (url.origin !== generatedBaseOrigin) {
    return [input, init];
  }

  return [
    `${url.pathname}${url.search}${url.hash}`,
    toPublicFetchInit(request),
  ];
};

export const createContractClient = ({
  fetch: fetchImpl,
}: ContractClientOptions): ContractClient => {
  const client = createGeneratedClient({
    baseUrl: generatedBaseUrl,
    fetch: async (input, init) => {
      return fetchImpl(...adaptGeneratedRequestForPublicFetch(input, init));
    },
  });

  return {
    async getHealth() {
      const result = await getHealth({
        client,
        headers: {
          accept: "application/json",
        },
      });

      if (result.error) {
        throw new ContractClientError(
          result.response.status,
          healthErrorSchema.parse(result.error satisfies GetHealthError),
        );
      }

      return healthResponseSchema.parse(
        result.data satisfies GetHealthResponse,
      ) satisfies HealthResponse;
    },
  };
};
