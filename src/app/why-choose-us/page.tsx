import type { Metadata } from "next";
import Link from "next/link";
import { Brain, Heart, Image as ImageIcon, Gift, MessagesSquare, Mic2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
export const metadata: Metadata = {
  title: "Why Choose Us | Uncensored Girlfriend",
  description: "Create unique AI companions with chat, memory, images, gifts, and voice features.",
  alternates: { canonical: "/why-choose-us" }
};
const features=[
  {icon:MessagesSquare,title:"Make every conversation yours",description:"Private chats and roleplay shaped by the characters you choose."},
  {icon:Brain,title:"Memory",description:"Build on shared conversations using the platform's companion memory features."},
  {icon:ImageIcon,title:"Images & video",description:"Unlock generated companion media when your providers are configured."},
  {icon:Mic2,title:"Voice",description:"Connect through live calls and voice features when available."},
  {icon:Gift,title:"Gift Shop",description:"Send virtual gifts to the companions you love chatting with."},
  {icon:Heart,title:"Create your own",description:"Customize a new companion's appearance, personality, and story."}
];
export default function WhyChooseUsPage(){return <AppShell><main className="ug-why-page"><div className="ug-create-header"><p className="ug-kicker"><Sparkles size={15}/> MADE FOR YOUR IMAGINATION</p><h1>Why choose <em>us?</em></h1><p>More ways to make your own story, all in one place.</p></div><div className="ug-why-grid">{features.map(({icon:Icon,title,description})=><article key={title}><Icon size={27}/><h2>{title}</h2><p>{description}</p></article>)}</div><div className="ug-why-cta"><h2>Ready to find your connection?</h2><Link href="/characters" className="ug-button-primary">Explore companions <Heart size={17}/></Link></div></main></AppShell>}
