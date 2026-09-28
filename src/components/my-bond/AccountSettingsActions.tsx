"use client";

import {
  AlertTriangle,
  KeyRound,
  Mail,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getSupabaseBrowserClient
} from "@/lib/supabase/browser";
import {
  useSiteLanguage,
  type LanguageCode
} from "@/lib/site-language";
import {
  FINAL_LOCALIZATION_COPY,
  localizedErrorMessage
} from "@/lib/final-localization-language";

type Mode = "email" | "password" | "delete" | null;
type EmailStep =
  | "verify-current"
  | "current-sent"
  | "current-verified"
  | "new-sent"
  | "complete";

type Copy = {
  accountActions: string;
  changeEmail: string;
  changeEmailHelp: string;
  newEmail: string;
  sendEmailChange: string;
  emailChangeSent: string;
  currentEmailVerified: string;
  sendNewEmailVerification: string;
  newEmailVerificationSent: string;
  emailChangeComplete: string;
  emailVerificationFailed: string;
  emailChangeFailed: string;
  changePassword: string;
  changePasswordHelp: string;
  accountEmail: string;
  sendReset: string;
  resetSent: string;
  resetFailed: string;
  emailMismatch: string;
  deleteAccount: string;
  deleteHelp: string;
  deleteTitle: string;
  permanentWarning: string;
  deleteEverything: string;
  understandPermanent: string;
  confirmDelete: string;
  deleteFailed: string;
  cancel: string;
  working: string;
  close: string;
};

