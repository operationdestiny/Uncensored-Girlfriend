import type { Metadata } from "next";
import Link from "next/link";
import { FileWarning, Heart } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Legal Documents | Uncensored Girlfriend",
  description: "Legal documentation is being prepared for the new business.",
  robots: { index: false, follow: false }
};
export default function LegalPage(){return <AppShell><main className="ug-legal-preview">
  <FileWarning size={37}/><h1>Legal documents are being prepared</h1>
  <p>This is a development preview of Uncensored Girlfriend. The old EverBond LLC policies do not automatically apply to a new business. New Terms of Service, Privacy Policy, refund rules, adult-safety requirements, and provider disclosures must be reviewed and published before launch.</p>
  <div><Link href="/contact" className="ug-button-outline">Contact <Heart size={16}/></Link><Link href="/" className="ug-button-primary">Back home</Link></div>
</main></AppShell>}
