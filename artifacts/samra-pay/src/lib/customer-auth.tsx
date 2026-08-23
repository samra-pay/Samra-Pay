import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import type { Auth0Client } from "@auth0/auth0-spa-js";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { useLocation } from "wouter";

import {
  resolveAuth0ReturnTo,
  resolveWebCustomerAuthConfig,
  withApplicationPath,
  type WebCustomerAuthConfig,
} from "./auth0-config";

export type CustomerAuthStatus =
  "disabled" | "loading" | "anonymous" | "authenticated" | "error";

type CustomerAuthSession = Readonly<{
  status: CustomerAuthStatus;
  error: Error | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}>;

const CustomerAuthContext = createContext<CustomerAuthSession | null>(null);

const DISABLED_SESSION: CustomerAuthSession = Object.freeze({
  status: "disabled",
  error: null,
  signIn: async () => undefined,
  signOut: async () => undefined,
});

export function CustomerAuthProvider({
  children,
}: PropsWithChildren): ReactElement {
  const resolution = useMemo(() => {
    try {
      return {
        config: resolveWebCustomerAuthConfig(import.meta.env, {
          origin: window.location.origin,
          baseUrl: import.meta.env.BASE_URL,
        }),
        error: null,
      } as const;
    } catch (error) {
      return {
        config: null,
        error: error instanceof Error ? error : new Error(String(error)),
      } as const;
    }
  }, []);

  if (resolution.error) {
    return <CustomerAuthConfigurationError error={resolution.error} />;
  }

  if (!resolution.config || resolution.config.mode === "mock") {
    return (
      <CustomerAuthContext.Provider value={DISABLED_SESSION}>
        {children}
      </CustomerAuthContext.Provider>
    );
  }

  return (
    <Auth0SessionBridge config={resolution.config}>
      {children}
    </Auth0SessionBridge>
  );
}

function Auth0SessionBridge({
  children,
  config,
}: PropsWithChildren<{
  config: Extract<WebCustomerAuthConfig, { mode: "auth0" }>;
}>): ReactElement {
  const [client, setClient] = useState<Auth0Client | null>(null);
  const [status, setStatus] = useState<CustomerAuthStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      let auth0: Auth0Client | null = null;
      try {
        const { createAuth0Client } = await import("@auth0/auth0-spa-js");
        auth0 = await createAuth0Client({
          domain: config.domain,
          clientId: config.clientId,
          authorizationParams: {
            audience: config.audience,
            redirect_uri: config.applicationUri,
            scope: "openid",
          },
          cacheLocation: "memory",
          useRefreshTokens: false,
        });

        let returnTo: unknown;
        if (hasAuth0RedirectParameters(window.location.search)) {
          try {
            const result = await auth0.handleRedirectCallback<{
              returnTo?: unknown;
            }>();
            returnTo = result.appState?.returnTo;
          } finally {
            const safeReturnTo = resolveAuth0ReturnTo(
              returnTo,
              config.applicationUri,
            );
            window.history.replaceState({}, document.title, safeReturnTo);
          }
        }

        const authenticated = await auth0.isAuthenticated();
        if (!active) return;

        setAuthTokenGetter(
          authenticated
            ? createAccessTokenGetter(auth0, config.audience)
            : null,
        );
        setClient(auth0);
        setError(null);
        setStatus(authenticated ? "authenticated" : "anonymous");

        if (returnTo !== undefined) {
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } catch (cause) {
        setAuthTokenGetter(null);
        if (!active) return;
        setClient(auth0);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
      }
    };

    void initialize();
    return () => {
      active = false;
      setAuthTokenGetter(null);
    };
  }, [config]);

  const signIn = useCallback(async () => {
    if (!client) {
      setError(new Error("Auth0 is not ready for sign-in"));
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("loading");
    try {
      await client.loginWithRedirect({
        appState: {
          returnTo: withApplicationPath(config.applicationUri, "/onboarding"),
        },
        authorizationParams: {
          audience: config.audience,
          redirect_uri: config.applicationUri,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setStatus("error");
    }
  }, [client, config.applicationUri, config.audience]);

  const signOut = useCallback(async () => {
    if (!client) {
      setError(new Error("Auth0 is not ready for sign-out"));
      setStatus("error");
      return;
    }

    setAuthTokenGetter(null);
    setError(null);
    setStatus("loading");
    try {
      await client.logout({
        logoutParams: { returnTo: config.applicationUri },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setStatus("error");
    }
  }, [client, config.applicationUri]);

  const value = useMemo<CustomerAuthSession>(
    () => ({ status, error, signIn, signOut }),
    [error, signIn, signOut, status],
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

function createAccessTokenGetter(
  client: Auth0Client,
  audience: string,
): () => Promise<string> {
  return async () => {
    const token = await client.getTokenSilently({
      authorizationParams: { audience },
    });
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > 16_384 ||
      /[\s\u0000-\u001f\u007f]/u.test(token)
    ) {
      throw new Error("Auth0 returned an invalid API access token");
    }
    return token;
  };
}

function hasAuth0RedirectParameters(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return (
    parameters.has("state") &&
    (parameters.has("code") || parameters.has("error"))
  );
}

export function CustomerAuthGuard({
  children,
}: PropsWithChildren): ReactElement {
  const session = useCustomerAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (session.status === "anonymous") {
      setLocation("/login", { replace: true });
    }
  }, [session.status, setLocation]);

  if (session.status === "disabled" || session.status === "authenticated") {
    return <>{children}</>;
  }

  if (session.status === "error") {
    return (
      <CustomerAuthStatusPage
        title="Secure sign-in could not be completed"
        detail="The authentication provider did not complete the request. Return to sign in and retry."
        actionLabel="Retry secure sign-in"
        onAction={() => void session.signIn()}
      />
    );
  }

  return (
    <CustomerAuthStatusPage
      title="Checking your secure session"
      detail="Samra Pay is confirming your sign-in before loading customer data."
      status
    />
  );
}

export function useCustomerAuth(): CustomerAuthSession {
  const session = useContext(CustomerAuthContext);
  if (!session) {
    throw new Error("CustomerAuthProvider is missing from the app boundary");
  }
  return session;
}

function CustomerAuthConfigurationError({ error }: { error: Error }) {
  return (
    <CustomerAuthStatusPage
      title="Invalid customer authentication configuration"
      detail={error.message}
    />
  );
}

function CustomerAuthStatusPage({
  title,
  detail,
  status = false,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  status?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div
        role={status ? "status" : "alert"}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-card p-6"
      >
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {detail}
        </p>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="gold"
            className="mt-5 min-h-11"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
