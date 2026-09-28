"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthModalCharacter } from "@/components/auth/AuthProvider";
import {
  useSiteLanguage,
  type LanguageCode
} from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";
import { localizedErrorMessage } from "@/lib/final-localization-language";

type AuthModalProps = {
  open: boolean;
  supabase: SupabaseClient | null;
  character?: AuthModalCharacter | null;
  onClose: () => void;
};

type ExtraAuthCopy = {
  or: string;
  continueWithGoogle: string;
  forgotPassword: string;
  forgotTitle: string;
  forgotDescription: string;
  resetEmail: string;
  sendResetLink: string;
  sendingReset: string;
  resetSent: string;
  accountNotFound: string;
  invalidEmail: string;
  resetFailed: string;
  googleFailed: string;
  close: string;
  cancel: string;
};

const AUTH_EXTRA_COPY: Record<LanguageCode, ExtraAuthCopy> = {
  EN: {
    or: "or",
    continueWithGoogle: "Continue with Google",
    forgotPassword: "Forgot password?",
    forgotTitle: "Reset your password",
    forgotDescription:
      "Enter the email connected to your Uncensored Girlfriend account. We will send a secure reset link.",
    resetEmail: "Account email",
    sendResetLink: "Send reset link",
    sendingReset: "Sending...",
    resetSent:
      "Password-reset email sent. Open the link to choose a new password.",
    accountNotFound:
      "No Uncensored Girlfriend account is associated with that email.",
    invalidEmail: "Enter a valid email address.",
    resetFailed:
      "The password-reset email could not be sent. Please try again.",
    googleFailed:
      "Google sign-in could not start. Please try again.",
    close: "Close",
    cancel: "Cancel"
  },
  ES: {
    or: "o",
    continueWithGoogle: "Continuar con Google",
    forgotPassword: "¿Olvidaste tu contraseña?",
    forgotTitle: "Restablece tu contraseña",
    forgotDescription:
      "Introduce el correo conectado a tu cuenta de Uncensored Girlfriend. Enviaremos un enlace seguro.",
    resetEmail: "Correo de la cuenta",
    sendResetLink: "Enviar enlace",
    sendingReset: "Enviando...",
    resetSent:
      "Correo enviado. Abre el enlace para elegir una nueva contraseña.",
    accountNotFound:
      "No hay ninguna cuenta de Uncensored Girlfriend asociada con ese correo.",
    invalidEmail: "Introduce un correo válido.",
    resetFailed:
      "No se pudo enviar el correo. Inténtalo de nuevo.",
    googleFailed:
      "No se pudo iniciar el acceso con Google. Inténtalo de nuevo.",
    close: "Cerrar",
    cancel: "Cancelar"
  },
  FR: {
    or: "ou",
    continueWithGoogle: "Continuer avec Google",
    forgotPassword: "Mot de passe oublié ?",
    forgotTitle: "Réinitialiser votre mot de passe",
    forgotDescription:
      "Saisissez l’e-mail lié à votre compte Uncensored Girlfriend. Nous enverrons un lien sécurisé.",
    resetEmail: "E-mail du compte",
    sendResetLink: "Envoyer le lien",
    sendingReset: "Envoi...",
    resetSent:
      "E-mail envoyé. Ouvrez le lien pour choisir un nouveau mot de passe.",
    accountNotFound:
      "Aucun compte Uncensored Girlfriend n’est associé à cet e-mail.",
    invalidEmail: "Saisissez une adresse e-mail valide.",
    resetFailed:
      "L’e-mail n’a pas pu être envoyé. Réessayez.",
    googleFailed:
      "La connexion Google n’a pas pu démarrer. Réessayez.",
    close: "Fermer",
    cancel: "Annuler"
  },
  DE: {
    or: "oder",
    continueWithGoogle: "Mit Google fortfahren",
    forgotPassword: "Passwort vergessen?",
    forgotTitle: "Passwort zurücksetzen",
    forgotDescription:
      "Gib die E-Mail deines Uncensored Girlfriend-Kontos ein. Wir senden einen sicheren Link.",
    resetEmail: "Konto-E-Mail",
    sendResetLink: "Reset-Link senden",
    sendingReset: "Wird gesendet...",
    resetSent:
      "E-Mail gesendet. Öffne den Link, um ein neues Passwort festzulegen.",
    accountNotFound:
      "Mit dieser E-Mail ist kein Uncensored Girlfriend-Konto verbunden.",
    invalidEmail: "Gib eine gültige E-Mail-Adresse ein.",
    resetFailed:
      "Die E-Mail konnte nicht gesendet werden. Versuche es erneut.",
    googleFailed:
      "Die Google-Anmeldung konnte nicht gestartet werden. Versuche es erneut.",
    close: "Schließen",
    cancel: "Abbrechen"
  },
  JA: {
    or: "または",
    continueWithGoogle: "Googleで続行",
    forgotPassword: "パスワードをお忘れですか？",
    forgotTitle: "パスワードをリセット",
    forgotDescription:
      "Uncensored Girlfriendアカウントに登録されているメールを入力してください。安全なリセットリンクを送信します。",
    resetEmail: "アカウントのメール",
    sendResetLink: "リセットリンクを送信",
    sendingReset: "送信中...",
    resetSent:
      "リセットメールを送信しました。リンクを開いて新しいパスワードを設定してください。",
    accountNotFound:
      "そのメールに関連付けられたUncensored Girlfriendアカウントはありません。",
    invalidEmail: "有効なメールアドレスを入力してください。",
    resetFailed:
      "リセットメールを送信できませんでした。もう一度お試しください。",
    googleFailed:
      "Googleログインを開始できませんでした。もう一度お試しください。",
    close: "閉じる",
    cancel: "キャンセル"
  },
  KO: {
    or: "또는",
    continueWithGoogle: "Google로 계속",
    forgotPassword: "비밀번호를 잊으셨나요?",
    forgotTitle: "비밀번호 재설정",
    forgotDescription:
      "Uncensored Girlfriend 계정에 연결된 이메일을 입력하세요. 안전한 재설정 링크를 보내드립니다.",
    resetEmail: "계정 이메일",
    sendResetLink: "재설정 링크 보내기",
    sendingReset: "보내는 중...",
    resetSent:
      "재설정 이메일을 보냈습니다. 링크를 열어 새 비밀번호를 설정하세요.",
    accountNotFound:
      "해당 이메일에 연결된 Uncensored Girlfriend 계정이 없습니다.",
    invalidEmail: "유효한 이메일 주소를 입력하세요.",
    resetFailed:
      "재설정 이메일을 보낼 수 없습니다. 다시 시도하세요.",
    googleFailed:
      "Google 로그인을 시작할 수 없습니다. 다시 시도하세요.",
    close: "닫기",
    cancel: "취소"
  }
};

