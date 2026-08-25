import { describe, expect, it } from "vitest";

import { resolveWebPublicEnvironment } from "./public-runtime-config";

describe("public runtime configuration", () => {
  it("lets an allowlisted Cloud Run configuration override portable build defaults", () => {
    expect(
      resolveWebPublicEnvironment(
        {
          VITE_SAMRA_DATA_MODE: "api",
          VITE_AUTH0_DOMAIN: "build.example.test",
          PRIVATE_BUILD_VALUE: "never-exported-by-the-server",
        },
        {
          VITE_SAMRA_DATA_MODE: "api",
          VITE_AUTH0_DOMAIN: "login.staging.samrapay.com",
          VITE_AUTH0_CLIENT_ID: "public-client-id",
          VITE_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
          VITE_SAMRA_ACQUISITION_CAMPAIGNS: "alpha_launch,community_referral",
        },
      ),
    ).toEqual({
      VITE_SAMRA_DATA_MODE: "api",
      VITE_AUTH0_DOMAIN: "login.staging.samrapay.com",
      VITE_AUTH0_CLIENT_ID: "public-client-id",
      VITE_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
      VITE_SAMRA_ACQUISITION_CAMPAIGNS: "alpha_launch,community_referral",
      PRIVATE_BUILD_VALUE: "never-exported-by-the-server",
    });
  });

  it("keeps local development on build defaults when no runtime values exist", () => {
    const buildEnvironment = Object.freeze({
      VITE_SAMRA_DATA_MODE: "mock",
    });
    expect(resolveWebPublicEnvironment(buildEnvironment, {})).toEqual(
      buildEnvironment,
    );
  });
});
