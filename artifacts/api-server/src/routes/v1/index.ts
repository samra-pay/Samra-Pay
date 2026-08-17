import { Router, type RequestHandler } from "express";
import {
  CancelRemittanceTransferHeader,
  CancelRemittanceTransferParams,
  CancelRemittanceTransferResponse,
  CreateBeneficiaryBody,
  CreateBeneficiaryResponse,
  CreateRemittanceQuoteBody,
  CreateRemittanceQuoteResponse,
  CreateRemittanceTransferBody,
  CreateRemittanceTransferHeader,
  CreateRemittanceTransferResponse,
  GetCurrentCustomerResponse,
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
  UpdateBeneficiaryBody,
  UpdateBeneficiaryParams,
  UpdateBeneficiaryResponse,
  DeleteBeneficiaryParams,
  GetOperationsSummaryResponse,
  GetOperationsTransferParams,
  GetOperationsTransferResponse,
  ListOperationsAuditEventsQueryParams,
  ListOperationsAuditEventsResponse,
  ListOperationsReconciliationExceptionsQueryParams,
  ListOperationsReconciliationExceptionsResponse,
  ListOperationsTransfersQueryParams,
  ListOperationsTransfersResponse,
} from "@workspace/api-zod";
import { DomainError, parseMinor } from "@workspace/remittance";
import { randomUUID } from "node:crypto";
import type { ApiRuntimeConfig } from "../../config";
import {
  DEMO_ACTOR,
  DemoRuntime,
  type PublicReconciliationDemoScenario,
} from "../../domain/demo-runtime";
import { serializeQuote, serializeTransfer } from "../../domain/serializers";
import {
  BackendUnavailableError,
  RequestValidationError,
} from "../../lib/problem";

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
): Router {
  const router = Router();

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
    router.post(
      "/dev/remittance/transfers/:transferId/scenario",
      asyncRoute(async (req, res) => {
        const actor = await runtime.actorResolver.resolve(req);
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
        const actor = await runtime.actorResolver.resolve(req);
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
        await runtime.actorResolver.resolve(req);
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
    runtime.operationsStore
  ) {
    const operations = runtime.operationsStore;
    router.get(
      "/internal/operations/summary",
      asyncRoute(async (req, res) => {
        const operatorId = resolveDemoOperator(req);
        const summary = await operations.operationsSummary();
        await auditOperatorRead(
          operations,
          operatorId,
          "operations_summary",
          "all",
        );
        res.json(GetOperationsSummaryResponse.parse(summary));
      }),
    );

    router.get(
      "/internal/operations/transfers",
      asyncRoute(async (req, res) => {
        const operatorId = resolveDemoOperator(req);
        const query = parseSchema(
          ListOperationsTransfersQueryParams,
          req.query,
        );
        const transfers = (await operations.listOperationsTransfers(query)).map(
          serializeOperationsTransfer,
        );
        await auditOperatorRead(
          operations,
          operatorId,
          "operations_transfer_search",
          query.search ?? query.status ?? "all",
        );
        res.json(ListOperationsTransfersResponse.parse(transfers));
      }),
    );

    router.get(
      "/internal/operations/transfers/:transferId",
      asyncRoute(async (req, res) => {
        const operatorId = resolveDemoOperator(req);
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
          operatorId,
          "operations_transfer_detail",
          params.transferId,
        );
        const value = detail as Record<string, unknown>;
        res.json(
          GetOperationsTransferResponse.parse({
            ...value,
            transfer: serializeOperationsTransfer(
              value["transfer"] as Parameters<
                typeof serializeOperationsTransfer
              >[0],
            ),
          }),
        );
      }),
    );

    router.get(
      "/internal/operations/reconciliation/exceptions",
      asyncRoute(async (req, res) => {
        const operatorId = resolveDemoOperator(req);
        const query = parseSchema(
          ListOperationsReconciliationExceptionsQueryParams,
          req.query,
        );
        const exceptions = await operations.listReconciliationExceptions(
          query.limit,
        );
        await auditOperatorRead(
          operations,
          operatorId,
          "operations_reconciliation_exceptions",
          "all",
        );
        res.json(
          ListOperationsReconciliationExceptionsResponse.parse(exceptions),
        );
      }),
    );

    router.get(
      "/internal/operations/audit-events",
      asyncRoute(async (req, res) => {
        const operatorId = resolveDemoOperator(req);
        const query = parseSchema(
          ListOperationsAuditEventsQueryParams,
          req.query,
        );
        await auditOperatorRead(
          operations,
          operatorId,
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
  }

  return router;
}

function resolveDemoOperator(request: Parameters<RequestHandler>[0]): string {
  const operatorId = request.header("X-Demo-Operator-Id");
  const role = request.header("X-Demo-Operator-Role");
  if (operatorId !== "demo_cs_agent_001" || role !== "support_readonly") {
    throw new DomainError(
      "ACTOR_NOT_ALLOWED",
      "The internal operations route was not found.",
    );
  }
  return operatorId;
}

async function auditOperatorRead(
  operations: NonNullable<DemoRuntime["operationsStore"]>,
  operatorId: string,
  action: string,
  entityId: string,
): Promise<void> {
  await operations.recordAudit({
    eventKey: `operator:${operatorId}:${action}:${randomUUID()}`,
    actorType: "operator",
    actorId: operatorId,
    action,
    entityType: "operations_view",
    entityId,
    correlationId: entityId === "all" ? undefined : entityId,
    metadata: { role: "support_readonly", synthetic: true },
  });
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
