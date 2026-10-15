"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthProvider, canEdit, useAuth } from "@/lib/auth/auth-provider";
import { DataProvider } from "@/lib/data/browser";

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DataProvider>
        <StudioHeader />
        <main id="main" className="mx-auto max-w-7xl px-4 pb-16 pt-6 [--surface:var(--bg)]">
          <AuthGate>{children}</AuthGate>
        </main>
      </DataProvider>
    </AuthProvider>
  );
}

function StudioHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-4">
          <Logo href="/studio" suffix="Studio" />
          <nav aria-label="Studio" className="hidden items-center gap-1 sm:flex">
            <Link href="/studio" className="rounded-full px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface hover:text-ink">Queue</Link>
            <Link href="/" className="rounded-full px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface hover:text-ink">Reader app ↗</Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <span className="hidden items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 md:inline-flex">
              <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-bg">
                {user.email[0]?.toUpperCase()}
              </span>
              {user.email} · {user.role}
            </span>
          ) : null}
          {user ? <Button size="sm" variant="ghost" onClick={() => void signOut()}>Sign out</Button> : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, signIn, mode } = useAuth();
  if (status === "loading") return <p className="py-20 text-center text-sm text-ink-3">Checking access…</p>;
  if (status === "signed_out" || !user) {
    return (
      <div className="mx-auto mt-16 max-w-sm card p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Newsroom Studio</h1>
        <p className="mt-2 text-sm text-ink-2">Editors only. Sign in to review ledgers, approve outputs and publish.</p>
        <Button variant="primary" className="mt-5 w-full" onClick={() => void signIn()} disabled={mode === "firebase"}>
          {mode === "dev" ? "Continue as dev editor" : "Sign in with Google"}
        </Button>
        {mode === "firebase" ? <p className="mt-2 text-xs text-ink-3">Firebase Auth is not wired yet (TODO).</p> : null}
      </div>
    );
  }
  if (!canEdit(user)) return <p className="py-20 text-center">Your account does not have editor access.</p>;
  return <>{children}</>;
}