const COPY: Record<LanguageCode, Copy> = {
  EN: {
    accountActions: "Account actions",
    changeEmail: "Change email",
    changeEmailHelp:
      "Verify your current email first. After opening that link, return here to enter and verify your new email.",
    newEmail: "New email",
    sendEmailChange: "Send verification to current email",
    emailChangeSent:
      "Verification link sent to your current email. Open it to continue.",
    currentEmailVerified:
      "Current email verified. Enter the new email you want to use.",
    sendNewEmailVerification: "Send verification to new email",
    newEmailVerificationSent:
      "Verification link sent to your new email. Open it to finish changing your account email.",
    emailChangeComplete: "Your account email has been changed.",
    emailVerificationFailed:
      "The verification link is invalid or has expired. Start the email change again.",
    emailChangeFailed: "The email change could not be started.",
    changePassword: "Change password",
    changePasswordHelp:
      "Enter the email currently connected to this account. A secure password-reset link will be sent.",
    accountEmail: "Account email",
    sendReset: "Send password-reset email",
    resetSent:
      "Password-reset email sent. Open its link to choose a new password.",
    resetFailed: "The password-reset email could not be sent.",
    emailMismatch:
      "Enter the email currently connected to this account.",
    deleteAccount: "Delete account",
    deleteHelp:
      "Permanently delete this account and everything associated with it.",
    deleteTitle: "Permanently delete account?",
    permanentWarning:
      "This cannot be undone. Your companions, chats, memories, favorites, gifts, balances, purchases, profile, and account access will be deleted and cannot be recovered.",
    deleteEverything:
      "Delete everything associated with my account.",
    understandPermanent:
      "I understand this deletion is permanent.",
    confirmDelete: "Permanently delete account",
    deleteFailed: "The account could not be deleted.",
    cancel: "Cancel",
    working: "One moment...",
    close: "Close"
  },
  ES: {
    accountActions: "Acciones de la cuenta",
    changeEmail: "Cambiar correo",
    changeEmailHelp:
      "Primero verifica tu correo actual. Después de abrir ese enlace, vuelve aquí para introducir y verificar tu nuevo correo.",
    newEmail: "Nuevo correo",
    sendEmailChange: "Enviar verificación al correo actual",
    emailChangeSent:
      "Se envió un enlace de verificación a tu correo actual. Ábrelo para continuar.",
    currentEmailVerified:
      "Correo actual verificado. Introduce el nuevo correo que quieres usar.",
    sendNewEmailVerification: "Enviar verificación al nuevo correo",
    newEmailVerificationSent:
      "Se envió un enlace de verificación a tu nuevo correo. Ábrelo para terminar el cambio.",
    emailChangeComplete: "El correo de tu cuenta ha sido cambiado.",
    emailVerificationFailed:
      "El enlace de verificación no es válido o ha caducado. Inicia de nuevo el cambio de correo.",
    emailChangeFailed: "No se pudo iniciar el cambio de correo.",
    changePassword: "Cambiar contraseña",
    changePasswordHelp:
      "Introduce el correo conectado actualmente a esta cuenta. Se enviará un enlace seguro.",
    accountEmail: "Correo de la cuenta",
    sendReset: "Enviar correo para restablecer",
    resetSent:
      "Correo enviado. Abre el enlace para elegir una nueva contraseña.",
    resetFailed: "No se pudo enviar el correo de restablecimiento.",
    emailMismatch: "Introduce el correo conectado a esta cuenta.",
    deleteAccount: "Eliminar cuenta",
    deleteHelp:
      "Elimina permanentemente esta cuenta y todo lo asociado.",
    deleteTitle: "¿Eliminar la cuenta permanentemente?",
    permanentWarning:
      "Esto no se puede deshacer. Se eliminarán tus compañeros, chats, recuerdos, favoritos, regalos, saldos, compras, perfil y acceso, y no podrán recuperarse.",
    deleteEverything: "Eliminar todo lo asociado con mi cuenta.",
    understandPermanent:
      "Entiendo que esta eliminación es permanente.",
    confirmDelete: "Eliminar cuenta permanentemente",
    deleteFailed: "No se pudo eliminar la cuenta.",
    cancel: "Cancelar",
    working: "Un momento...",
    close: "Cerrar"
  },
  FR: {
    accountActions: "Actions du compte",
    changeEmail: "Changer l’e-mail",
    changeEmailHelp:
      "Vérifiez d’abord votre adresse actuelle. Après avoir ouvert ce lien, revenez ici pour saisir et vérifier la nouvelle adresse.",
    newEmail: "Nouvel e-mail",
    sendEmailChange: "Vérifier l’adresse actuelle",
    emailChangeSent:
      "Un lien de vérification a été envoyé à votre adresse actuelle. Ouvrez-le pour continuer.",
    currentEmailVerified:
      "Adresse actuelle vérifiée. Saisissez la nouvelle adresse que vous souhaitez utiliser.",
    sendNewEmailVerification: "Vérifier la nouvelle adresse",
    newEmailVerificationSent:
      "Un lien de vérification a été envoyé à votre nouvelle adresse. Ouvrez-le pour terminer le changement.",
    emailChangeComplete: "L’adresse e-mail de votre compte a été modifiée.",
    emailVerificationFailed:
      "Le lien de vérification est invalide ou expiré. Recommencez le changement d’adresse.",
    emailChangeFailed: "Le changement d’e-mail n’a pas pu démarrer.",
    changePassword: "Changer le mot de passe",
    changePasswordHelp:
      "Saisissez l’e-mail actuellement lié au compte. Un lien sécurisé sera envoyé.",
    accountEmail: "E-mail du compte",
    sendReset: "Envoyer l’e-mail de réinitialisation",
    resetSent:
      "E-mail envoyé. Ouvrez le lien pour choisir un nouveau mot de passe.",
    resetFailed: "L’e-mail de réinitialisation n’a pas pu être envoyé.",
    emailMismatch: "Saisissez l’e-mail actuellement lié au compte.",
    deleteAccount: "Supprimer le compte",
    deleteHelp:
      "Supprime définitivement ce compte et tout ce qui lui est associé.",
    deleteTitle: "Supprimer définitivement le compte ?",
    permanentWarning:
      "Cette action est irréversible. Vos compagnons, discussions, souvenirs, favoris, cadeaux, soldes, achats, profil et accès seront supprimés sans possibilité de récupération.",
    deleteEverything: "Supprimer tout ce qui est associé à mon compte.",
    understandPermanent:
      "Je comprends que cette suppression est définitive.",
    confirmDelete: "Supprimer définitivement le compte",
    deleteFailed: "Le compte n’a pas pu être supprimé.",
    cancel: "Annuler",
    working: "Un instant...",
    close: "Fermer"
  },
  DE: {
    accountActions: "Kontoaktionen",
    changeEmail: "E-Mail ändern",
    changeEmailHelp:
      "Bestätige zuerst deine aktuelle E-Mail-Adresse. Kehre danach hierher zurück, um die neue Adresse einzugeben und zu bestätigen.",
    newEmail: "Neue E-Mail",
    sendEmailChange: "Aktuelle E-Mail bestätigen",
    emailChangeSent:
      "Ein Bestätigungslink wurde an deine aktuelle E-Mail gesendet. Öffne ihn, um fortzufahren.",
    currentEmailVerified:
      "Aktuelle E-Mail bestätigt. Gib die neue E-Mail-Adresse ein.",
    sendNewEmailVerification: "Neue E-Mail bestätigen",
    newEmailVerificationSent:
      "Ein Bestätigungslink wurde an deine neue E-Mail gesendet. Öffne ihn, um die Änderung abzuschließen.",
    emailChangeComplete: "Die E-Mail-Adresse deines Kontos wurde geändert.",
    emailVerificationFailed:
      "Der Bestätigungslink ist ungültig oder abgelaufen. Starte die E-Mail-Änderung erneut.",
    emailChangeFailed: "Die E-Mail-Änderung konnte nicht gestartet werden.",
    changePassword: "Passwort ändern",
    changePasswordHelp:
      "Gib die derzeit mit dem Konto verbundene E-Mail ein. Ein sicherer Link wird gesendet.",
    accountEmail: "Konto-E-Mail",
    sendReset: "Passwort-Reset senden",
    resetSent:
      "E-Mail gesendet. Öffne den Link, um ein neues Passwort festzulegen.",
    resetFailed: "Die Passwort-E-Mail konnte nicht gesendet werden.",
    emailMismatch: "Gib die aktuell verbundene E-Mail ein.",
    deleteAccount: "Konto löschen",
    deleteHelp:
      "Dieses Konto und alle verbundenen Inhalte dauerhaft löschen.",
    deleteTitle: "Konto dauerhaft löschen?",
    permanentWarning:
      "Dies kann nicht rückgängig gemacht werden. Begleiter, Chats, Erinnerungen, Favoriten, Geschenke, Guthaben, Käufe, Profil und Kontozugang werden unwiederbringlich gelöscht.",
    deleteEverything: "Alles löschen, was mit meinem Konto verbunden ist.",
    understandPermanent:
      "Ich verstehe, dass diese Löschung dauerhaft ist.",
    confirmDelete: "Konto dauerhaft löschen",
    deleteFailed: "Das Konto konnte nicht gelöscht werden.",
    cancel: "Abbrechen",
    working: "Einen Moment...",
    close: "Schließen"
  },
  JA: {
    accountActions: "アカウント操作",
    changeEmail: "メールアドレスを変更",
    changeEmailHelp:
      "最初に現在のメールアドレスを確認してください。確認リンクを開いた後、ここに戻って新しいメールアドレスを入力し、確認します。",
    newEmail: "新しいメールアドレス",
    sendEmailChange: "現在のメールに確認リンクを送信",
    emailChangeSent:
      "現在のメールアドレスに確認リンクを送信しました。リンクを開いて続行してください。",
    currentEmailVerified:
      "現在のメールアドレスを確認しました。使用する新しいメールアドレスを入力してください。",
    sendNewEmailVerification: "新しいメールに確認リンクを送信",
    newEmailVerificationSent:
      "新しいメールアドレスに確認リンクを送信しました。リンクを開いて変更を完了してください。",
    emailChangeComplete: "アカウントのメールアドレスが変更されました。",
    emailVerificationFailed:
      "確認リンクが無効または期限切れです。メール変更を最初からやり直してください。",
    emailChangeFailed: "メール変更を開始できませんでした。",
    changePassword: "パスワードを変更",
    changePasswordHelp:
      "現在このアカウントに登録されているメールを入力してください。安全なリセットリンクを送信します。",
    accountEmail: "アカウントのメール",
    sendReset: "リセットメールを送信",
    resetSent:
      "リセットメールを送信しました。リンクを開いて新しいパスワードを設定してください。",
    resetFailed: "リセットメールを送信できませんでした。",
    emailMismatch: "現在登録されているメールを入力してください。",
    deleteAccount: "アカウントを削除",
    deleteHelp:
      "このアカウントと関連するすべてを完全に削除します。",
    deleteTitle: "アカウントを完全に削除しますか？",
    permanentWarning:
      "元に戻せません。コンパニオン、チャット、メモリー、お気に入り、ギフト、残高、購入履歴、プロフィール、アクセス権が削除され、復元できません。",
    deleteEverything: "アカウントに関連するすべてを削除する。",
    understandPermanent: "削除が永久であることを理解しました。",
    confirmDelete: "アカウントを完全に削除",
    deleteFailed: "アカウントを削除できませんでした。",
    cancel: "キャンセル",
    working: "処理中...",
    close: "閉じる"
  },
  KO: {
    accountActions: "계정 작업",
    changeEmail: "이메일 변경",
    changeEmailHelp:
      "먼저 현재 이메일을 확인하세요. 확인 링크를 연 뒤 여기로 돌아와 새 이메일을 입력하고 확인하세요.",
    newEmail: "새 이메일",
    sendEmailChange: "현재 이메일로 확인 링크 보내기",
    emailChangeSent:
      "현재 이메일로 확인 링크를 보냈습니다. 링크를 열어 계속하세요.",
    currentEmailVerified:
      "현재 이메일이 확인되었습니다. 사용할 새 이메일을 입력하세요.",
    sendNewEmailVerification: "새 이메일로 확인 링크 보내기",
    newEmailVerificationSent:
      "새 이메일로 확인 링크를 보냈습니다. 링크를 열어 변경을 완료하세요.",
    emailChangeComplete: "계정 이메일이 변경되었습니다.",
    emailVerificationFailed:
      "확인 링크가 유효하지 않거나 만료되었습니다. 이메일 변경을 다시 시작하세요.",
    emailChangeFailed: "이메일 변경을 시작할 수 없습니다.",
    changePassword: "비밀번호 변경",
    changePasswordHelp:
      "현재 계정에 연결된 이메일을 입력하세요. 안전한 재설정 링크가 전송됩니다.",
    accountEmail: "계정 이메일",
    sendReset: "비밀번호 재설정 이메일 보내기",
    resetSent:
      "재설정 이메일을 보냈습니다. 링크를 열어 새 비밀번호를 설정하세요.",
    resetFailed: "비밀번호 재설정 이메일을 보낼 수 없습니다.",
    emailMismatch: "현재 계정에 연결된 이메일을 입력하세요.",
    deleteAccount: "계정 삭제",
    deleteHelp:
      "이 계정과 연결된 모든 내용을 영구적으로 삭제합니다.",
    deleteTitle: "계정을 영구적으로 삭제할까요?",
    permanentWarning:
      "되돌릴 수 없습니다. 컴패니언, 채팅, 메모리, 즐겨찾기, 선물, 잔액, 구매 내역, 프로필과 계정 접근 권한이 삭제되며 복구할 수 없습니다.",
    deleteEverything: "내 계정과 연결된 모든 내용을 삭제합니다.",
    understandPermanent: "이 삭제가 영구적임을 이해합니다.",
    confirmDelete: "계정 영구 삭제",
    deleteFailed: "계정을 삭제할 수 없습니다.",
    cancel: "취소",
    working: "잠시만요...",
    close: "닫기"
  }
};

