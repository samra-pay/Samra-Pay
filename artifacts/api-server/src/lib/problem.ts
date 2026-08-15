import type { ErrorRequestHandler, Request } from "express";
import { DomainError } from "@workspace/remittance";
import { LedgerError } from "@workspace/ledger";

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

export const problemHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const mapped = mapError(error);
  const traceId = requestTraceId(req);
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
