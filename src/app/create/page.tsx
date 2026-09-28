import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { LockedCreateForm } from "@/components/create/LockedCreateForm";
import { Heart, Sparkles, WandSparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Create Your Girlfriend | Uncensored Girlfriend",
  description: "Design your own AI companion's name, look, personality, and story.",
  alternates: { canonical: "/create" },
  openGraph: { title: "Create Your Girlfriend", siteName: "Uncensored Girlfriend", url: "/create" }
};

export default function CreatePage() {
  return <AppShell><main className="ug-create-page">
    <div className="ug-create-header"><div className="ug-kicker"><Sparkles size={15}/> MAKE IT YOURS</div><h1>Create Your <em>Girlfriend</em></h1><p>Imagine her personality, choose her look, and bring your story to life.</p></div>
    <div className="ug-create-intro"><div><WandSparkles size={24}/><span>Appearance & personality</span></div><div><Heart size={23}/><span>Your opening story</span></div><div><Sparkles size={23}/><span>A unique connection</span></div></div>
    <div className="ug-create-wrap"><LockedCreateForm /></div>
  </main></AppShell>;
}
