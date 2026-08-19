import { auth } from "express-oauth2-jwt-bearer";
import type { RequestHandler } from "express";
import type { CustomerAuthConfig } from "../config";

export function createAuth0AccessTokenMiddleware(
  config: Extract<CustomerAuthConfig, { mode: "auth0" }>,
): RequestHandler {
  return auth({
    issuerBaseURL: config.issuerBaseUrl,
    audience: config.audience,
    tokenSigningAlg: config.tokenSigningAlgorithm,
    authRequired: true,
    timeoutDuration: 3_000,
    clockTolerance: 5,
    validators: {
      sub: (subject) =>
        typeof subject === "string" &&
        subject.length > 0 &&
        subject.length <= 255,
    },
  });
}