const GENERAL_LOGIN_IMAGE_BY_LANGUAGE: Record<LanguageCode, string> = {
  EN: "/assets/auth/login/en.png",
  ES: "/assets/auth/login/es.png",
  FR: "/assets/auth/login/fr.png",
  JA: "/assets/auth/login/ja.png",
  DE: "/assets/auth/login/de.png",
  KO: "/assets/auth/login/ko.png"
};

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.39a4.61 4.61 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.97-4.33 2.97-7.37Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.91v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.51l3.35-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z"
      />
    </svg>
  );
}

export function AuthModal({
  open,
  supabase,
  character,
  onClose
}: AuthModalProps) {
  const { language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;
  const extra =
    AUTH_EXTRA_COPY[language] ?? AUTH_EXTRA_COPY.EN;
  const tools =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;
  const generalImage =
    GENERAL_LOGIN_IMAGE_BY_LANGUAGE[language] ??
    GENERAL_LOGIN_IMAGE_BY_LANGUAGE.EN;
  const characterMode = Boolean(character);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotNotice, setForgotNotice] = useState("");

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (forgotOpen) {
        if (!forgotLoading) {
          setForgotOpen(false);
        }
        return;
      }

      if (!loading) {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () =>
      window.removeEventListener("keydown", closeOnEscape);
  }, [
    forgotLoading,
    forgotOpen,
    loading,
    onClose,
    open
  ]);

  useEffect(() => {
    if (!open) {
      setError("");
      setNotice("");
      setLoading(false);
      setForgotOpen(false);
      setForgotEmail("");
      setForgotError("");
      setForgotNotice("");
      setForgotLoading(false);
    }
  }, [open]);

  async function handleEmailContinue() {
    if (!supabase) {
      setError(copy.loginNotConfigured);
      return;
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError(copy.enterEmailPassword);
      return;
    }

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const signIn = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (!signIn.error && signIn.data.session) {
        onClose();
        return;
      }

      const signUp = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.href
        }
      });

      if (signUp.error) {
        setError(
          localizedErrorMessage(
            signUp.error.message,
            language,
            undefined,
            "signup"
          )
        );
        return;
      }

      if (!signUp.data.session) {
        setNotice(copy.checkEmail);
        return;
      }

      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleContinue() {
    if (!supabase) {
      setError(copy.loginNotConfigured);
      return;
    }

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.hash = "";

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: returnUrl.toString(),
            queryParams: {
              prompt: "select_account"
            }
          }
        });

      if (oauthError) {
        setError(
          localizedErrorMessage(
            oauthError.message,
            language,
            extra.googleFailed,
            "google"
          )
        );
        setLoading(false);
      }
    } catch {
      setError(extra.googleFailed);
      setLoading(false);
    }
  }

  function openForgotPassword() {
    setForgotEmail(email.trim());
    setForgotError("");
    setForgotNotice("");
    setForgotOpen(true);
  }

  async function sendPasswordReset() {
    const normalizedEmail = forgotEmail.trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setForgotError(extra.invalidEmail);
      setForgotNotice("");
      return;
    }

    setForgotLoading(true);
    setForgotError("");
    setForgotNotice("");

    try {
      const response = await fetch(
        "/api/auth/request-password-reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: normalizedEmail
          })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "ACCOUNT_NOT_FOUND") {
          throw new Error(extra.accountNotFound);
        }

        if (payload?.error === "INVALID_EMAIL") {
          throw new Error(extra.invalidEmail);
        }

        throw new Error(extra.resetFailed);
      }

      setForgotNotice(extra.resetSent);
    } catch (resetError) {
      setForgotError(
        resetError instanceof Error
          ? resetError.message
          : extra.resetFailed
      );
    } finally {
      setForgotLoading(false);
    }
  }

  if (!open) return null;

  const form = (
    <div
      className={`flex flex-col justify-center p-6 md:p-9 ${
        characterMode ? "order-2" : "order-2 md:order-1"
      }`}
    >
      <p className="text-center font-display text-3xl font-bold text-bond-rose drop-shadow-[0_0_14px_rgba(255,92,168,0.28)]">
        {copy.authTitle}
      </p>

      <div className="mt-8 space-y-3">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleEmailContinue();
            }
          }}
          type="email"
          autoComplete="email"
          placeholder={copy.email}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-bond-muted focus:border-bond-rose/70"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleEmailContinue();
            }
          }}
          type="password"
          autoComplete="current-password"
          placeholder={copy.password}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-bond-muted focus:border-bond-rose/70"
        />
        <button
          type="button"
          onClick={() => void handleEmailContinue()}
          disabled={loading}
          className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? copy.oneMoment : copy.continueWithEmail}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-bond-muted">
          {extra.or}
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        type="button"
        onClick={() => void handleGoogleContinue()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleMark />
        {extra.continueWithGoogle}
      </button>

      <p className="mt-5 text-center text-[11px] leading-5 text-bond-muted">
        {copy.legalPrefix}{" "}
        <Link
          href="/legal#terms"
          className="font-semibold text-bond-rose hover:underline"
        >
          {copy.termsOfUse}
        </Link>{" "}
        {copy.and}{" "}
        <Link
          href="/legal#privacy"
          className="font-semibold text-bond-rose hover:underline"
        >
          {copy.privacyPolicy}
        </Link>
        .
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-4 rounded-xl border border-bond-gold/20 bg-bond-gold/10 px-4 py-3 text-sm text-bond-gold">
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={openForgotPassword}
        disabled={loading}
        className="mt-5 text-center text-sm font-bold text-bond-rose transition hover:text-white hover:underline disabled:opacity-50"
      >
        {extra.forgotPassword}
      </button>
    </div>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (
            event.target === event.currentTarget &&
            !loading &&
            !forgotOpen
          ) {
            onClose();
          }
        }}
      >
        <div
          className={`relative grid w-full overflow-hidden rounded-[2rem] border-2 border-bond-rose/70 bg-bond-card shadow-[0_0_42px_rgba(255,92,168,0.30)] ${
            characterMode
              ? "max-w-3xl md:grid-cols-[0.95fr_1.05fr]"
              : "max-w-4xl md:grid-cols-[1.05fr_0.95fr]"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading || forgotOpen}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 text-bond-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={copy.close}
          >
            <X size={18} />
          </button>

          {characterMode && character ? (
            <>
              <div className="relative order-1 min-h-[360px] overflow-hidden bg-black">
                <img
                  src={character.image}
                  alt={character.name}
                  className="h-full min-h-[360px] w-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 flex justify-center bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pb-5 pt-16">
                  <p className="max-w-[88%] text-center text-[14px] font-semibold leading-5 text-bond-rose drop-shadow-[0_0_12px_rgba(255,92,168,0.65)]">
                    {tools.characterLoginMessage}
                  </p>
                </div>
              </div>
              {form}
            </>
          ) : (
            <>
              {form}
              <div className="order-1 flex max-h-[42vh] min-h-[300px] items-center justify-center overflow-hidden bg-black md:order-2 md:max-h-[86vh] md:min-h-[620px]">
                <img
                  key={generalImage}
                  src={generalImage}
                  alt={copy.authImageAlt}
                  className="h-full w-full object-contain"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {forgotOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !forgotLoading
            ) {
              setForgotOpen(false);
            }
          }}
        >
          <div className="relative my-auto w-full max-w-md rounded-[2rem] border border-bond-rose/65 bg-bond-card p-6 shadow-[0_0_42px_rgba(255,92,168,0.28)] md:p-8">
            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              disabled={forgotLoading}
              className="absolute right-4 top-4 rounded-full bg-black/45 p-2 text-bond-muted transition hover:text-white disabled:opacity-50"
              aria-label={extra.close}
            >
              <X size={18} />
            </button>

            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
              <KeyRound size={24} />
            </span>

            <h2 className="mt-5 pr-10 font-display text-3xl font-bold text-bond-rose">
              {extra.forgotTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-bond-muted">
              {extra.forgotDescription}
            </p>

            <div className="mt-6 space-y-3">
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) =>
                  setForgotEmail(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void sendPasswordReset();
                  }
                }}
                autoComplete="email"
                placeholder={extra.resetEmail}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-bond-muted focus:border-bond-rose/70"
              />
              <button
                type="button"
                onClick={() => void sendPasswordReset()}
                disabled={
                  forgotLoading || !forgotEmail.trim()
                }
                className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {forgotLoading
                  ? extra.sendingReset
                  : extra.sendResetLink}
              </button>
            </div>

            {forgotError && (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {forgotError}
              </p>
            )}

            {forgotNotice && (
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {forgotNotice}
              </p>
            )}

            <button
              type="button"
              onClick={() => setForgotOpen(false)}
              disabled={forgotLoading}
              className="mt-4 w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white transition hover:border-bond-rose/40 disabled:opacity-50"
            >
              {extra.cancel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
