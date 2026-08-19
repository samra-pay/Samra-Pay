import assert from "node:assert/strict";
import test from "node:test";

import {
  SAMRA_LEGAL_KINDS,
  getSamraLegalDocument,
  parseSamraLegalKind,
  parseSamraLegalPath,
} from "./legal.ts";
import {
  getCustomerConsentPresentation,
  type CustomerConsentType,
} from "./onboarding.ts";

test("every alpha legal document states its non-production boundary", () => {
  for (const kind of SAMRA_LEGAL_KINDS) {
    const document = getSamraLegalDocument(kind);
    const serialized = JSON.stringify(document).toLowerCase();

    assert.equal(document.kind, kind);
    assert.equal(document.sections.length, 3);
    assert.match(document.path, /^\/[a-z-]+$/);
    assert.match(serialized, /non-production|not active/);
    assert.match(serialized, /alpha/);
    assert.doesNotMatch(serialized, /guaranteed|approved partner|live service/);
  }
});

test("legal kind and path parsing fail closed", () => {
  assert.equal(parseSamraLegalKind("privacy"), "privacy");
  assert.equal(
    parseSamraLegalKind("electronic-communications"),
    "electronic-communications",
  );
  assert.equal(parseSamraLegalKind("private@example.test"), null);
  assert.equal(parseSamraLegalKind(["terms"]), null);
  assert.equal(parseSamraLegalPath("/terms"), "terms");
  assert.equal(
    parseSamraLegalPath("/electronic-communications"),
    "electronic-communications",
  );
  assert.equal(parseSamraLegalPath("https://untrusted.example/terms"), null);
});

test("every required consent can be reviewed through an owned legal path", () => {
  const consentTypes: CustomerConsentType[] = [
    "terms_of_service",
    "privacy_notice",
    "electronic_communications",
  ];

  for (const consentType of consentTypes) {
    const presentation = getCustomerConsentPresentation(consentType);
    const legalKind = parseSamraLegalPath(presentation.href);
    assert.notEqual(legalKind, null);
    assert.equal(getSamraLegalDocument(legalKind!).path, presentation.href);
  }
});
