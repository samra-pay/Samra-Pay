import { Router, type RequestHandler } from "express";
import {
  AdvanceDemoCustomerIdentityBody,
  AdvanceDemoCustomerIdentityHeader,
  AdvanceDemoCustomerIdentityParams,
  AdvanceDemoCustomerIdentityResponse,
  BindCustomerAcquisitionSessionBody,
  BindCustomerAcquisitionSessionHeader,
  BindCustomerAcquisitionSessionResponse,
  CancelRemittanceTransferHeader,
  CancelRemittanceTransferParams,
  CancelRemittanceTransferResponse,
  CancelOperationsTransferBody,
  CancelOperationsTransferHeader,
  CancelOperationsTransferParams,
  CancelOperationsTransferResponse,
  CreateWorkforceSessionBody,
  CreateWorkforceSessionResponse,
  CreateBeneficiaryBody,
  CreateBeneficiaryResponse,
  CreateRemittanceQuoteBody,
  CreateRemittanceQuoteResponse,
  CreateRemittanceTransferBody,
  CreateRemittanceTransferHeader,
  CreateRemittanceTransferResponse,
  GetCurrentCustomerResponse,
  GetCustomerWalletResponse,
  GetCustomerIdentityCaseResponse,
  GetCustomerOnboardingResponse,
  GetWorkforceSessionResponse,
  GetBeneficiaryParams,
  GetBeneficiaryResponse,
  GetDemoReconciliationRunParams,
  GetDemoReconciliationRunResponse,
  GetRemittanceOptionsResponse,
  GetRemittanceTransferParams,
  GetRemittanceTransferResponse,
  ListAccountsResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListBeneficiariesResponse,
  ListRemittanceTransfersQueryParams,
  ListRemittanceTransfersResponse,
  RunDemoReconciliationBody,
  RunDemoReconciliationResponse,
  SelectDemoTransferScenarioBody,
  SelectDemoTransferScenarioParams,
  SelectDemoTransferScenarioResponse,
  StartCustomerOnboardingHeader,
  StartCustomerOnboardingResponse,
  StartCustomerIdentityVerificationHeader,
  StartCustomerIdentityVerificationResponse,
  StartCustomerWalletProvisioningBody,
  StartCustomerWalletProvisioningHeader,
  StartCustomerWalletProvisioningResponse,
  SubmitCustomerConsentBundleBody,
  SubmitCustomerConsentBundleHeader,
  SubmitCustomerConsentBundleResponse,
  UpdateBeneficiaryBody,
  UpdateBeneficiaryParams,
  UpdateBeneficiaryResponse,
  DeleteBeneficiaryParams,
  GetOperationsSummaryResponse,
  GetOperationsCustomerFunnelQueryParams,
  GetOperationsCustomerFunnelResponse,
  GetOperationsTransferParams,
  GetOperationsTransferResponse,
  ListOperationsCustomersQueryParams,
  ListOperationsCustomersResponse,
  ListOperationsAuditEventsQueryParams,
  ListOperationsAuditEventsResponse,
  ListOperationsReconciliationExceptionsQueryParams,
  ListOperationsReconciliationExceptionsResponse,
  ResolveOperationsReconciliationExceptionBody,
  ResolveOperationsReconciliationExceptionHeader,
  ResolveOperationsReconciliationExceptionParams,
  ResolveOperationsReconciliationExceptionResponse,
  RecordCustomerAcquisitionEventBody,
  RecordCustomerAcquisitionEventHeader,
  RecordCustomerAcquisitionEventResponse,
  ListOperationsTransfersQueryParams,
  ListOperationsTransfersResponse,
  AddOperationsCaseNoteBody,
  AddOperationsCaseNoteHeader,
  AddOperationsCaseNoteParams,
  AddOperationsCaseNoteResponse,
  CreateOperationsCaseBody,
  CreateOperationsCaseHeader,
  CreateOperationsCaseResponse,
  GetOperationsCaseParams,
  GetOperationsCaseResponse,
  ListOperationsCasesQueryParams,
  ListOperationsCasesResponse,
  UpdateOperationsCaseBody,
  UpdateOperationsCaseHeader,
  UpdateOperationsCaseParams,
  UpdateOperationsCaseResponse,
} from "@workspace/api-zod";
import { DomainError, parseMinor } from "@workspace/remittance";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  CustomerIdentityCaseNotFoundError,
  CustomerWalletNotFoundError,
  WorkforceAuthenticationError,
  CustomerOnboardingAccessRestrictedError,
  CustomerOnboardingNotFoundError,
  CustomerAcquisitionSessionNotFoundError,
  type PostgresWorkforceAuthStore,
  type WorkforceIdentity,
  type WorkforceRole,
} from "@workspace/db";
import type { ApiRuntimeConfig, CustomerAuthConfig } from "../../config";
import {
  DEMO_ACTOR,
  DemoRuntime,
  type PublicReconciliationDemoScenario,
} from "../../domain/demo-runtime";
import { IdentityProviderUnavailableError } from "../../domain/customer-identity";
import { WalletProviderUnavailableError } from "../../domain/customer-wallet";
import { serializeQuote, serializeTransfer } from "../../domain/serializers";
import {
  BackendUnavailableError,
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  RequestValidationError,
} from "../../lib/problem";
import { createAuth0AccessTokenMiddleware } from "../../lib/customer-access-token";
import {
  CustomerAccessRestrictedError,
  CustomerAuthenticationRequiredError,
  CustomerIdentityUnboundError,
} from "../../lib/customer-auth-errors";

const WORKFORCE_SESSION_COOKIE = "samra_ops_session";
const WORKFORCE_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1_000;
const ACQUISITION_SESSION_COOKIE = "samra_acquisition_session";
const ACQUISITION_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000;

type OperationsPermission =
  | "summary:read"
  | "funnel:read"
  | "customers:read"
  | "transfers:read"
  | "transfers:manage"
  | "reconciliation:read"
  | "reconciliation:resolve"
  | "audit:read"
  | "cases:read"
  | "cases:work"
  | "cases:manage";

