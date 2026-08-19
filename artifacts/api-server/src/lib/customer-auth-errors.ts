export class CustomerAuthenticationRequiredError extends Error {
  constructor(message = "A valid customer access token is required.") {
    super(message);
    this.name = "CustomerAuthenticationRequiredError";
  }
}

export class CustomerIdentityUnboundError extends Error {
  constructor(
    message = "The authenticated identity is not linked to a Samra Pay customer.",
  ) {
    super(message);
    this.name = "CustomerIdentityUnboundError";
  }
}

export class CustomerAccessRestrictedError extends Error {
  constructor(message = "The Samra Pay customer is not active.") {
    super(message);
    this.name = "CustomerAccessRestrictedError";
  }
}

export class CustomerOnboardingRequiredError extends Error {
  constructor(
    message = "Customer onboarding must be completed before financial products are available.",
  ) {
    super(message);
    this.name = "CustomerOnboardingRequiredError";
  }
}
