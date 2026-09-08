import { rateLimit } from "express-rate-limit";
import { requestTraceId } from "./problem";

export function publicWriteBackstop(options: {
  windowMs: number;
  limit: number;
}) {
  // The default in-process store counts per instance. It does not bound aggregate
  // volume under Cloud Run autoscaling. Edge limits require separate infrastructure
  // authorization; this backstop is mounted only on the two public POST routes.
  return rateLimit({
    ...options,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(req, res) {
      res
        .status(429)
        .type("application/problem+json")
        .json({
          type: "https://samrapay.local/problems/rate_limited",
          title: "Too many requests",
          status: 429,
          code: "RATE_LIMITED",
          detail: "Please retry after the interval in the Retry-After header.",
          traceId: requestTraceId(req),
        });
    },
  });
}