const ROLE_PERMISSIONS: Readonly<
  Record<WorkforceRole, ReadonlySet<OperationsPermission>>
> = Object.freeze({
  support_readonly: new Set<OperationsPermission>([
    "summary:read",
    "customers:read",
    "transfers:read",
    "cases:read",
    "cases:work",
  ]),
  operations_analyst: new Set<OperationsPermission>([
    "summary:read",
    "funnel:read",
    "customers:read",
    "transfers:read",
    "transfers:manage",
    "reconciliation:read",
    "cases:read",
    "cases:work",
    "cases:manage",
  ]),
  compliance_readonly: new Set<OperationsPermission>([
    "summary:read",
    "transfers:read",
    "reconciliation:read",
    "audit:read",
  ]),
  administrator: new Set<OperationsPermission>([
    "summary:read",
    "funnel:read",
    "customers:read",
    "transfers:read",
    "transfers:manage",
    "reconciliation:read",
    "reconciliation:resolve",
    "audit:read",
    "cases:read",
    "cases:work",
    "cases:manage",
  ]),
});

const DEMO_OPERATIONS_STATUS_WHITELIST = Object.freeze([
  "created",
  "funds_reserved",
  "submitted",
  "in_transit",
  "payout_pending",
  "completed",
  "failed",
  "refund_pending",
  "refunded",
  "reversed",
  "cancelled",
]);

type SafeParseSchema<T> = Readonly<{
  safeParse(value: unknown):
    | Readonly<{ success: true; data: T }>
    | Readonly<{
        success: false;
        error: Readonly<{
          issues: readonly Readonly<{
            path: readonly PropertyKey[];
            message: string;
          }>[];
        }>;
      }>;
}>;

