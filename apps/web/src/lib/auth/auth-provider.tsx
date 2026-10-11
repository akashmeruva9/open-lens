"use client";
// Thin auth abstraction for the Studio.
//  - "dev" mode: signs in as NEXT_PUBLIC_DEV_USER (default editor@dev); the API client sends
//    it as `x-dev-user`. Only for local/demo use.
//  - "firebase" mode: TODO(firebase-auth): initialise Firebase Auth (firebase/app + firebase/auth),
//    sign in with Google, read the `role` custom claim (editor|admin) from getIdTokenResult(),
//    and return user.getIdToken() from getToken(). Config must come from NEXT_PUBLIC_FIREBASE_*
//    env vars; never commit keys.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_MODE, DEV_USER } from "@/lib/env";

export type Role = "editor" | "admin" | "reader";
export interface StudioUser { email: string; role: Role }
type Status = "loading" | "signed_in" | "signed_out";

interface AuthState {
  mode: typeof AUTH_MODE;
  status: Status;
  user: StudioUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Bearer token for the API, or null (dev mode uses devUser header instead). */
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);
const SIGNED_OUT_KEY = "openlens:dev-signed-out";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (AUTH_MODE === "firebase") {
      // TODO(firebase-auth): subscribe to onAuthStateChanged here.
      setStatus("signed_out");
      return;
    }
    let signedOut = false;
    try {
      signedOut = window.localStorage.getItem(SIGNED_OUT_KEY) === "1";
    } catch {}
    setStatus(signedOut ? "signed_out" : "signed_in");
  }, []);

  const signIn = useCallback(async () => {
    if (AUTH_MODE === "firebase") throw new Error("Firebase Auth not configured yet (TODO)");
    try {
      window.localStorage.removeItem(SIGNED_OUT_KEY);
    } catch {}
    setStatus("signed_in");
  }, []);

  const signOut = useCallback(async () => {
    try {
      window.localStorage.setItem(SIGNED_OUT_KEY, "1");
    } catch {}
    setStatus("signed_out");
  }, []);

  const getToken = useCallback(async () => null, []); // TODO(firebase-auth): return await auth.currentUser?.getIdToken()

  const value = useMemo<AuthState>(
    () => ({
      mode: AUTH_MODE,
      status,
      user: status === "signed_in" ? { email: DEV_USER, role: "editor" } : null,
      signIn,
      signOut,
      getToken,
    }),
    [status, signIn, signOut, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const canEdit = (u: StudioUser | null) => u?.role === "editor" || u?.role === "admin";
