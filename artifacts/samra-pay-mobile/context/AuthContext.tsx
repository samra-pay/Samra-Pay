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

  const connectApiToken = useCallback((session: NativeAuth0Session) => {
    setAuthTokenGetter(async () => {
      try {
        return await session.getAccessToken();
      } catch {
        setAuthTokenGetter(null);
        setIsSignedIn(false);
        return null;
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    nativeSession.current = null;
    setAuthTokenGetter(null);
    setIsReady(false);
    setIsSignedIn(false);

    const initialize = async () => {
      if (config.mode === "disabled") {
        const value = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (active) setIsSignedIn(value === "true");
        return;
      }

      const session = await createNativeAuth0Session(config, Platform.OS);
      const restored = await session.restore();
      if (!active) return;
      nativeSession.current = session;
      if (restored) connectApiToken(session);
      setIsSignedIn(restored);
    };

    void initialize()
      .catch(() => {
        if (active) setIsSignedIn(false);
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
      nativeSession.current = null;
      setAuthTokenGetter(null);
    };
  }, [config, connectApiToken]);

  const signIn = useCallback(async () => {
    if (config.mode === "disabled") {
      setIsSignedIn(true);
      try {
        await AsyncStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // synthetic session only — ignore persistence errors
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
    connectApiToken(session);
    setIsSignedIn(true);
  }, [config.mode, connectApiToken]);

  const signOut = useCallback(async () => {
    setAuthTokenGetter(null);
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
  }, [config.mode]);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