export function createV1Router(
  runtime: DemoRuntime,
  config: ApiRuntimeConfig,
  dependencies: Readonly<{
    customerAccessTokenMiddleware?: RequestHandler;
  }> = {},
): Router {
  const router = Router();

  if (runtime.customerFunnelStore) {
    const funnel = runtime.customerFunnelStore;
    router.post(
      "/acquisition/events",
      asyncRoute(async (req, res) => {
        const header = parseSchema(RecordCustomerAcquisitionEventHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        const body = parseSchema(RecordCustomerAcquisitionEventBody, req.body);
        const receipt = await funnel.recordEvent({
          ...body,
          sessionId: body.sessionId ?? customerAcquisitionSessionToken(req),
          idempotencyKey: header["Idempotency-Key"],
        });
        setCustomerAcquisitionSessionCookie(req, res, receipt.sessionId);
        res
          .status(receipt.recorded ? 201 : 200)
          .json(RecordCustomerAcquisitionEventResponse.parse(receipt));
      }),
    );
  }

  if (config.customerAuth.mode === "auth0") {
    const auth0Config = config.customerAuth;
    if (runtime.customerAuthenticationMode !== "auth0") {
      throw new Error(
        "Auth0 customer mode requires an Auth0-backed customer actor resolver.",
      );
    }
    router.use(
      customerRouteAuthenticationBoundary(
        dependencies.customerAccessTokenMiddleware ??
          createAuth0AccessTokenMiddleware(auth0Config),
      ),
    );
    if (!runtime.customerOnboardingStore) {
      throw new Error(
        "Auth0 customer mode requires a durable customer onboarding store.",
      );
    }
    const onboarding = runtime.customerOnboardingStore;
    if (!runtime.customerIdentityVerificationService) {
      throw new Error(
        "Auth0 customer mode requires a durable identity verification service.",
      );
    }
    const identityVerification = runtime.customerIdentityVerificationService;
    if (!runtime.customerWalletProvisioningService) {
      throw new Error(
        "Auth0 customer mode requires a durable wallet provisioning service.",
      );
    }
    const walletProvisioning = runtime.customerWalletProvisioningService;
    const funnel = runtime.customerFunnelStore;

    router.post(
      "/onboarding",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        const header = parseSchema(StartCustomerOnboardingHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        try {
          const result = await onboarding.startAuth0Onboarding({
            ...identity,
            idempotencyKey: header["Idempotency-Key"],
          });
          res
            .status(result.created ? 201 : 200)
            .json(StartCustomerOnboardingResponse.parse(result.snapshot));
        } catch (error) {
          throw translateOnboardingAccessError(error);
        }
      }),
    );

    router.get(
      "/onboarding",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        try {
          res.json(
            GetCustomerOnboardingResponse.parse(
              await onboarding.getAuth0Onboarding(identity),
            ),
          );
        } catch (error) {
          throw translateOnboardingAccessError(error);
        }
      }),
    );

    router.post(
      "/onboarding/consents",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        const header = parseSchema(SubmitCustomerConsentBundleHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        const body = parseSchema(SubmitCustomerConsentBundleBody, req.body);
        try {
          const result = await onboarding.recordAuth0ConsentBundle({
            ...identity,
            idempotencyKey: header["Idempotency-Key"],
            ...body,
          });
          res.json(SubmitCustomerConsentBundleResponse.parse(result.snapshot));
        } catch (error) {
          throw translateOnboardingAccessError(error);
        }
      }),
    );

    router.post(
      "/onboarding/identity",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        const header = parseSchema(StartCustomerIdentityVerificationHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        try {
          const result =
            await identityVerification.startAuth0IdentityVerification({
              ...identity,
              idempotencyKey: header["Idempotency-Key"],
            });
          res
            .status(result.created ? 201 : 200)
            .json(
              StartCustomerIdentityVerificationResponse.parse(result.snapshot),
            );
        } catch (error) {
          throw translateIdentityVerificationError(error);
        }
      }),
    );

    router.get(
      "/onboarding/identity",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        try {
          res.json(
            GetCustomerIdentityCaseResponse.parse(
              await identityVerification.getAuth0IdentityCase(identity),
            ),
          );
        } catch (error) {
          throw translateIdentityVerificationError(error);
        }
      }),
    );

    router.post(
      "/onboarding/wallet",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        const header = parseSchema(StartCustomerWalletProvisioningHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        const body = parseSchema(StartCustomerWalletProvisioningBody, req.body);
        try {
          const result = await walletProvisioning.startAuth0Wallet({
            ...identity,
            idempotencyKey: header["Idempotency-Key"],
            consent: body,
          });
          res
            .status(result.created ? 201 : 200)
            .json(
              StartCustomerWalletProvisioningResponse.parse(result.snapshot),
            );
        } catch (error) {
          throw translateWalletProvisioningError(error);
        }
      }),
    );

    router.get(
      "/onboarding/wallet",
      asyncRoute(async (req, res) => {
        const identity = verifiedAuth0Identity(req, auth0Config);
        try {
          res.json(
            GetCustomerWalletResponse.parse(
              await walletProvisioning.getAuth0Wallet(identity),
            ),
          );
        } catch (error) {
          throw translateWalletProvisioningError(error);
        }
      }),
    );

    if (funnel) {
      router.post(
        "/acquisition/bind",
        asyncRoute(async (req, res) => {
          const identity = verifiedAuth0Identity(req, auth0Config);
          const header = parseSchema(BindCustomerAcquisitionSessionHeader, {
            "Idempotency-Key": req.header("Idempotency-Key"),
          });
          const body = parseSchema(
            BindCustomerAcquisitionSessionBody,
            req.body ?? {},
          );
          const sessionId =
            body.sessionId ?? customerAcquisitionSessionToken(req);
          if (!sessionId) throw new CustomerAcquisitionSessionNotFoundError();
          try {
            const receipt = await funnel.bindAuth0Session({
              ...identity,
              sessionId,
              idempotencyKey: header["Idempotency-Key"],
            });
            res
              .status(receipt.linked ? 201 : 200)
              .json(BindCustomerAcquisitionSessionResponse.parse(receipt));
          } catch (error) {
            throw translateAcquisitionError(error);
          }
        }),
      );
    }
  }

  router.get(
    "/me",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      res.json(
        GetCurrentCustomerResponse.parse({
          id: actor.id,
          displayName: actor.displayName,
          synthetic: true,
          backendMode: "demo",
        }),
      );
    }),
  );

  router.get(
    "/accounts",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      res.json(
        ListAccountsResponse.parse(await runtime.accountResponses(actor.id)),
      );
    }),
  );

  router.get(
    "/activity",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const query = parseSchema(ListActivityQueryParams, req.query);
      if (query.accountId !== undefined) {
        runtime.assertAccount(actor.id, query.accountId);
      }
      const items = await runtime.activity(actor.id);
      const page = paginate(items, query.cursor, query.limit);
      res.json(ListActivityResponse.parse(page));
    }),
  );

  router.get(
    "/beneficiaries",
    asyncRoute(async (req, res) => {
      const actor = await runtime.beneficiaryActorResolver.resolve(req);
      res.json(
        ListBeneficiariesResponse.parse(
          await runtime.listBeneficiaries(actor.id),
        ),
      );
    }),
  );

  router.post(
    "/beneficiaries",
    asyncRoute(async (req, res) => {
      const actor = await runtime.beneficiaryActorResolver.resolve(req);
      assertRailSpecificDeliveryInput(req.body);
      const body = parseSchema(CreateBeneficiaryBody, req.body);
      res
        .status(201)
        .json(
          CreateBeneficiaryResponse.parse(
            await runtime.createBeneficiary(actor.id, body),
          ),
        );
    }),
  );

  router.get(
    "/beneficiaries/:beneficiaryId",
    asyncRoute(async (req, res) => {
      const actor = await runtime.beneficiaryActorResolver.resolve(req);
      const params = parseSchema(GetBeneficiaryParams, req.params);
      res.json(
        GetBeneficiaryResponse.parse(
          await runtime.getBeneficiary(actor.id, params.beneficiaryId),
        ),
      );
    }),
  );

  router.patch(
    "/beneficiaries/:beneficiaryId",
    asyncRoute(async (req, res) => {
      const actor = await runtime.beneficiaryActorResolver.resolve(req);
      const params = parseSchema(UpdateBeneficiaryParams, req.params);
      assertRailSpecificDeliveryInput(req.body);
      const body = parseSchema(UpdateBeneficiaryBody, req.body);
      if (
        body.displayName === undefined &&
        body.city === undefined &&
        body.deliveryDetails === undefined
      ) {
        throw new RequestValidationError(
          "At least one beneficiary field must be provided.",
          { request: ["Request body must contain at least one field."] },
        );
      }
      res.json(
        UpdateBeneficiaryResponse.parse(
          await runtime.updateBeneficiary(actor.id, params.beneficiaryId, body),
        ),
      );
    }),
  );

  router.delete(
    "/beneficiaries/:beneficiaryId",
    asyncRoute(async (req, res) => {
      const actor = await runtime.beneficiaryActorResolver.resolve(req);
      const params = parseSchema(DeleteBeneficiaryParams, req.params);
      await runtime.deleteBeneficiary(actor.id, params.beneficiaryId);
      res.status(204).end();
    }),
  );

  router.get(
    "/remittance/options",
    asyncRoute(async (req, res) => {
      await runtime.actorResolver.resolve(req);
      res.json(
        GetRemittanceOptionsResponse.parse({
          sourceCurrency: "USD",
          destinationCurrency: "ETB",
          fundingMethods: ["samra_balance"],
          deliveryMethods: ["bank", "wallet"],
        }),
      );
    }),
  );

  router.post(
    "/remittance/quotes",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const body = parseSchema(CreateRemittanceQuoteBody, req.body);
      runtime.assertAccount(actor.id, body.sourceAccountId);
      await runtime.assertBeneficiaryRail(
        actor.id,
        body.beneficiaryId,
        body.deliveryMethod,
      );
      const quote = await runtime.service.createQuote({
        actorId: actor.id,
        sourceAccountId: body.sourceAccountId,
        beneficiaryId: body.beneficiaryId,
        sourceAmountMinor: parseMinor(
          body.sendAmount.minorUnits,
          "sendAmount.minorUnits",
        ),
        fundingMethod: body.fundingMethod,
        deliveryMethod: body.deliveryMethod,
      });
      res
        .status(201)
        .json(
          CreateRemittanceQuoteResponse.parse(
            serializeQuote(quote, await runtime.service.quoteStatus(quote.id)),
          ),
        );
    }),
  );

  router.get(
    "/remittance/transfers",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const query = parseSchema(ListRemittanceTransfersQueryParams, req.query);
      const transfers = await runtime.service.listTransfers(actor.id);
      const serialized = await Promise.all(
        transfers.map(async (transfer) =>
          serializeTransfer(
            transfer,
            await runtime.recipientDisplay(
              actor.id,
              transfer.quote.beneficiaryId,
            ),
          ),
        ),
      );
      res.json(
        ListRemittanceTransfersResponse.parse(
          paginate(serialized, query.cursor, query.limit),
        ),
      );
    }),
  );

  router.post(
    "/remittance/transfers",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const body = parseSchema(CreateRemittanceTransferBody, req.body);
      const header = parseSchema(CreateRemittanceTransferHeader, {
        "Idempotency-Key": req.header("Idempotency-Key"),
      });
      const transfer = await runtime.service.createTransfer({
        actorId: actor.id,
        quoteId: body.quoteId,
        idempotencyKey: header["Idempotency-Key"],
      });
      res
        .status(201)
        .json(
          CreateRemittanceTransferResponse.parse(
            serializeTransfer(
              transfer,
              await runtime.recipientDisplay(
                actor.id,
                transfer.quote.beneficiaryId,
              ),
            ),
          ),
        );
    }),
  );

  router.get(
    "/remittance/transfers/:transferId",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const params = parseSchema(GetRemittanceTransferParams, req.params);
      const transfer = await runtime.service.getTransfer(
        actor.id,
        params.transferId,
      );
      res.json(
        GetRemittanceTransferResponse.parse(
          serializeTransfer(
            transfer,
            await runtime.recipientDisplay(
              actor.id,
              transfer.quote.beneficiaryId,
            ),
          ),
        ),
      );
    }),
  );

  router.post(
    "/remittance/transfers/:transferId/cancel",
    asyncRoute(async (req, res) => {
      const actor = await runtime.actorResolver.resolve(req);
      const params = parseSchema(CancelRemittanceTransferParams, req.params);
      const header = parseSchema(CancelRemittanceTransferHeader, {
        "Idempotency-Key": req.header("Idempotency-Key"),
      });
      const transfer = await runtime.service.cancelTransfer({
        actorId: actor.id,
        transferId: params.transferId,
        idempotencyKey: header["Idempotency-Key"],
      });
      res.json(
        CancelRemittanceTransferResponse.parse(
          serializeTransfer(
            transfer,
            await runtime.recipientDisplay(
              actor.id,
              transfer.quote.beneficiaryId,
            ),
          ),
        ),
      );
    }),
  );

  if (config.devControlsEnabled) {
    if (runtime.customerIdentityVerificationService) {
      router.post(
        "/dev/onboarding/identity/:identityCaseId/decision",
        asyncRoute(async (req, res) => {
          const params = parseSchema(
            AdvanceDemoCustomerIdentityParams,
            req.params,
          );
          const header = parseSchema(AdvanceDemoCustomerIdentityHeader, {
            "Idempotency-Key": req.header("Idempotency-Key"),
          });
          const body = parseSchema(AdvanceDemoCustomerIdentityBody, req.body);
          try {
            const result =
              await runtime.customerIdentityVerificationService!.simulateProviderDecision(
                {
                  identityCaseId: params.identityCaseId,
                  decision: body.decision,
                  idempotencyKey: header["Idempotency-Key"],
                },
              );
            res.json(
              AdvanceDemoCustomerIdentityResponse.parse({
                identityCase: result.snapshot,
                replayed: result.replayed,
                disposition: result.disposition,
              }),
            );
          } catch (error) {
            throw translateIdentityVerificationError(error);
          }
        }),
      );
    }

    router.post(
      "/dev/remittance/transfers/:transferId/scenario",
      asyncRoute(async (req, res) => {
        const actor = DEMO_ACTOR;
        const params = parseSchema(
          SelectDemoTransferScenarioParams,
          req.params,
        );
        const body = parseSchema(SelectDemoTransferScenarioBody, req.body);
        const transfer = await runtime.service.selectAndAdvanceFakeScenario(
          actor.id,
          params.transferId,
          runtime.toDomainScenario(body.scenario),
        );
        res.json(
          SelectDemoTransferScenarioResponse.parse(
            serializeTransfer(
              transfer,
              await runtime.recipientDisplay(
                actor.id,
                transfer.quote.beneficiaryId,
              ),
            ),
          ),
        );
      }),
    );

    router.post(
      "/dev/reconciliation/runs",
      asyncRoute(async (req, res) => {
        const actor = DEMO_ACTOR;
        const body = parseSchema(RunDemoReconciliationBody, req.body ?? {});
        const run = await runtime.runReconciliation(
          actor.id,
          body.scenario as PublicReconciliationDemoScenario | undefined,
        );
        res.status(201).json(RunDemoReconciliationResponse.parse(run));
      }),
    );

    router.get(
      "/dev/reconciliation/runs/:runId",
      asyncRoute(async (req, res) => {
        const params = parseSchema(GetDemoReconciliationRunParams, req.params);
        res.json(
          GetDemoReconciliationRunResponse.parse(
            await runtime.getReconciliation(params.runId),
          ),
        );
      }),
    );
  }

  if (
    config.devControlsEnabled &&
    config.internalOperationsEnabled &&
    runtime.operationsStore &&
    runtime.workforceAuthStore
  ) {
    const operations = runtime.operationsStore;
    const workforce = runtime.workforceAuthStore;

    router.post(
      "/internal/auth/session",
      asyncRoute(async (req, res) => {
        const credentials = parseSchema(CreateWorkforceSessionBody, req.body);
        try {
          const session = await workforce.authenticate(
            credentials.loginName,
            credentials.password,
          );
          setWorkforceSessionCookie(req, res, session.token);
          await operations.recordAudit({
            eventKey: `operator:${session.identity.externalRef}:workforce_login_succeeded:${randomUUID()}`,
            actorType: "operator",
            actorId: session.identity.externalRef,
            action: "workforce_login_succeeded",
            entityType: "workforce_session",
            entityId: session.identity.sessionId,
            metadata: { role: session.identity.role, synthetic: true },
          });
          res
            .status(201)
            .json(
              CreateWorkforceSessionResponse.parse(
                serializeWorkforceIdentity(session.identity),
              ),
            );
        } catch (error) {
          if (!(error instanceof WorkforceAuthenticationError)) throw error;
          await operations.recordAudit({
            eventKey: `operator:unknown:workforce_login_failed:${randomUUID()}`,
            actorType: "operator",
            action: "workforce_login_failed",
            entityType: "workforce_login",
            entityId: hashAuditIdentifier(credentials.loginName),
            metadata: { synthetic: true },
          });
          throw new AuthenticationRequiredError(
            "The workforce credentials are invalid.",
          );
        }
      }),
    );

    router.get(
      "/internal/auth/session",
      asyncRoute(async (req, res) => {
        const identity = await resolveWorkforceOperator(req, workforce);
        res.json(
          GetWorkforceSessionResponse.parse(
            serializeWorkforceIdentity(identity),
          ),
        );
      }),
    );

    router.delete(
      "/internal/auth/session",
      asyncRoute(async (req, res) => {
        const identity = await resolveWorkforceOperator(req, workforce);
        const token = workforceSessionToken(req)!;
        await workforce.revokeSession(token);
        clearWorkforceSessionCookie(req, res);
        await operations.recordAudit({
          eventKey: `operator:${identity.externalRef}:workforce_logout:${randomUUID()}`,
          actorType: "operator",
          actorId: identity.externalRef,
          action: "workforce_logout",
          entityType: "workforce_session",
          entityId: identity.sessionId,
          metadata: { role: identity.role, synthetic: true },
        });
        res.status(204).end();
      }),
    );

    router.get(
      "/internal/operations/summary",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "summary:read",
        );
        const summary = await operations.operationsSummary();
        await auditOperatorRead(
          operations,
          operator,
          "operations_summary",
          "all",
        );
        res.json(GetOperationsSummaryResponse.parse(summary));
      }),
    );

    if (runtime.customerFunnelStore) {
      const funnel = runtime.customerFunnelStore;
      router.get(
        "/internal/operations/customer-funnel",
        asyncRoute(async (req, res) => {
          const operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            "funnel:read",
          );
          const query = parseSchema(
            GetOperationsCustomerFunnelQueryParams,
            req.query,
          );
          const now = new Date();
          const to = query.cohortTo ? new Date(query.cohortTo) : now;
          const from = query.cohortFrom
            ? new Date(query.cohortFrom)
            : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
          const report = await funnel.funnelReport({
            from,
            to,
            now,
          });
          await auditOperatorRead(
            operations,
            operator,
            "operations_customer_funnel",
            `${report.cohortFrom}:${report.cohortTo}`,
          );
          res.json(GetOperationsCustomerFunnelResponse.parse(report));
        }),
      );
    }

    router.get(
      "/internal/operations/customers",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "customers:read",
        );
        const query = parseSchema(
          ListOperationsCustomersQueryParams,
          normalizeOperationsQueryParams(req.query),
        );
        const customers = await operations.listOperationsCustomers(query);
        await auditOperatorRead(
          operations,
          operator,
          "operations_customer_search",
          query.search ?? "all",
        );
        res.json(
          ListOperationsCustomersResponse.parse(
            customers.map((customer) => ({
              id: customer.id,
              displayName: customer.displayName,
              countryCode: customer.countryCode,
              status: customer.status,
              accountCount: customer.accountCount,
              beneficiaryCount: customer.beneficiaryCount,
              transferCount: customer.transferCount,
              completedTransferCount: customer.completedTransferCount,
              totalSent: {
                currency: customer.sourceCurrency,
                minorUnits: customer.totalSentMinor,
              },
              lastTransferAt: customer.lastTransferAt,
              createdAt: customer.createdAt,
            })),
          ),
        );
      }),
    );

    router.get(
      "/internal/operations/transfers",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "transfers:read",
        );
        const query = parseSchema(
          ListOperationsTransfersQueryParams,
          normalizeOperationsQueryParams(req.query),
        );
        if (
          query.status !== undefined &&
          !DEMO_OPERATIONS_STATUS_WHITELIST.includes(query.status)
        ) {
          throw new RequestValidationError(
            "The transfer status filter is not valid.",
            {
              status: [
                `Expected one of: ${DEMO_OPERATIONS_STATUS_WHITELIST.join(", ")}`,
              ],
            },
          );
        }
        const transfers = (await operations.listOperationsTransfers(query)).map(
          (transfer) =>
            redactOperationsTransfer(
              serializeOperationsTransfer(transfer),
              operator.role,
            ),
        );
        await auditOperatorRead(
          operations,
          operator,
          "operations_transfer_search",
          query.search ?? query.status ?? "all",
        );
        res.json(ListOperationsTransfersResponse.parse(transfers));
      }),
    );

    router.get(
      "/internal/operations/transfers/:transferId",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "transfers:read",
        );
        const params = parseSchema(GetOperationsTransferParams, req.params);
        const detail = await operations.getOperationsTransfer(
          params.transferId,
        );
        if (!detail) {
          throw new DomainError("NOT_FOUND", "The transfer was not found.", {
            transferId: params.transferId,
          });
        }
        await auditOperatorRead(
          operations,
          operator,
          "operations_transfer_detail",
          params.transferId,
        );
        res.json(
          GetOperationsTransferResponse.parse(
            serializeOperationsTransferDetail(detail, operator.role),
          ),
        );
      }),
    );

    router.post(
      "/internal/operations/transfers/:transferId/cancel",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "transfers:manage",
        );
        const params = parseSchema(CancelOperationsTransferParams, req.params);
        const header = parseSchema(CancelOperationsTransferHeader, {
          "Idempotency-Key": req.header("Idempotency-Key"),
        });
        const body = parseSchema(CancelOperationsTransferBody, req.body);
        const before = await operations.getOperationsTransfer(
          params.transferId,
        );
        if (!before) {
          throw new DomainError("NOT_FOUND", "The transfer was not found.", {
            transferId: params.transferId,
          });
        }
        const beforeTransfer = before.transfer as { customerId: string };
        await runtime.service.cancelTransfer({
          actorId: beforeTransfer.customerId,
          transferId: params.transferId,
          idempotencyKey: `operator:${operator.externalRef}:${header["Idempotency-Key"]}`,
          auditActor: {
            actorType: "operator",
            actorId: operator.externalRef,
          },
          auditReason: body.reason,
        });
        await operations.recordAudit({
          eventKey: `operator:${operator.externalRef}:transfer_cancelled:${params.transferId}:${header["Idempotency-Key"]}`,
          actorType: "operator",
          actorId: operator.externalRef,
          action: "operations_transfer_cancelled",
          entityType: "remittance_transfer",
          entityId: params.transferId,
          correlationId: params.transferId,
          metadata: {
            reason: body.reason,
            role: operator.role,
            synthetic: true,
          },
        });
        const after = await operations.getOperationsTransfer(params.transferId);
        if (!after) {
          throw new DomainError("NOT_FOUND", "The transfer was not found.", {
            transferId: params.transferId,
          });
        }
        res.json(
          CancelOperationsTransferResponse.parse(
            serializeOperationsTransferDetail(after, operator.role),
          ),
        );
      }),
    );

    router.get(
      "/internal/operations/reconciliation/exceptions",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "reconciliation:read",
        );
        const query = parseSchema(
          ListOperationsReconciliationExceptionsQueryParams,
          req.query,
        );
        const exceptions = await operations.listReconciliationExceptions(
          query.limit,
        );
        await auditOperatorRead(
          operations,
          operator,
          "operations_reconciliation_exceptions",
          "all",
        );
        res.json(
          ListOperationsReconciliationExceptionsResponse.parse(exceptions),
        );
      }),
    );

    router.post(
      "/internal/operations/reconciliation/exceptions/:exceptionId/resolve",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "reconciliation:resolve",
        );
        const params = parseSchema(
          ResolveOperationsReconciliationExceptionParams,
          req.params,
        );
        const header = parseSchema(
          ResolveOperationsReconciliationExceptionHeader,
          { "Idempotency-Key": req.header("Idempotency-Key") },
        );
        const body = parseSchema(
          ResolveOperationsReconciliationExceptionBody,
          req.body,
        );
        res.json(
          ResolveOperationsReconciliationExceptionResponse.parse(
            await operations.resolveReconciliationException({
              exceptionId: params.exceptionId,
              operatorId: operator.externalRef,
              reason: body.reason,
              idempotencyKey: header["Idempotency-Key"],
            }),
          ),
        );
      }),
    );

    router.get(
      "/internal/operations/audit-events",
      asyncRoute(async (req, res) => {
        const operator = await requireOperationsPermission(
          req,
          workforce,
          operations,
          "audit:read",
        );
        const query = parseSchema(
          ListOperationsAuditEventsQueryParams,
          req.query,
        );
        await auditOperatorRead(
          operations,
          operator,
          "operations_audit_events",
          query.entityId ?? query.actorId ?? "all",
        );
        res.json(
          ListOperationsAuditEventsResponse.parse(
            await operations.listAuditEvents(query),
          ),
        );
      }),
    );

    if (runtime.operationsCaseStore) {
      const cases = runtime.operationsCaseStore;

      router.get(
        "/internal/operations/cases",
        asyncRoute(async (req, res) => {
          const operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            "cases:read",
          );
          const query = parseSchema(ListOperationsCasesQueryParams, req.query);
          const records = await cases.listCases({
            ...query,
            assignedTo: query.assignedTo?.trim() || undefined,
            search: query.search?.trim() || undefined,
          });
          await auditOperatorRead(
            operations,
            operator,
            "operations_case_search",
            query.search ?? query.status ?? "all",
          );
          res.json(ListOperationsCasesResponse.parse(records));
        }),
      );

      router.post(
        "/internal/operations/cases",
        asyncRoute(async (req, res) => {
          let operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            "cases:work",
          );
          const header = parseSchema(CreateOperationsCaseHeader, {
            "Idempotency-Key": req.header("Idempotency-Key"),
          });
          const body = parseSchema(CreateOperationsCaseBody, req.body);
          if (
            body.priority !== "normal" ||
            body.assignedTo !== undefined ||
            body.dueAt !== undefined
          ) {
            operator = await requireOperationsPermission(
              req,
              workforce,
              operations,
              "cases:manage",
            );
          }
          const detail = await cases.createCase({
            operatorUserId: operator.id,
            operatorRef: operator.externalRef,
            idempotencyKey: header["Idempotency-Key"],
            ...body,
            dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
          });
          res.status(201).json(CreateOperationsCaseResponse.parse(detail));
        }),
      );

      router.get(
        "/internal/operations/cases/:caseId",
        asyncRoute(async (req, res) => {
          const operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            "cases:read",
          );
          const params = parseSchema(GetOperationsCaseParams, req.params);
          const detail = await cases.getCase(params.caseId);
          await auditOperatorRead(
            operations,
            operator,
            "operations_case_detail",
            params.caseId,
          );
          res.json(GetOperationsCaseResponse.parse(detail));
        }),
      );

      router.patch(
        "/internal/operations/cases/:caseId",
        asyncRoute(async (req, res) => {
          const params = parseSchema(UpdateOperationsCaseParams, req.params);
          const header = parseSchema(UpdateOperationsCaseHeader, {
            "Idempotency-Key": req.header("Idempotency-Key"),
          });
          const body = parseSchema(UpdateOperationsCaseBody, req.body);
          const permission: OperationsPermission =
            body.priority !== undefined ||
            body.assignedTo !== undefined ||
            body.dueAt !== undefined
              ? "cases:manage"
              : "cases:work";
          const operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            permission,
          );
          const detail = await cases.updateCase({
            operatorUserId: operator.id,
            operatorRef: operator.externalRef,
            idempotencyKey: header["Idempotency-Key"],
            caseRef: params.caseId,
            ...body,
            dueAt:
              body.dueAt === undefined
                ? undefined
                : body.dueAt === null
                  ? null
                  : new Date(body.dueAt),
          });
          res.json(UpdateOperationsCaseResponse.parse(detail));
        }),
      );

      router.post(
        "/internal/operations/cases/:caseId/notes",
        asyncRoute(async (req, res) => {
          const operator = await requireOperationsPermission(
            req,
            workforce,
            operations,
            "cases:work",
          );
          const params = parseSchema(AddOperationsCaseNoteParams, req.params);
          const header = parseSchema(AddOperationsCaseNoteHeader, {
            "Idempotency-Key": req.header("Idempotency-Key"),
          });
          const body = parseSchema(AddOperationsCaseNoteBody, req.body);
          const detail = await cases.addNote({
            operatorUserId: operator.id,
            operatorRef: operator.externalRef,
            idempotencyKey: header["Idempotency-Key"],
            caseRef: params.caseId,
            body: body.body,
          });
          res.json(AddOperationsCaseNoteResponse.parse(detail));
        }),
      );
    }
  }

  return router;
}

