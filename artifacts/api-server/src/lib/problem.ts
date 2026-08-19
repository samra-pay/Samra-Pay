import type { ErrorRequestHandler, Request } from "express";
import { DomainError } from "@workspace/remittance";
import { LedgerError } from "@workspace/ledger";
import { UnauthorizedError } from "express-oauth2-jwt-bearer";
import {
  CustomerAccessRestrictedError,
  CustomerAuthenticationRequiredError,
  CustomerIdentityUnboundError,
  CustomerOnboardingRequiredError,
} from "./customer-auth-errors";

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export class RequestValidationError extends Error {
  readonly fieldErrors: FieldErrors;

  constructor(message: string, fieldErrors: FieldErrors = Object.freeze({})) {
    super(message);
    this.name = "RequestValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = "The synthetic demo backend is disabled.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor(message = "A valid workforce session is required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  constructor(
    message = "The workforce role is not permitted to access this resource.",
  ) {
    super(message);
    this.name = "AuthorizationDeniedError";
  }
}

export const problemHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const mapped = mapError(error);
  const traceId = requestTraceId(req);
  if (mapped.wwwAuthenticate) {
    res.setHeader("WWW-Authenticate", mapped.wwwAuthenticate);
  }
  res
    .status(mapped.status)
    .type("application/problem+json")
    .json({
      type: `https://samrapay.local/problems/${mapped.code.toLowerCase()}`,
      title: mapped.title,
      status: mapped.status,
      code: mapped.code,
      detail: mapped.detail,
      ...(Object.keys(mapped.fieldErrors).length > 0
        ? { fieldErrors: mapped.fieldErrors }
        : {}),
      traceId,
    });
};

function mapError(error: unknown): Readonly<{
  status: number;
  code: string;
  title: string;
  detail: string;
  fieldErrors: FieldErrors;
  wwwAuthenticate?: string;
}> {
  if (error instanceof RequestValidationError) {
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      title: "Request validation failed",
      detail: error.message,
      fieldErrors: error.fieldErrors,
    };
  }
  if (error instanceof BackendUnavailableError) {
    return {
      status: 503,
      code: "BACKEND_UNAVAILABLE",
      title: "Demo backend unavailable",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (error instanceof AuthenticationRequiredError) {
    return {
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      title: "Authentication required",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (
    error instanceof UnauthorizedError ||
    error instanceof CustomerAuthenticationRequiredError
  ) {
    return {
      status: 401,
      code: "CUSTOMER_AUTHENTICATION_REQUIRED",
      title: "Customer authentication required",
      detail: "A valid customer access token is required.",
      fieldErrors: {},
      wwwAuthenticate: 'Bearer realm="samra-api"',
    };
  }
  if (error instanceof CustomerIdentityUnboundError) {
    return {
      status: 403,
      code: "CUSTOMER_IDENTITY_UNBOUND",
      title: "Customer identity not linked",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (error instanceof CustomerAccessRestrictedError) {
    return {
      status: 403,
      code: "CUSTOMER_ACCESS_RESTRICTED",
      title: "Customer access restricted",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (error instanceof CustomerOnboardingRequiredError) {
    return {
      status: 403,
      code: "CUSTOMER_ONBOARDING_REQUIRED",
      title: "Customer onboarding required",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (error instanceof AuthorizationDeniedError) {
    return {
      status: 403,
      code: "AUTHORIZATION_DENIED",
      title: "Authorization denied",
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (error instanceof DomainError) {
    const status = domainStatus(error.code);
    return {
      status,
      code: error.code,
      title: domainTitle(status),
      detail: error.message,
      fieldErrors: {},
    };
  }
  if (
    error instanceof LedgerError &&
    error.code === "INSUFFICIENT_AVAILABLE_BALANCE"
  ) {
    return {
      status: 409,
      code: "INSUFFICIENT_FUNDS",
      title: "Request conflict",
      detail: "The selected account does not have enough available demo funds.",
      fieldErrors: {},
    };
  }
  if (error instanceof SyntaxError) {
    return {
      status: 422,
      code: "INVALID_JSON",
      title: "Request validation failed",
      detail: "The request body is not valid JSON.",
      fieldErrors: {},
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    title: "Internal error",
    detail: "The synthetic backend could not complete the request.",
    fieldErrors: {},
  };
}

function domainStatus(code: DomainError["code"]): number {
  switch (code) {
    case "INVALID_ARGUMENT":
      return 422;
    case "NOT_FOUND":
    case "ACTOR_NOT_ALLOWED":
      return 404;
    case "QUOTE_EXPIRED":
      return 410;
    case "CONFLICT":
    case "INVALID_TRANSITION":
    case "QUOTE_ALREADY_USED":
    case "INSUFFICIENT_FUNDS":
      return 409;
  }
}

function domainTitle(status: number): string {
  switch (status) {
    case 404:
      return "Resource not found";
    case 409:
      return "Request conflict";
    case 410:
      return "Quote expired";
    case 422:
      return "Request validation failed";
    default:
      return "Request failed";
  }
}

function requestTraceId(request: Request): string {
  const withId = request as Request & { id?: string | number };
  return withId.id === undefined
    ? `request-${Date.now().toString(36)}`
    : String(withId.id);
}
