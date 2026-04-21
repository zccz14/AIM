import pino from "pino";

export type ApiLogger = Pick<pino.Logger, "error" | "info" | "warn">;

export const createApiLogger = (): ApiLogger => pino();
