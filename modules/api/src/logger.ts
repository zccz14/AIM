import pino from "pino";

type LogFields = Record<string, unknown>;

type ApiLogFn = (message: string, fields?: LogFields) => void;

export type ApiLogger = {
  error: ApiLogFn;
  info: ApiLogFn;
  warn: ApiLogFn;
};

export const createApiLogger = (): ApiLogger => pino();
