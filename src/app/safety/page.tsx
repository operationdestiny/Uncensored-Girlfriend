import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Heart, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
export const metadata: Metadata = {title:"Safety | Uncensored Girlfriend"};
export default function SafetyPage(){return <AppShell><main className="ug-safety-page">
  <p className="ug-kicker"><ShieldCheck size={15}/> YOUR EXPERIENCE MATTERS</p><h1>Play creatively. Stay <em>safe.</em></h1>
  <div className="ug-safety-grid">
    <article><Heart size={29}/><h2>Fictional companions</h2><p>Characters and responses are AI-generated and should not be mistaken for real people or professional advice.</p></article>
    <article><ShieldCheck size={29}/><h2>Respect boundaries</h2><p>Do not create or request illegal, exploitative, non-consensual or otherwise prohibited material. Follow the platform's published policies.</p></article>
    <article><AlertTriangle size={29}/><h2>Review before sharing</h2><p>AI-generated content can be inaccurate or unexpected. Avoid sharing private personal information.</p></article>
  </div><p className="ug-safety-contact">Need help? <Link href="/contact">Contact support</Link>.</p>
</main></AppShell>}
