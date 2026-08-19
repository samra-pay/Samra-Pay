import type { Request } from "express";
import type { Actor, ActorResolver } from "@workspace/remittance";
import type {
  CustomerAuthIdentityResolution,
  PostgresCustomerIdentityStore,
} from "@workspace/db";
import {
  CustomerAccessRestrictedError,
  CustomerAuthenticationRequiredError,
  CustomerIdentityUnboundError,
  CustomerOnboardingRequiredError,
} from "../lib/customer-auth-errors";

type CustomerIdentityReader = Pick<
  PostgresCustomerIdentityStore,
  "resolveAuth0Identity"
>;

export class Auth0CustomerActorResolver implements ActorResolver<Request> {
  readonly #identities: CustomerIdentityReader;
  readonly #issuer: string;

  constructor(identities: CustomerIdentityReader, issuer: string) {
    this.#identities = identities;
    this.#issuer = issuer;
  }

  async resolve(request: Request): Promise<Actor> {
    const issuer = request.auth?.payload.iss;
    const subject = request.auth?.payload.sub;
    if (
      issuer !== this.#issuer ||
      typeof subject !== "string" ||
      subject.length === 0 ||
      subject.length > 255
    ) {
      throw new CustomerAuthenticationRequiredError();
    }

    const identity = await this.#identities.resolveAuth0Identity({
      issuer,
      subject,
    });
    return actorFromIdentity(identity);
  }
}

function actorFromIdentity(
  identity: CustomerAuthIdentityResolution | undefined,
): Actor {
  if (!identity) {
    throw new CustomerIdentityUnboundError();
  }
  if (
    identity.identityState !== "active" ||
    identity.customerState !== "active"
  ) {
    throw new CustomerAccessRestrictedError();
  }
  if (
    identity.onboardingState !== null &&
    identity.onboardingState !== "activated"
  ) {
    throw new CustomerOnboardingRequiredError();
  }
  return Object.freeze({
    id: identity.customerExternalRef,
    displayName: identity.customerDisplayName,
    kind: "SEEDED_DEMO",
  });
}
