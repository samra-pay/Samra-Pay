import {
  PostgresWorkforceAuthStore,
  WORKFORCE_ROLES,
  type WorkforceRole,
} from "./postgres-workforce-auth";
import { createDatabase } from "./index";
import { PostgresPersistenceContext } from "./postgres-persistence";

const externalRef = required("SAMRA_WORKFORCE_EXTERNAL_REF");
const loginName = required("SAMRA_WORKFORCE_LOGIN_NAME");
const displayName = required("SAMRA_WORKFORCE_DISPLAY_NAME");
const password = required("SAMRA_WORKFORCE_PASSWORD");
const roleValue = required("SAMRA_WORKFORCE_ROLE");
if (!WORKFORCE_ROLES.includes(roleValue as WorkforceRole)) {
  throw new Error(
    `SAMRA_WORKFORCE_ROLE must be one of: ${WORKFORCE_ROLES.join(", ")}.`,
  );
}
const stateValue = process.env["SAMRA_WORKFORCE_STATE"] ?? "active";
if (stateValue !== "active" && stateValue !== "disabled") {
  throw new Error('SAMRA_WORKFORCE_STATE must be "active" or "disabled".');
}

const connection = createDatabase();
try {
  const store = new PostgresWorkforceAuthStore(
    new PostgresPersistenceContext(connection.pool),
  );
  await store.upsertUser({
    externalRef,
    loginName,
    displayName,
    password,
    role: roleValue as WorkforceRole,
    state: stateValue,
  });
  console.log(
    `Workforce identity ${externalRef} provisioned with role ${roleValue} and state ${stateValue}.`,
  );
} finally {
  await connection.pool.end();
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