function customerRouteAuthenticationBoundary(
  authenticate: RequestHandler,
): RequestHandler {
  return (request, response, next) => {
    const originalPath = request.originalUrl.split("?", 1)[0] ?? "/";
    const v1Prefix = "/api/v1";
    const path = originalPath.startsWith(v1Prefix)
      ? originalPath.slice(v1Prefix.length) || "/"
      : originalPath;
    if (
      path === "/acquisition/events" ||
      path === "/internal" ||
      path.startsWith("/internal/") ||
      path === "/dev" ||
      path.startsWith("/dev/")
    ) {
      next();
      return;
    }
    authenticate(request, response, next);
  };
}

function verifiedAuth0Identity(
  request: Parameters<RequestHandler>[0],
  config: Extract<CustomerAuthConfig, { mode: "auth0" }>,
): Readonly<{ issuer: string; subject: string }> {
  const issuer = request.auth?.payload.iss;
  const subject = request.auth?.payload.sub;
  if (
    issuer !== config.issuerBaseUrl ||
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 255 ||
    subject !== subject.trim() ||
    /[\u0000-\u001f\u007f]/u.test(subject)
  ) {
    throw new CustomerAuthenticationRequiredError();
  }
  return Object.freeze({ issuer, subject });
}

function translateOnboardingAccessError(error: unknown): unknown {
  if (error instanceof CustomerOnboardingNotFoundError) {
    return new CustomerIdentityUnboundError();
  }
  if (error instanceof CustomerOnboardingAccessRestrictedError) {
    return new CustomerAccessRestrictedError();
  }
  return error;
}

