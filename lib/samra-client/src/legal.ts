export const SAMRA_LEGAL_KINDS = Object.freeze([
  "privacy",
  "terms",
  "electronic-communications",
] as const);

export type SamraLegalKind = (typeof SAMRA_LEGAL_KINDS)[number];

export type SamraLegalDocument = Readonly<{
  kind: SamraLegalKind;
  path: string;
  eyebrow: string;
  title: string;
  intro: string;
  sections: readonly Readonly<{ title: string; body: string }>[];
  lastUpdated: string;
  disclaimer: string;
}>;

export const SAMRA_LEGAL_PATHS: Readonly<Record<SamraLegalKind, string>> =
  Object.freeze({
    privacy: "/privacy",
    terms: "/terms",
    "electronic-communications": "/electronic-communications",
  });

const LAST_UPDATED = "September 14, 2026";
const DISCLAIMER =
  "This document governs only the non-production Samra Pay alpha and is not a substitute for final customer agreements.";

const DOCUMENTS: Readonly<Record<SamraLegalKind, SamraLegalDocument>> =
  Object.freeze({
    privacy: legalDocument({
      kind: "privacy",
      eyebrow: "Privacy notice",
      title: "How the Samra Pay alpha handles information.",
      intro:
        "This notice describes the non-production alpha. Invited shared Dev/Test participants use Auth0 to register, sign in, and recover access. Do not submit real identity documents or financial details. Accepting this base notice does not authorize collection of production customer information or data for a separately enabled provider test.",
      sections: [
        {
          title: "Current data boundary",
          body: "Auth0 processes the sign-in information you provide, including your email address and credentials. Samra links the Auth0 identity reference to your test account and records Samra-owned onboarding, consent, identity-state, audit, and acquisition evidence. Product profiles, identity decisions, wallets, balances, and transfers in shared Dev/Test are synthetic. Any separately enabled non-production identity or wallet provider test requires its own disclosure and controls. Bank funding and production payment-provider connections remain disabled. Keep passwords, tokens, and personal details out of test reports and application logs.",
        },
        {
          title: "Acquisition measurement",
          body: "The alpha may record an opaque session, an allowlisted interaction type, platform, and controlled source, medium, or campaign classification. It does not accept raw URLs, query strings, click identifiers, device fingerprints, names, emails, phone numbers, identity evidence, customer identifiers, auth tokens, or financial values in acquisition telemetry.",
        },
        {
          title: "Production hard stop",
          body: "A final privacy notice, lawful basis, retention and deletion schedule, data-subject request process, vendor agreements, abuse controls, and security review must be approved before real customer data or production tracking is enabled.",
        },
      ],
    }),
    terms: legalDocument({
      kind: "terms",
      eyebrow: "Terms of Service",
      title: "Clear boundaries for the Samra Pay alpha.",
      intro:
        "Shared Dev/Test creates test account and synthetic wallet records. Accepting these Terms does not itself open an account or wallet, extend credit, move real money, complete real identity verification, or provide a financial service. The shared records are not a bank account or production wallet. A separately disclosed non-production wallet test may create an isolated provider resource without enabling financial capability.",
      sections: [
        {
          title: "Synthetic experience",
          body: "Displayed quotes, balances, transfers, timelines, reports, and operational views are synthetic test evidence. A separately disclosed identity decision or wallet resource still does not establish eligibility, settlement, ownership of funds, a customer balance, or service availability.",
        },
        {
          title: "No provider promise",
          body: "Auth0 handles invited Dev/Test authentication. Identity decisions, wallets, and payments in shared Dev/Test are simulated. References to Persona, Crossmint, Rain, Cybrid, Bridge, banks, networks, or payment rails describe proposed or isolated technical boundaries unless a separate executed agreement and live configuration are explicitly confirmed. Provider names and successful tests do not establish production availability or financial eligibility.",
        },
        {
          title: "Final agreements required",
          body: "Any production service will require approved customer agreements, fees, eligibility rules, partner and regulatory disclosures, privacy terms, support and complaint procedures, and any legally required account or payment documentation.",
        },
      ],
    }),
    "electronic-communications": legalDocument({
      kind: "electronic-communications",
      eyebrow: "Electronic Communications",
      title: "Test consent and authentication messages.",
      intro:
        "This alpha records your non-production consent decision for testing. It does not enroll you in production financial notices or marketing.",
      sections: [
        {
          title: "Authentication messages",
          body: "Auth0 may send registration, verification, or account-recovery messages through its managed flows. No production financial email, SMS, push-notification, or document-delivery provider is configured by this alpha. Recording this test consent does not activate those delivery channels.",
        },
        {
          title: "Evidence boundary",
          body: "Samra stores the selected document type, version, decision, server time, and immutable audit evidence. The alpha does not use this record to infer marketing consent or permission beyond the named onboarding document.",
        },
        {
          title: "Production requirements",
          body: "Before launch, the final consent must identify supported delivery channels, hardware and software requirements, how to withdraw consent, paper alternatives where required, contact-update responsibilities, and the effective customer agreement.",
        },
      ],
    }),
  });

export function getSamraLegalDocument(
  kind: SamraLegalKind,
): SamraLegalDocument {
  return DOCUMENTS[kind];
}

export function parseSamraLegalKind(value: unknown): SamraLegalKind | null {
  return typeof value === "string" &&
    SAMRA_LEGAL_KINDS.includes(value as SamraLegalKind)
    ? (value as SamraLegalKind)
    : null;
}

export function parseSamraLegalPath(
  value: string | null,
): SamraLegalKind | null {
  if (!value) return null;
  return (
    SAMRA_LEGAL_KINDS.find((kind) => SAMRA_LEGAL_PATHS[kind] === value) ?? null
  );
}

function legalDocument(
  input: Omit<SamraLegalDocument, "path" | "lastUpdated" | "disclaimer">,
): SamraLegalDocument {
  return Object.freeze({
    ...input,
    path: SAMRA_LEGAL_PATHS[input.kind],
    sections: Object.freeze(
      input.sections.map((section) => Object.freeze({ ...section })),
    ),
    lastUpdated: LAST_UPDATED,
    disclaimer: DISCLAIMER,
  });
}
