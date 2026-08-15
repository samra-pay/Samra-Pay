import { Router, type RequestHandler } from "express";
import {
  CancelRemittanceTransferHeader,
  CancelRemittanceTransferParams,
  CancelRemittanceTransferResponse,
  CreateRemittanceQuoteBody,
  CreateRemittanceQuoteResponse,
  CreateRemittanceTransferBody,
  CreateRemittanceTransferHeader,
  CreateRemittanceTransferResponse,
  GetCurrentCustomerResponse,
  GetDemoReconciliationRunParams,
  GetDemoReconciliationRunResponse,
  GetRemittanceOptionsResponse,
  GetRemittanceTransferParams,
  GetRemittanceTransferResponse,
  ListAccountsResponse,
  ListActivityQueryParams,
  ListActivityResponse,
  ListRemittanceTransfersQueryParams,
  ListRemittanceTransfersResponse,
  RunDemoReconciliationBody,
  RunDemoReconciliationResponse,
  SelectDemoTransferScenarioBody,
  SelectDemoTransferScenarioParams,
  SelectDemoTransferScenarioResponse,
} from "@workspace/api-zod";
import { parseMinor } from "@workspace/remittance";
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
      await runtime.actorResolver.resolve(req);
      res.json(ListAccountsResponse.parse([runtime.accountResponse()]));
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
      runtime.assertBeneficiaryRail(body.beneficiaryId, body.deliveryMethod);
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
      const serialized = transfers.map((transfer) =>
        serializeTransfer(
          transfer,
          runtime.recipientDisplay(transfer.quote.beneficiaryId),
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
              runtime.recipientDisplay(transfer.quote.beneficiaryId),
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
            runtime.recipientDisplay(transfer.quote.beneficiaryId),
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
            runtime.recipientDisplay(transfer.quote.beneficiaryId),
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
              runtime.recipientDisplay(transfer.quote.beneficiaryId),
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
            runtime.getReconciliation(params.runId),
          ),
        );
      }),
    );
  }

  return router;
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