function translateIdentityVerificationError(error: unknown): unknown {
  const translated = translateOnboardingAccessError(error);
  if (translated !== error) return translated;
  if (error instanceof CustomerIdentityCaseNotFoundError) {
    return new DomainError("NOT_FOUND", error.message);
  }
  if (error instanceof IdentityProviderUnavailableError) {
    return new BackendUnavailableError(error.message);
  }
  return error;
}

function translateWalletProvisioningError(error: unknown): unknown {
  const translated = translateOnboardingAccessError(error);
  if (translated !== error) return translated;
  if (error instanceof CustomerWalletNotFoundError) {
    return new DomainError("NOT_FOUND", error.message);
  }
  if (error instanceof WalletProviderUnavailableError) {
    return new BackendUnavailableError(error.message);
  }
  return error;
}

function translateAcquisitionError(error: unknown): unknown {
  const translated = translateOnboardingAccessError(error);
  if (translated !== error) return translated;
  if (error instanceof CustomerAcquisitionSessionNotFoundError) {
    return new DomainError("NOT_FOUND", error.message);
  }
  return error;
}

async function resolveWorkforceOperator(
  request: Parameters<RequestHandler>[0],
  workforce: PostgresWorkforceAuthStore,
): Promise<WorkforceIdentity> {
  const token = workforceSessionToken(request);
  const identity = token ? await workforce.resolveSession(token) : undefined;
  if (!identity) throw new AuthenticationRequiredError();
  return identity;
}

