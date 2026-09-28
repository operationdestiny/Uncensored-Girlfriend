"use client";

import Link from "next/link";
import {
  CheckCircle2,
  KeyRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  getSupabaseBrowserClient
} from "@/lib/supabase/browser";
import { useSiteLanguage } from "@/lib/site-language";
import {
  FINAL_LOCALIZATION_COPY,
  localizedErrorMessage
} from "@/lib/final-localization-language";

export default function ResetPasswordPage() {
  const { language } = useSiteLanguage();
  const copy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const resetCopy = copy.reset;

  const [recoveryReady, setRecoveryReady] =
    useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setError(resetCopy.notConfigured);
      setChecking(false);
      return;
    }

    const markRecovery = () => {
      window.sessionStorage.setItem(
        "everbond-password-recovery",
        "1"
      );
      setRecoveryReady(true);
      setChecking(false);
    };

    if (
      window.location.hash.includes("type=recovery") ||
      window.sessionStorage.getItem(
        "everbond-password-recovery"
      ) === "1"
    ) {
      markRecovery();
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        markRecovery();
      }
    });

    const timeout = window.setTimeout(() => {
      setChecking(false);
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [resetCopy.notConfigured]);

  async function savePassword() {
    if (saving) return;

    if (password.length < 8) {
      setError(resetCopy.minimumLength);
      return;
    }

    if (password !== confirmPassword) {
      setError(resetCopy.mismatch);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase || !recoveryReady) {
      setError(resetCopy.openEmailFirst);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({ password });

      if (updateError) throw updateError;

      window.sessionStorage.removeItem(
        "everbond-password-recovery"
      );
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (updateError) {
      setError(
        localizedErrorMessage(
          updateError instanceof Error
            ? updateError.message
            : updateError,
          language,
          resetCopy.updateFailed,
          "password"
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-16 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-xl rounded-[2rem] border border-bond-rose/55 bg-white/[0.035] p-7 shadow-[0_0_44px_rgba(255,92,168,0.14)] md:p-10">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
              {complete ? (
                <CheckCircle2 size={28} />
              ) : (
                <KeyRound size={28} />
              )}
            </span>

            <h1 className="mt-6 font-display text-4xl font-bold text-bond-rose">
              {complete
                ? resetCopy.completeTitle
                : resetCopy.chooseTitle}
            </h1>

            {complete ? (
              <>
                <p className="mt-4 leading-7 text-bond-muted">
                  {resetCopy.completeBody}
                </p>
                <Link
                  href="/my-bond"
                  className="bond-pink-button mt-7 inline-flex rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white"
                >
                  {resetCopy.returnToBond}
                </Link>
              </>
            ) : checking ? (
              <p className="mt-6 animate-pulse text-bond-muted">
                {resetCopy.verifying}
              </p>
            ) : recoveryReady ? (
              <div className="mt-7 space-y-3">
                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  placeholder={resetCopy.newPassword}
                  aria-label={resetCopy.newPassword}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-bond-rose/70"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  placeholder={resetCopy.confirmPassword}
                  aria-label={resetCopy.confirmPassword}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-bond-rose/70"
                />
                <button
                  type="button"
                  onClick={() => void savePassword()}
                  disabled={
                    saving ||
                    !password ||
                    !confirmPassword
                  }
                  className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving
                    ? resetCopy.working
                    : resetCopy.updateButton}
                </button>
              </div>
            ) : (
              <p className="mt-6 leading-7 text-bond-muted">
                {resetCopy.openEmailBody}
              </p>
            )}

            {error && (
              <p className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
