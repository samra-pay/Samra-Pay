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
  const actorB = await client.query<{ id: string }>(
    `INSERT INTO samra_core.customers
     (external_ref, display_name, country_code, metadata)
     VALUES ('demo_customer_002','Second Synthetic Customer','US','{"synthetic":true}'::jsonb)
     ON CONFLICT (external_ref) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
  );
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
     (customer_id, external_ref, display_name, city, country_code, rail,
      payout_reference, bank_id, bank_account_number, wallet_id,
      wallet_phone_number, provider_metadata)
     VALUES
       ($1,'beneficiary_bank_001','Abebe Bekele','Addis Ababa','ET','bank_account','100000006789','cbe','100000006789',NULL,NULL,'{"synthetic":true}'::jsonb),
       ($1,'beneficiary_wallet_001','Tigist Haile','Hawassa','ET','mobile_wallet','+251911114321',NULL,NULL,'telebirr','+251911114321','{"synthetic":true}'::jsonb)
     ON CONFLICT (customer_id, external_ref) DO UPDATE SET
       display_name = EXCLUDED.display_name, city = EXCLUDED.city,
       rail = EXCLUDED.rail, payout_reference = EXCLUDED.payout_reference,
       bank_id = EXCLUDED.bank_id, bank_account_number = EXCLUDED.bank_account_number,
       wallet_id = EXCLUDED.wallet_id, wallet_phone_number = EXCLUDED.wallet_phone_number,
       state = 'active', deleted_at = NULL, updated_at = now()`,
    [customerId],
  );
  await client.query(
    `INSERT INTO samra_core.beneficiaries
     (customer_id, external_ref, display_name, city, country_code, rail,
      payout_reference, bank_id, bank_account_number, provider_metadata)
     VALUES ($1,'beneficiary_actor_b_001','Actor B Recipient','Bahir Dar','ET',
             'bank_account','200000001234','awash','200000001234','{"synthetic":true}'::jsonb)
     ON CONFLICT (customer_id, external_ref) DO UPDATE SET
       display_name = EXCLUDED.display_name, city = EXCLUDED.city,
       rail = EXCLUDED.rail, payout_reference = EXCLUDED.payout_reference,
       bank_id = EXCLUDED.bank_id, bank_account_number = EXCLUDED.bank_account_number,
       wallet_id = NULL, wallet_phone_number = NULL,
       state = 'active', deleted_at = NULL, updated_at = now()`,
    [actorB.rows[0]!.id],
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
    [
      "asset_reconciliation_suspense_usd",
      "Reconciliation suspense asset",
      "asset",
      "debit",
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
  await client.query(
    `UPDATE samra_core.ledger_accounts
     SET allow_negative_available = true
     WHERE code = 'asset_reconciliation_suspense_usd'`,
  );
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
