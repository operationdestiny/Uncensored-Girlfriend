import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PartnerTrafficEnginePanel } from "@/components/admin/PartnerTrafficEnginePanel";

export default function MoneyLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <PartnerTrafficEnginePanel />
    </AuthProvider>
  );
}