async function requireOperationsPermission(
  request: Parameters<RequestHandler>[0],
  workforce: PostgresWorkforceAuthStore,
  operations: NonNullable<DemoRuntime["operationsStore"]>,
  permission: OperationsPermission,
): Promise<WorkforceIdentity> {
  const identity = await resolveWorkforceOperator(request, workforce);
  if (!ROLE_PERMISSIONS[identity.role].has(permission)) {
    await operations.recordAudit({
      eventKey: `operator:${identity.externalRef}:workforce_access_denied:${randomUUID()}`,
      actorType: "operator",
      actorId: identity.externalRef,
      action: "workforce_access_denied",
      entityType: "operations_permission",
      entityId: permission,
      metadata: {
        role: identity.role,
        sessionId: identity.sessionId,
        synthetic: true,
      },
    });
    throw new AuthorizationDeniedError();
  }
  return identity;
}

function normalizeOperationsQueryParams(
  query: Readonly<{
    status?: unknown;
    search?: unknown;
    limit?: unknown;
  }>,
) {
  const statusValue =
    typeof query.status === "string"
      ? query.status
      : query.status === undefined
        ? undefined
        : String(query.status);
  const searchValue =
    typeof query.search === "string"
      ? query.search
      : query.search === undefined
        ? undefined
        : String(query.search);
  return {
    status:
      statusValue === undefined
        ? undefined
        : statusValue.trim().toLowerCase() || undefined,
    search:
      searchValue === undefined ? undefined : searchValue.trim() || undefined,
    limit: query.limit,
  };
}

