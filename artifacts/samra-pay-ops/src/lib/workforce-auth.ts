import { API_ORIGIN } from "./data-mode";

export type WorkforceSession = Readonly<{
  operatorId: string;
  displayName: string;
  role:
    | "support_readonly"
    | "operations_analyst"
    | "compliance_readonly"
    | "administrator";
  expiresAt: string;
}>;

const SESSION_ENDPOINT = `${API_ORIGIN ?? ""}/api/v1/internal/auth/session`;

export class WorkforceSessionUnavailable extends Error {
  constructor(message = "The workforce service is unavailable.") {
    super(message);
    this.name = "WorkforceSessionUnavailable";
  }
}

export async function loadWorkforceSession(): Promise<WorkforceSession | null> {
  let response: Response;
  try {
    response = await fetch(SESSION_ENDPOINT, { credentials: "include" });
  } catch {
    throw new WorkforceSessionUnavailable(
      "Could not reach the Samra Pay operations API.",
    );
  }
  if (response.status === 401) return null;
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new WorkforceSessionUnavailable(
      body?.detail ?? `The workforce service returned HTTP ${response.status}.`,
    );
  }
  return parseSessionResponse(response);
}

export async function createWorkforceSession(
  loginName: string,
  password: string,
): Promise<WorkforceSession> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginName, password }),
  });
  return parseSessionResponse(response);
}

export async function closeWorkforceSession(): Promise<void> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status !== 204 && response.status !== 401) {
    throw new Error("The workforce session could not be closed.");
  }
}

async function parseSessionResponse(
  response: Response,
): Promise<WorkforceSession> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(body?.detail ?? "The workforce session request failed.");
  }
  return (await response.json()) as WorkforceSession;
}
