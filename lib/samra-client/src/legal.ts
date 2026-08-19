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

const LAST_UPDATED = "August 19, 2026";
const DISCLAIMER =
  "This document governs only the non-production Samra Pay alpha and is not a substitute for final customer agreements.";

const DOCUMENTS: Readonly<Record<SamraLegalKind, SamraLegalDocument>> =
  Object.freeze({
    privacy: legalDocument({
      kind: "privacy",
      eyebrow: "Privacy notice",
      title: "How the Samra Pay alpha handles information.",
      intro:
        "This notice describes the current non-production alpha. It does not authorize collection of real identity documents, live provider data, or production customer information.",
      sections: [
        {
          title: "Current data boundary",
          body: "The connected alpha uses synthetic identifiers and Samra-owned onboarding, consent, identity-state, audit, and acquisition records. Live Auth0, Persona, wallet, bank-funding, and payment-provider connections are not enabled.",
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
        "The current experience is a non-production product alpha. It does not open an account or wallet, extend credit, move money, complete identity verification, or provide a financial service.",
      sections: [
        {
          title: "Synthetic experience",
          body: "Quotes, balances, transfers, identity decisions, timelines, reports, and operational views are synthetic test evidence. They do not establish eligibility, approval, settlement, ownership of funds, or service availability.",
        },
        {
          title: "No provider promise",
          body: "References to Auth0, Persona, Crossmint, Rain, Cybrid, Bridge, banks, networks, or payment rails describe proposed or isolated technical boundaries unless a separate executed agreement and live configuration are explicitly confirmed.",
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
      title: "Electronic delivery is not active in this alpha.",
      intro:
        "This alpha records a synthetic consent decision so the onboarding state machine can be tested. It does not enroll a real person in electronic delivery.",
      sections: [
        {
          title: "No delivery channel enabled",
          body: "No production email, SMS, push-notification, or document-delivery provider is configured by this alpha. The current consent record does not cause a notice to be sent.",
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