async function auditOperatorRead(
  operations: NonNullable<DemoRuntime["operationsStore"]>,
  operator: WorkforceIdentity,
  action: string,
  entityId: string,
): Promise<void> {
  await operations.recordAudit({
    eventKey: `operator:${operator.externalRef}:${action}:${randomUUID()}`,
    actorType: "operator",
    actorId: operator.externalRef,
    action,
    entityType: "operations_view",
    entityId,
    correlationId: entityId === "all" ? undefined : entityId,
    metadata: {
      role: operator.role,
      sessionId: operator.sessionId,
      synthetic: true,
    },
  });
}

function workforceSessionToken(
  request: Parameters<RequestHandler>[0],
): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[WORKFORCE_SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function customerAcquisitionSessionToken(
  request: Parameters<RequestHandler>[0],
): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[ACQUISITION_SESSION_COOKIE];
  return typeof value === "string" && /^acq_[0-9a-f]{32}$/.test(value)
    ? value
    : undefined;
}

function setCustomerAcquisitionSessionCookie(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  sessionId: string,
): void {
  response.cookie(ACQUISITION_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/api/v1",
    maxAge: ACQUISITION_COOKIE_MAX_AGE_MS,
  });
}

function setWorkforceSessionCookie(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  token: string,
): void {
  response.cookie(WORKFORCE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "strict",
    path: "/api/v1/internal",
    maxAge: WORKFORCE_COOKIE_MAX_AGE_MS,
  });
}

