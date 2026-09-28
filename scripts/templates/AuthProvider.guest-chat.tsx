"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/auth/AuthModal";
import styles from "@/components/auth/PhoneAuthModal.module.css";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import type { LanguageCode } from "@/lib/site-language";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AuthModalCharacter = {
  name: string;
  image: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  authReady: boolean;
  openAuthModal: () => void;
  openCharacterAuthModal: (character: AuthModalCharacter) => void;
  closeAuthModal: () => void;
  signOut: () => Promise<void>;
};

const AUTH_LEGAL_PREFIX: Record<LanguageCode, string> = {
  EN: "By continuing, you confirm that you are at least 18 years of age and agree to our",
  ES: "Al continuar, confirmas que tienes al menos 18 años y aceptas nuestros",
  FR: "En continuant, vous confirmez avoir au moins 18 ans et accepter nos",
  DE: "Wenn du fortfährst, bestätigst du, dass du mindestens 18 Jahre alt bist, und stimmst unseren",
  JA: "続行すると、18歳以上であり、以下に同意することを確認します：",
  KO: "계속하면 만 18세 이상이며 다음에 동의함을 확인합니다:"
};

for (const language of Object.keys(AUTH_LEGAL_PREFIX) as LanguageCode[]) {
  MY_BOND_COPY[language].legalPrefix = AUTH_LEGAL_PREFIX[language];
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PENDING_GUEST_CLAIM_KEY = "everbond_pending_guest_claim_v1";

function isAnonymousSession(session: Session | null) {
  return Boolean(
    session?.user &&
      (session.user as typeof session.user & { is_anonymous?: boolean })
        .is_anonymous
  );
}

async function claimPartnerAttribution(session: Session | null) {
  if (!session?.access_token || isAnonymousSession(session)) return;
  try {
    await fetch("/api/partners/claim-attribution", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store"
    });
  } catch {
    // Attribution never blocks sign-in.
  }
}

async function prepareGuestClaim(session: Session | null) {
  if (!session?.access_token || !isAnonymousSession(session)) return;
  try {
    const response = await fetch("/api/guest/claim-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && typeof payload?.claimToken === "string") {
      window.sessionStorage.setItem(PENDING_GUEST_CLAIM_KEY, payload.claimToken);
    }
  } catch {
    // A failed prefetch must not prevent the user from logging in.
  }
}

async function claimPendingGuestData(session: Session | null) {
  if (!session?.access_token || isAnonymousSession(session)) return;
  const claimToken = window.sessionStorage.getItem(PENDING_GUEST_CLAIM_KEY);
  if (!claimToken) return;

  try {
    const response = await fetch("/api/guest/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ claimToken }),
      cache: "no-store"
    });

    if (response.ok) {
      window.sessionStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
    }
  } catch {
    // Keep the token so a later auth/session event can retry within its TTL.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rawSession, setRawSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authCharacter, setAuthCharacter] = useState<AuthModalCharacter | null>(null);
  const rawSessionRef = useRef<Session | null>(null);
  const guestClaimPromiseRef = useRef<Promise<void> | null>(null);

  rawSessionRef.current = rawSession;

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session ?? null;
      rawSessionRef.current = nextSession;
      setRawSession(nextSession);
      setAuthReady(true);
      void claimPartnerAttribution(nextSession);
      if (typeof window !== "undefined") void claimPendingGuestData(nextSession);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const previous = rawSessionRef.current;
      rawSessionRef.current = nextSession;
      setRawSession(nextSession);
      setAuthReady(true);

      if (nextSession && !isAnonymousSession(nextSession)) {
        void (async () => {
          if (previous && isAnonymousSession(previous)) {
            if (!guestClaimPromiseRef.current) {
              guestClaimPromiseRef.current = prepareGuestClaim(previous);
            }
            await guestClaimPromiseRef.current.catch(() => undefined);
          }
          await claimPendingGuestData(nextSession);
          await claimPartnerAttribution(nextSession);
          guestClaimPromiseRef.current = null;
        })();

        setAuthModalOpen(false);
        setAuthCharacter(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const prepareCurrentGuest = useCallback(() => {
    const current = rawSessionRef.current;
    if (!current || !isAnonymousSession(current)) return;
    guestClaimPromiseRef.current = prepareGuestClaim(current);
  }, []);

  const openAuthModal = useCallback(() => {
    prepareCurrentGuest();
    setAuthCharacter(null);
    setAuthModalOpen(true);
  }, [prepareCurrentGuest]);

  const openCharacterAuthModal = useCallback(
    (character: AuthModalCharacter) => {
      prepareCurrentGuest();
      setAuthCharacter(character);
      setAuthModalOpen(true);
    },
    [prepareCurrentGuest]
  );

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthCharacter(null);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    rawSessionRef.current = null;
    setRawSession(null);
    setAuthModalOpen(false);
    setAuthCharacter(null);
  }, [supabase]);

  const permanentSession = isAnonymousSession(rawSession) ? null : rawSession;

  const value = useMemo<AuthContextValue>(
    () => ({
      session: permanentSession,
      user: permanentSession?.user ?? null,
      authReady,
      openAuthModal,
      openCharacterAuthModal,
      closeAuthModal,
      signOut
    }),
    [
      authReady,
      closeAuthModal,
      openAuthModal,
      openCharacterAuthModal,
      permanentSession,
      signOut
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <div className={styles.authModalScope}>
        <AuthModal
          open={authModalOpen}
          supabase={supabase}
          character={authCharacter}
          onClose={closeAuthModal}
        />
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
