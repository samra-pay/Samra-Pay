import { randomUUID } from "node:crypto";
import { METHODS, type IncomingMessage, type ServerResponse } from "node:http";
import type { Logger } from "pino";
import pinoHttp from "pino-http";
import { serializeOperationalError } from "./log-serializers";

const methods = new Set(METHODS);

export function createHttpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    wrapSerializers: false,
    serializers: {
      req(req: IncomingMessage) {
        return {
          id: req.id,
          method: methods.has(req.method ?? "") ? req.method : "OTHER",
        };
      },
      res(res: ServerResponse) {
        return { statusCode: res.statusCode };
      },
      err: serializeOperationalError,
    },
  });
}
