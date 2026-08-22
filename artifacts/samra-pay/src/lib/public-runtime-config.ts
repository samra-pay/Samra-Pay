type PublicEnvironment = Readonly<Record<string, string | boolean | undefined>>;

export type SamraPublicRuntimeConfig = Readonly<{
  VITE_SAMRA_DATA_MODE?: string;
  VITE_AUTH0_DOMAIN?: string;
  VITE_AUTH0_CLIENT_ID?: string;
  VITE_AUTH0_AUDIENCE?: string;
}>;

declare global {
  // The Cloud Run static server writes this allowlisted, public-only object
  // before the application module loads. Local Vite development serves an
  // empty fallback object from public/samra-runtime-config.js.
  var __SAMRA_RUNTIME_CONFIG__: SamraPublicRuntimeConfig | undefined;
}

const PUBLIC_RUNTIME_KEYS = Object.freeze([
  "VITE_SAMRA_DATA_MODE",
  "VITE_AUTH0_DOMAIN",
  "VITE_AUTH0_CLIENT_ID",
  "VITE_AUTH0_AUDIENCE",
] as const);

export function resolveWebPublicEnvironment(
  buildEnvironment: PublicEnvironment,
  runtimeConfig:
    SamraPublicRuntimeConfig | undefined = globalThis.__SAMRA_RUNTIME_CONFIG__,
): PublicEnvironment {
  const resolved: Record<string, string | boolean | undefined> = {
    ...buildEnvironment,
  };

  for (const key of PUBLIC_RUNTIME_KEYS) {
    const value = runtimeConfig?.[key];
    if (typeof value === "string" && value.length > 0) resolved[key] = value;
  }

  return Object.freeze(resolved);
}
