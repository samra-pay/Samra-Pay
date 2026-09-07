import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import type { Auth0Client } from "@auth0/auth0-spa-js";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { useLocation } from "wouter";

import {
  resolveAuth0ReturnTo,
  withApplicationPath,
  resolveWebCustomerAuthConfig,
  type WebCustomerAuthConfig,
} from "./auth0-config";
import {
  customerLoginOptions,
  hasAuth0RedirectParameters,
  type CustomerEntryIntent,
} from "./customer-entry";
import { resolveWebPublicEnvironment } from "./public-runtime-config";

export type CustomerAuthStatus =
  "disabled" | "loading" | "anonymous" | "authenticated" | "error";

type CustomerAuthSession = Readonly<{
  status: CustomerAuthStatus;
  error: Error | null;
  signIn: (intent?: CustomerEntryIntent) => Promise<void>;
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
        config: resolveWebCustomerAuthConfig(
          resolveWebPublicEnvironment(import.meta.env),
          {
            origin: window.location.origin,
            baseUrl: import.meta.env.BASE_URL,
          },
        ),
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
  const queryClient = useQueryClient();
  const sessionGeneration = useRef(0);
  const [sessionCache, setSessionCache] = useState(() => ({
    generation: 0,
    client: new QueryClient({
      defaultOptions: queryClient.getDefaultOptions(),
    }),
  }));
  const sessionCacheRef = useRef(sessionCache);
  const clearSession = useCallback(
    (renewCache = true) => {
      sessionGeneration.current += 1;
      setAuthTokenGetter(null);
      sessionCacheRef.current.client.clear();
      if (renewCache) {
        // An already-dispatched mutation may still complete its onSuccess.
        // Give the new session a different cache so late writes stay isolated.
        const cache = {
          generation: sessionGeneration.current,
          client: new QueryClient({
            defaultOptions: queryClient.getDefaultOptions(),
          }),
        };
        sessionCacheRef.current = cache;
        setSessionCache(cache);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    clearSession();
    const generation = sessionGeneration.current;

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
        if (!active) return;

        let returnTo: unknown;
        if (hasAuth0RedirectParameters(window.location.search)) {
          try {
            const result = await auth0.handleRedirectCallback<{
              returnTo?: unknown;
            }>();
            returnTo =
              result.appState?.returnTo ??
              withApplicationPath(config.applicationUri, "/session");
          } finally {
            const safeReturnTo = resolveAuth0ReturnTo(
              returnTo ?? withApplicationPath(config.applicationUri, "/login"),
              config.applicationUri,
            );
            if (active) {
              window.history.replaceState({}, document.title, safeReturnTo);
            }
          }
        }

        const authenticated = await auth0.isAuthenticated();
        if (!active) return;

        setAuthTokenGetter(
          authenticated
            ? createAccessTokenGetter(
                auth0,
                config.audience,
                () => active && generation === sessionGeneration.current,
              )
            : null,
        );
        setClient(auth0);
        setError(null);
        setStatus(authenticated ? "authenticated" : "anonymous");

        if (returnTo !== undefined) {
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      } catch (cause) {
        if (!active) return;
        clearSession();
        setClient(auth0);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    };

    void initialize();
    return () => {
      active = false;
      clearSession(false);
    };
  }, [clearSession, config]);

  const signIn = useCallback(
    async (intent: CustomerEntryIntent = "login") => {
      clearSession();
      if (!client) {
        setError(new Error("Auth0 is not ready for sign-in"));
        setStatus("error");
        return;
      }

      setError(null);
      setStatus("loading");
      try {
        await client.loginWithRedirect(
          customerLoginOptions(intent, config.applicationUri, config.audience),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
      }
    },
    [clearSession, client, config.applicationUri, config.audience],
  );

  const signOut = useCallback(async () => {
    clearSession();
    if (!client) {
      setError(new Error("Auth0 is not ready for sign-out"));
      setStatus("error");
      return;
    }

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
  }, [clearSession, client, config.applicationUri]);

  const value = useMemo<CustomerAuthSession>(
    () => ({ status, error, signIn, signOut }),
    [error, signIn, signOut, status],
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      <QueryClientProvider
        key={sessionCache.generation}
        client={sessionCache.client}
      >
        {children}
      </QueryClientProvider>
    </CustomerAuthContext.Provider>
  );
}

function createAccessTokenGetter(
  client: Auth0Client,
  audience: string,
  isSessionActive: () => boolean,
): () => Promise<string> {
  return async () => {
    if (!isSessionActive()) throw new Error("Customer session has ended");
    const token = await client.getTokenSilently({
      authorizationParams: { audience },
    });
    if (!isSessionActive()) throw new Error("Customer session has ended");
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
