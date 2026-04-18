import { ContractClientError, type HealthError } from "@cz-stack/contract";
import { queryOptions } from "@tanstack/react-query";

import { createWebApiClient } from "../../lib/api-client.js";

const fallbackError: HealthError = {
  code: "UNAVAILABLE",
  message: "unexpected error",
};

const healthApiClient = createWebApiClient();

export const healthQueryKey = ["health"] as const;

export const getHealthErrorMessage = (error: unknown) => {
  const healthError =
    error instanceof ContractClientError ? error.error : fallbackError;

  return `API unavailable: ${healthError.message}`;
};

export const healthQueryOptions = queryOptions({
  queryKey: healthQueryKey,
  queryFn: () => healthApiClient.getHealth(),
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
