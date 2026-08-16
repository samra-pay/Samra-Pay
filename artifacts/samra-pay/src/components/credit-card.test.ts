import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { CreditCard } from "./credit-card";

test("renders the Ethiopian Airlines logo on the co-branded card", () => {
  const markup = renderToStaticMarkup(
    createElement(CreditCard, { variant: "airlines", last4: "1991" }),
  );

  expect(markup).toContain('alt="Ethiopian Airlines"');
  expect(markup).toContain('data-testid="ethiopian-airlines-logo"');
  expect(markup).toContain("ethiopian-airlines-logo.svg");
});