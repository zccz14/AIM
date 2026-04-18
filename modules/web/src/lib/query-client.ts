import { QueryClient } from "@tanstack/react-query";

export const webQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});
