import { InMemoryLedgerRepository } from "../../../../lib/ledger/test/fixtures/in-memory-ledger";
import { DemoLedgerAdapter } from "../../src/domain/demo-ledger";
import {
  DemoRuntime,
  type DemoRuntimeDependencies,
} from "../../src/domain/demo-runtime";

/** Explicit test composition; runtime entrypoints must use PostgreSQL. */
export class TestDemoRuntime extends DemoRuntime {
  constructor(
    dependencies: Omit<DemoRuntimeDependencies, "ledger"> &
      Partial<Pick<DemoRuntimeDependencies, "ledger">> = {},
  ) {
    super({
      ...dependencies,
      ledger:
        dependencies.ledger ??
        new DemoLedgerAdapter(new InMemoryLedgerRepository()),
    });
  }
}