function isGoogleOnlySession(session: Session) {
  const providers = new Set<string>();
  const appMetadata = session.user.app_metadata;

  if (typeof appMetadata?.provider === "string") {
    providers.add(appMetadata.provider);
  }

  if (Array.isArray(appMetadata?.providers)) {
    for (const provider of appMetadata.providers) {
      if (typeof provider === "string") {
        providers.add(provider);
      }
    }
  }

  for (const identity of session.user.identities ?? []) {
    if (typeof identity.provider === "string") {
      providers.add(identity.provider);
    }
  }

  return providers.has("google") && !providers.has("email");
}

export function AccountSettingsActions({
  session,
  currentEmail
}: {
  session: Session;
  currentEmail: string;
}) {
  const { language } = useSiteLanguage();
  const copy = COPY[language] ?? COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const googleOnlyAccount = isGoogleOnlySession(session);

  const [mode, setMode] = useState<Mode>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailStep, setEmailStep] =
    useState<EmailStep>("verify-current");
  const [resetEmail, setResetEmail] = useState(currentEmail);
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setResetEmail(currentEmail);
  }, [currentEmail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("email-change");

    if (!status) return;

    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${window.location.hash}`
    );

    setMode("email");
    setError("");
    setNewEmail("");

    if (status === "current-verified") {
      setEmailStep("current-verified");
      setNotice(copy.currentEmailVerified);
      return;
    }

    if (status === "complete") {
      setEmailStep("complete");
      setNotice(copy.emailChangeComplete);
      void getSupabaseBrowserClient()?.auth.refreshSession();
      return;
    }

    setEmailStep("verify-current");
    setNotice("");
    setError(copy.emailVerificationFailed);
  }, [
    copy.currentEmailVerified,
    copy.emailChangeComplete,
    copy.emailVerificationFailed
  ]);

  useEffect(() => {
    if (!mode) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        closeModal();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () =>
      window.removeEventListener("keydown", closeOnEscape);
  }, [loading, mode]);

  function openModal(nextMode: Exclude<Mode, null>) {
    if (nextMode === "password" && googleOnlyAccount) {
      return;
    }

    setMode(nextMode);
    setError("");
    setNotice("");
    setConfirmedDelete(false);

    if (nextMode === "email") {
      setEmailStep("verify-current");
      setNewEmail("");
    }

    if (nextMode === "password") {
      setResetEmail(currentEmail);
    }
  }

  function closeModal() {
    if (loading) return;
    setMode(null);
    setError("");
    setNotice("");
    setEmailStep("verify-current");
    setNewEmail("");
    setConfirmedDelete(false);
  }

  async function sendCurrentEmailVerification() {
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/account/change-email/start",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ language })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(copy.emailChangeFailed);
      }

      setEmailStep("current-sent");
      setNotice(copy.emailChangeSent);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.emailChangeFailed
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendNewEmailVerification() {
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/account/change-email",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            newEmail,
            language
          })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "CURRENT_EMAIL_NOT_VERIFIED") {
          setEmailStep("verify-current");
          throw new Error(copy.emailVerificationFailed);
        }

        throw new Error(copy.emailChangeFailed);
      }

      setEmailStep("new-sent");
      setNotice(copy.newEmailVerificationSent);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.emailChangeFailed
      );
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (loading || googleOnlyAccount) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/account/request-password-reset",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email: resetEmail })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "EMAIL_MISMATCH") {
          throw new Error(copy.emailMismatch);
        }

        throw new Error(copy.resetFailed);
      }

      setNotice(copy.resetSent);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.resetFailed
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (loading || !confirmedDelete) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.deleteFailed,
            "accountDelete"
          )
        );
      }

      await getSupabaseBrowserClient()?.auth.signOut();
      window.location.assign("/");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.deleteFailed
      );
      setLoading(false);
    }
  }

  return (
    <>
      <div className="border-t border-white/10 py-5">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-bond-rose">
          {copy.accountActions}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => openModal("email")}
            className="rounded-2xl border border-bond-rose/35 bg-bond-rose/[0.06] p-4 text-left transition hover:bg-bond-rose/[0.12]"
          >
            <Mail size={20} className="text-bond-rose" />
            <span className="mt-3 block font-bold text-white">
              {copy.changeEmail}
            </span>
          </button>

          <div
            className="group relative outline-none"
            tabIndex={googleOnlyAccount ? 0 : undefined}
          >
            <button
              type="button"
              onClick={() => openModal("password")}
              disabled={googleOnlyAccount}
              aria-describedby={
                googleOnlyAccount
                  ? "google-password-disabled-tooltip"
                  : undefined
              }
              className={`h-full w-full rounded-2xl border border-bond-rose/35 bg-bond-rose/[0.06] p-4 text-left transition ${
                googleOnlyAccount
                  ? "cursor-not-allowed opacity-45"
                  : "hover:bg-bond-rose/[0.12]"
              }`}
            >
              <KeyRound
                size={20}
                className="text-bond-rose"
              />
              <span className="mt-3 block font-bold text-white">
                {copy.changePassword}
              </span>
            </button>

            {googleOnlyAccount && (
              <span
                id="google-password-disabled-tooltip"
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[190px] -translate-x-1/2 rounded-md border border-white/10 bg-black/95 px-2 py-1 text-center text-[10px] leading-4 text-white/75 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
              >
                {finalCopy.googlePasswordTooltip}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => openModal("delete")}
            className="rounded-2xl border border-red-400/35 bg-red-500/[0.05] p-4 text-left transition hover:bg-red-500/[0.10]"
          >
            <Trash2 size={20} className="text-red-300" />
            <span className="mt-3 block font-bold text-red-100">
              {copy.deleteAccount}
            </span>
          </button>
        </div>
      </div>

      {mode && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !loading
            ) {
              closeModal();
            }
          }}
        >
          <div className="relative my-auto w-full max-w-lg rounded-[2rem] border border-bond-rose/60 bg-bond-card p-6 shadow-[0_0_42px_rgba(255,92,168,0.25)] md:p-8">
            <button
              type="button"
              onClick={closeModal}
              disabled={loading}
              className="absolute right-4 top-4 rounded-full bg-black/45 p-2 text-bond-muted transition hover:text-white disabled:opacity-50"
              aria-label={copy.close}
            >
              <X size={18} />
            </button>

            {mode === "email" && (
              <>
                <h2 className="pr-10 font-display text-3xl font-bold text-bond-rose">
                  {copy.changeEmail}
                </h2>

                {emailStep === "complete" ? (
                  <p className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {copy.emailChangeComplete}
                  </p>
                ) : emailStep === "current-verified" ||
                  emailStep === "new-sent" ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-bond-muted">
                      {copy.currentEmailVerified}
                    </p>
                    <div className="mt-6 space-y-3">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(event) =>
                          setNewEmail(event.target.value)
                        }
                        autoComplete="email"
                        placeholder={copy.newEmail}
                        disabled={emailStep === "new-sent"}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-bond-rose/70 disabled:opacity-55"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void sendNewEmailVerification()
                        }
                        disabled={
                          loading ||
                          emailStep === "new-sent" ||
                          !newEmail.trim()
                        }
                        className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {loading
                          ? copy.working
                          : copy.sendNewEmailVerification}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-bond-muted">
                      {copy.changeEmailHelp}
                    </p>
                    <div className="mt-6 space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-bond-muted">
                          {copy.accountEmail}
                        </p>
                        <p className="mt-1 break-all text-sm font-semibold text-white">
                          {currentEmail}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void sendCurrentEmailVerification()
                        }
                        disabled={
                          loading ||
                          emailStep === "current-sent"
                        }
                        className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {loading
                          ? copy.working
                          : copy.sendEmailChange}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "password" && (
              <>
                <h2 className="pr-10 font-display text-3xl font-bold text-bond-rose">
                  {copy.changePassword}
                </h2>
                <p className="mt-3 text-sm leading-6 text-bond-muted">
                  {copy.changePasswordHelp}
                </p>
                <div className="mt-6 space-y-3">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) =>
                      setResetEmail(event.target.value)
                    }
                    autoComplete="email"
                    placeholder={copy.accountEmail}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-bond-rose/70"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void requestPasswordReset()
                    }
                    disabled={loading || !resetEmail.trim()}
                    className="bond-pink-button w-full rounded-xl bg-bond-rose px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {loading ? copy.working : copy.sendReset}
                  </button>
                </div>
              </>
            )}

            {mode === "delete" && (
              <>
                <div className="flex items-start gap-4 pr-10">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                    <AlertTriangle size={24} />
                  </span>
                  <div>
                    <h2 className="font-display text-3xl font-bold text-red-200">
                      {copy.deleteTitle}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-red-100/80">
                      {copy.permanentWarning}
                    </p>
                  </div>
                </div>

                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/[0.06] p-4">
                  <input
                    type="checkbox"
                    checked={confirmedDelete}
                    onChange={(event) =>
                      setConfirmedDelete(
                        event.target.checked
                      )
                    }
                    className="mt-1 h-4 w-4 accent-red-500"
                  />
                  <span className="text-sm leading-6 text-red-100">
                    {copy.deleteEverything}
                    <strong className="mt-1 block">
                      {copy.understandPermanent}
                    </strong>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => void deleteAccount()}
                  disabled={loading || !confirmedDelete}
                  className="mt-5 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {loading
                    ? copy.working
                    : copy.confirmDelete}
                </button>
              </>
            )}

            {error && (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            )}

            {notice && (
              <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {notice}
              </p>
            )}

            <button
              type="button"
              onClick={closeModal}
              disabled={loading}
              className="mt-4 w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white transition hover:border-bond-rose/40 disabled:opacity-50"
            >
              {copy.cancel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
