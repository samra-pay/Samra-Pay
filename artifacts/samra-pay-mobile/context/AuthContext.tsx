import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  createNativeAuth0Session,
  type NativeAuth0Session,
} from "@/lib/native-auth0";
import type { MobileAuthConfig } from "@/lib/runtime-config";

const STORAGE_KEY = "samra-pay-demo-session";

interface AuthContextValue {
  isReady: boolean;
  isSignedIn: boolean;
  authMode: MobileAuthConfig["mode"];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  config,
  children,
}: {
  config: MobileAuthConfig;
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);
  const nativeSession = useRef<NativeAuth0Session | null>(null);
  const parentQueryClient = useQueryClient();
  const sessionGeneration = useRef(0);
  const [sessionCache, setSessionCache] = useState(() => ({
    generation: 0,
    client: new QueryClient({
      defaultOptions: parentQueryClient.getDefaultOptions(),
    }),
  }));
  const sessionCacheRef = useRef(sessionCache);

  const clearSession = useCallback(
    (renewCache = true) => {
      sessionGeneration.current += 1;
      setAuthTokenGetter(null);
      sessionCacheRef.current.client.clear();
      if (renewCache) {
        // Pending mutations can still write to their captured cache. A fresh
        // client keeps those results out of the next account; the key also
        // discards mounted screen state, including recipient/transfer drafts.
        const cache = {
          generation: sessionGeneration.current,
          client: new QueryClient({
            defaultOptions: parentQueryClient.getDefaultOptions(),
          }),
        };
        sessionCacheRef.current = cache;
        setSessionCache(cache);
      }
      return sessionGeneration.current;
    },
    [parentQueryClient],
  );

  const connectApiToken = useCallback(
    (session: NativeAuth0Session, generation: number) => {
      setAuthTokenGetter(async () => {
        if (generation !== sessionGeneration.current) {
          throw new Error("Customer session has ended.");
        }
        try {
          const token = await session.getAccessToken();
          if (generation !== sessionGeneration.current) {
            throw new Error("Customer session has ended.");
          }
          return token;
        } catch {
          // A late failure from an old account must not sign out a new one.
          if (generation === sessionGeneration.current) {
            clearSession();
            setIsSignedIn(false);
          }
          throw new Error("Secure sign-in is required.");
        }
      });
    },
    [clearSession],
  );

  useEffect(() => {
    let active = true;
    nativeSession.current = null;
    const generation = clearSession();
    const isCurrent = () => active && generation === sessionGeneration.current;
    setIsReady(false);
    setIsSignedIn(false);

    const initialize = async () => {
      if (config.mode === "disabled") {
        const value = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (isCurrent()) setIsSignedIn(value === "true");
        return;
      }

      const session = await createNativeAuth0Session(config, Platform.OS);
      if (!isCurrent()) return;
      const restored = await session.restore();
      if (!isCurrent()) return;
      nativeSession.current = session;
      if (restored) connectApiToken(session, generation);
      setIsSignedIn(restored);
    };

    void initialize()
      .catch(() => {
        if (isCurrent()) setIsSignedIn(false);
      })
      .finally(() => {
        if (isCurrent()) setIsReady(true);
      });

    return () => {
      active = false;
      nativeSession.current = null;
      clearSession(false);
    };
  }, [clearSession, config, connectApiToken]);

  const signIn = useCallback(async () => {
    // Keep the login screen mounted while the managed browser is open.
    // Replace its cache and screen tree before admitting the new account.
    const generation = clearSession(false);
    setIsSignedIn(false);
    if (config.mode === "disabled") {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // synthetic session only — ignore persistence errors
      }
      if (generation === sessionGeneration.current) {
        clearSession();
        setIsSignedIn(true);
      }
      return;
    }

    const session = nativeSession.current;
    if (!session) {
      throw new Error(
        "Secure sign-in is unavailable in this application build.",
      );
    }
    await session.signIn();
    if (generation !== sessionGeneration.current) {
      throw new Error("Customer session has ended.");
    }
    connectApiToken(session, clearSession());
    setIsSignedIn(true);
  }, [clearSession, config.mode, connectApiToken]);

  const signOut = useCallback(async () => {
    clearSession();
    setIsSignedIn(false);
    if (config.mode === "disabled") {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {
        // synthetic session only — ignore cleanup errors
      }
      return;
    }

    const session = nativeSession.current;
    if (session) await session.signOut();
  }, [clearSession, config.mode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isSignedIn,
      authMode: config.mode,
      signIn,
      signOut,
    }),
    [config.mode, isReady, isSignedIn, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      <QueryClientProvider
        key={sessionCache.generation}
        client={sessionCache.client}
      >
        {children}
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
