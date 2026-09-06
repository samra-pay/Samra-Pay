import pino from "pino";
import { serializeOperationalError } from "./log-serializers";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export const loggerOptions = {
  enabled: !isTest,
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: serializeOperationalError },
  redact: [
    "req.headers.authorization",
    "req.headers['x-serverless-authorization']",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
} satisfies pino.LoggerOptions;

export const logger = pino(loggerOptions);
