import { useQuery } from "@tanstack/react-query";

import { healthQueryOptions } from "./queries.js";

export const useHealthQuery = () => useQuery(healthQueryOptions);
