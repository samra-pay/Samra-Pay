const base = require("./app.json").expo;
const nativeEnvironments = require("./native-environments.json");

const AUTH0_CUSTOM_SCHEME = "samrapayauth";
const NATIVE_APPLICATION_ID = "com.samrapay.mobile.staging";

function resolveExpoConfig(environment = process.env) {
  const mode = environment.EXPO_PUBLIC_SAMRA_AUTH_MODE || "disabled";
  const expo = structuredClone(base);
  const target = environment.EXPO_PUBLIC_SAMRA_ENVIRONMENT || "staging";
  if (!Object.hasOwn(nativeEnvironments, target)) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_ENVIRONMENT must be dev, test, or staging.",
    );
  }
  const native = nativeEnvironments[target];
  if (mode === "auth0-native" || environment.EXPO_PUBLIC_SAMRA_ENVIRONMENT) {
    expo.name = native.name;
    expo.ios = { ...expo.ios, bundleIdentifier: native.applicationId };
    expo.android = { ...expo.android, package: native.applicationId };
    // Separate schemes avoid one installed environment claiming another's callback.
    if (target !== "staging") expo.scheme = `samra-pay-${target}`;
  }

  if (mode === "disabled") return expo;
  if (mode !== "auth0-native") {
    throw new Error(
      'EXPO_PUBLIC_SAMRA_AUTH_MODE must be "disabled" or "auth0-native".',
    );
  }

  const domain = (environment.EXPO_PUBLIC_AUTH0_DOMAIN || "")
    .trim()
    .toLowerCase();
  if (
    domain.length < 3 ||
    domain.length > 253 ||
    !domain.includes(".") ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
    domain.includes("..")
  ) {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_DOMAIN must be a hostname only for native Auth0 builds.",
    );
  }

  const clientId = (environment.EXPO_PUBLIC_AUTH0_CLIENT_ID || "").trim();
  const audience = (environment.EXPO_PUBLIC_AUTH0_AUDIENCE || "").trim();
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(clientId)) {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_CLIENT_ID must be present for native Auth0 builds.",
    );
  }
  try {
    const url = new URL(audience);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      audience.length > 512
    ) {
      throw new Error("invalid audience");
    }
  } catch {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_AUDIENCE must be the exact HTTPS Samra API identifier.",
    );
  }

  expo.plugins = [
    ...expo.plugins,
    ["react-native-auth0", { domain, customScheme: native.customScheme }],
  ];
  return expo;
}

// Dynamic Expo config exports the ExpoConfig itself. The `expo` wrapper belongs
// to app.json only; returning it here would silently hide the native plugin and
// application identifiers from Expo prebuild.
module.exports = () => resolveExpoConfig();
module.exports.resolveExpoConfig = resolveExpoConfig;
module.exports.AUTH0_CUSTOM_SCHEME = AUTH0_CUSTOM_SCHEME;
module.exports.NATIVE_APPLICATION_ID = NATIVE_APPLICATION_ID;
