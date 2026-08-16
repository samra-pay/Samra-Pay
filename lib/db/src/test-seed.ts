import pg from "pg";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required. Seeds are restricted to an explicit disposable test database.",
  );
}

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const customer = await client.query<{ id: string }>(
    `INSERT INTO samra_core.customers
     (external_ref, display_name, country_code, metadata)
     VALUES ('demo_customer_001','Samra Demo Customer','US','{"synthetic":true}'::jsonb)
     ON CONFLICT (external_ref) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
  );
  const customerId = customer.rows[0]!.id;
  const account = await client.query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     VALUES ($1,'demo_usd_account_001','domestic_cash','USD')
     ON CONFLICT (external_ref) DO UPDATE SET customer_id = EXCLUDED.customer_id
     RETURNING id`,
    [customerId],
  );
  const productAccountId = account.rows[0]!.id;
  await client.query(
    `INSERT INTO samra_core.beneficiaries
     (customer_id, external_ref, display_name, country_code, rail, payout_reference, provider_metadata)
     VALUES
       ($1,'beneficiary_bank_001','Abebe Bekele','ET','bank_account','synthetic-bank-001','{"synthetic":true}'::jsonb),
       ($1,'beneficiary_wallet_001','Tigist Haile','ET','mobile_wallet','synthetic-wallet-001','{"synthetic":true}'::jsonb)
     ON CONFLICT (customer_id, external_ref) DO UPDATE SET display_name = EXCLUDED.display_name`,
    [customerId],
  );
  const accounts = [
    ["control_rain_usd", "Rain USD control asset", "asset", "debit", null],
    [
      "demo_usd_account_001",
      "Demo customer USD liability",
      "liability",
      "credit",
      productAccountId,
    ],
    [
      "clearing_remittance_principal_usd",
      "Remittance principal clearing",
      "liability",
      "credit",
      null,
    ],
    [
      "liability_deferred_remittance_fee_usd",
      "Deferred remittance fee",
      "liability",
      "credit",
      null,
    ],
    [
      "revenue_remittance_fee_usd",
      "Remittance fee revenue",
      "revenue",
      "credit",
      null,
    ],
  ] as const;
  for (const ledgerAccount of accounts) {
    await client.query(
      `INSERT INTO samra_core.ledger_accounts
       (code, name, account_class, normal_side, currency, product_account_id)
       VALUES ($1,$2,$3,$4,'USD',$5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [...ledgerAccount],
    );
  }
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM samra_core.ledger_journals
     WHERE business_event_type = 'demo_seed' AND business_event_id = 'opening_balance_001'`,
  );
  if (!existing.rows[0]) {
    const journal = await client.query<{ id: string }>(
      `INSERT INTO samra_core.ledger_journals
       (business_event_type, business_event_id, currency, state, description, metadata)
       VALUES ('demo_seed','opening_balance_001','USD','draft',
               'Seed synthetic demo customer balance','{"synthetic":true}'::jsonb)
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO samra_core.ledger_postings
       (journal_id, account_id, sequence, side, amount_minor)
       SELECT $1::uuid, id, 1, 'debit'::samra_core.ledger_entry_side, 425000 FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'
       UNION ALL
       SELECT $1::uuid, id, 2, 'credit'::samra_core.ledger_entry_side, 425000 FROM samra_core.ledger_accounts WHERE code = 'demo_usd_account_001'`,
      [journal.rows[0]!.id],
    );
    await client.query(
      `UPDATE samra_core.ledger_journals SET state = 'posted', posted_at = now() WHERE id = $1`,
      [journal.rows[0]!.id],
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