function clearWorkforceSessionCookie(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
): void {
  response.clearCookie(WORKFORCE_SESSION_COOKIE, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "strict",
    path: "/api/v1/internal",
  });
}

function isSecureRequest(request: Parameters<RequestHandler>[0]): boolean {
  const forwardedProtocol = request
    .header("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  return request.secure || forwardedProtocol === "https";
}

function serializeWorkforceIdentity(identity: WorkforceIdentity) {
  return {
    operatorId: identity.externalRef,
    displayName: identity.displayName,
    role: identity.role,
    expiresAt: identity.expiresAt,
  };
}

function hashAuditIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function redactOperationsTransfer<T extends { beneficiaryDisplay: string }>(
  transfer: T,
  role: WorkforceRole,
): T {
  if (role !== "compliance_readonly") return transfer;
  return { ...transfer, beneficiaryDisplay: "Restricted recipient" };
}

function serializeOperationsTransferDetail(
  detail: NonNullable<
    Awaited<
      ReturnType<
        NonNullable<DemoRuntime["operationsStore"]>["getOperationsTransfer"]
      >
    >
  >,
  role: WorkforceRole,
) {
  const value = detail as Record<string, unknown>;
  return {
    ...value,
    transfer: redactOperationsTransfer(
      serializeOperationsTransfer(
        value["transfer"] as Parameters<typeof serializeOperationsTransfer>[0],
      ),
      role,
    ),
  };
}

function serializeOperationsTransfer(
  input: Readonly<{
    id: string;
    customerId: string;
    beneficiaryDisplay: string;
    status: string;
    fundingStatus: string;
    payoutStatus: string;
    reconciliationStatus: string;
    sourceCurrency: string;
    sourceAmountMinor: string;
    feeAmountMinor: string;
    totalDebitMinor: string;
    destinationCurrency: string;
    destinationAmountMinor: string;
    workflowState: string | null;
    workflowAttempts: number | null;
    workflowLastError: string | null;
    createdAt: string;
    updatedAt: string;
  }>,
) {
  return {
    id: input.id,
    customerId: input.customerId,
    beneficiaryDisplay: input.beneficiaryDisplay,
    status: input.status,
    fundingStatus: input.fundingStatus,
    payoutStatus: input.payoutStatus,
    reconciliationStatus: input.reconciliationStatus,
    sourceAmount: {
      currency: input.sourceCurrency,
      minorUnits: input.sourceAmountMinor,
    },
    feeAmount: {
      currency: input.sourceCurrency,
      minorUnits: input.feeAmountMinor,
    },
    totalDebit: {
      currency: input.sourceCurrency,
      minorUnits: input.totalDebitMinor,
    },
    destinationAmount: {
      currency: input.destinationCurrency,
      minorUnits: input.destinationAmountMinor,
    },
    workflowState: input.workflowState,
    workflowAttempts: input.workflowAttempts,
    workflowLastError: input.workflowLastError,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createUnavailableV1Router(): Router {
  const router = Router();
  router.use((_req, _res, next) => next(new BackendUnavailableError()));
  return router;
}

function parseSchema<T>(schema: SafeParseSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join(".") || "request";
    fieldErrors[field] ??= [];
    fieldErrors[field].push(issue.message);
  }
  throw new RequestValidationError("One or more request fields are invalid.", {
    ...fieldErrors,
  });
}

function assertRailSpecificDeliveryInput(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const delivery = (value as Record<string, unknown>)["deliveryDetails"];
  if (!delivery || typeof delivery !== "object") return;
  const fields = delivery as Record<string, unknown>;
  const invalid =
    fields["method"] === "bank"
      ? ["walletId", "phoneNumber"].filter((field) => field in fields)
      : fields["method"] === "wallet"
        ? ["bankId", "accountNumber"].filter((field) => field in fields)
        : [];
  if (invalid.length > 0) {
    throw new RequestValidationError(
      "Delivery details cannot mix bank-account and mobile-wallet fields.",
      Object.fromEntries(
        invalid.map((field) => [
          `deliveryDetails.${field}`,
          ["Field is not valid for the selected delivery method."],
        ]),
      ),
    );
  }
}

function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): Readonly<{ items: readonly T[]; nextCursor: string | null }> {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RequestValidationError("The cursor is invalid.", {
      cursor: ["Cursor must be a non-negative integer string."],
    });
  }
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
