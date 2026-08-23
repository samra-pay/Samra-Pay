# Cloud Run customer-web to API authentication

Status: implemented and locally tested; cloud IAM and deployment remain
unauthorized. This boundary creates no Google Cloud resource, credential,
public route, vendor connection, or traffic.

## Problem

The customer browser uses `Authorization: Bearer <Auth0 access token>` so the
Samra API can authenticate the customer. A private Cloud Run API separately
requires a Google-signed caller identity. Replacing the `Authorization` header
with the Google token would discard customer identity. Forwarding only the
Auth0 token would fail Cloud Run IAM.

## Locked request path

```text
customer browser
  Authorization: Bearer <Auth0 access token>
        |
        v
samra-customer-web Cloud Run service
  - preserves Authorization
  - strips every inbound X-Serverless-Authorization value
  - obtains a short-lived Google ID token from the Cloud Run metadata server
  - binds that token to the exact samra-api Cloud Run audience
        |
        v
samra-api Cloud Run service
  Authorization: Bearer <Auth0 access token>
  X-Serverless-Authorization: Bearer <Google service ID token>
        |
        v
Cloud Run IAM validates the customer-web service identity
Samra API validates the Auth0 customer identity
```

Google documents `X-Serverless-Authorization` for this exact case: Cloud Run
checks that header when both headers exist, while the application's custom
`Authorization` header remains available to the container. Cloud Run removes
the Google token signature before the request reaches the user container.

## Runtime contract

The customer-web service requires:

```text
SAMRA_API_ORIGIN=https://<exact-samra-api-run-app-origin>
SAMRA_API_SERVICE_AUTH_MODE=cloud-run-iam
SAMRA_API_SERVICE_AUDIENCE=https://<exact-samra-api-run-app-origin>
```

The origin and audience must be HTTPS origins with no credentials, path,
query, or fragment, and they must match exactly after URL normalization.
Non-loopback API origins cannot disable service authentication. Loopback-only
development defaults to disabled service authentication.

The token source is the fixed Cloud Run metadata endpoint with the required
`Metadata-Flavor: Google` header. Tokens are held only in process memory,
checked for the exact audience and a usable expiration, and refreshed before
the five-minute expiry window. No service-account key, secret, access token,
or refresh token is stored in the image, repository, browser, or application
configuration.

## Fail-closed behavior

- A browser-supplied `X-Serverless-Authorization` header is always removed.
- A missing or invalid runtime mode, audience, or remote API origin prevents
  server startup.
- A metadata timeout, non-success response, malformed token, wrong audience,
  or near-expiry token returns an explicit HTTP 502 before the API is called.
- The proxy never falls back to mock financial data.
- Errors never include either the Auth0 token or the Google identity token.

## Cloud activation gate

Implementation is not permission. A future reviewed deployment must:

1. deploy `samra-api` with IAM authentication and zero traffic;
2. deploy `samra-customer-web` with its dedicated service account and zero
   traffic;
3. grant only that customer-web service account `roles/run.invoker` on the
   exact API service, never at project scope;
4. inject the exact API service URI as both origin and audience;
5. prove a valid dual-token request succeeds;
6. prove missing Google identity, missing Auth0 identity, wrong audience,
   client header spoofing, and direct unauthenticated API access fail;
7. record logs without tokens and complete rollback evidence before traffic.

The Operations Portal is not included. It remains blocked on separate
workforce authentication, authorization, access review, and API-security
promotion.

## References

- [Google Cloud Run service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Google Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
