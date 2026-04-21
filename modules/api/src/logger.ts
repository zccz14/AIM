import pino from "pino";

import type { ApiLogger } from "./api-logger.js";

export const createApiLogger = (): ApiLogger => pino();
