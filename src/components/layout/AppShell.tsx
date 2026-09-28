"use client";

import { useState } from "react";
import "@/lib/evercoin-copy-overrides";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ChatLayoutCleanup } from "@/components/chat/ChatLayoutCleanup";
import { ChatMediaBridge } from "@/components/media/ChatMediaBridge";
import { LocalizedDocumentMetadata } from "@/components/layout/LocalizedDocumentMetadata";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { NavBar } from "@/components/layout/NavBar";
import { ProviderOutageBanner } from "@/components/layout/ProviderOutageBanner";

/** New full-width shell. Original backend/auth/chat bridges are preserved. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <AuthProvider>
      <LocalizedDocumentMetadata />
      <ChatLayoutCleanup />
      <ChatMediaBridge />
      <div className="ug-shell">
        <NavBar onOpenMobileMenu={() => setMobileMenuOpen(true)} mobileMenuOpen={mobileMenuOpen} />
        <MobileNavigation open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <ProviderOutageBanner />
        <div className="ug-main">{children}</div>
      </div>
    </AuthProvider>
  );
}
