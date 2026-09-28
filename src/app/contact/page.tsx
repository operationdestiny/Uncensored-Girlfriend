"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Heart, Lightbulb, Mail, MessageCircle, Sparkles } from "lucide-react";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";
const subjects = [
  { icon: MessageCircle, title: "General support", body: "Questions about your account, purchases, or companions." },
  { icon: Lightbulb, title: "Feature ideas", body: "Tell us what you'd like to see next." },
  { icon: Heart, title: "Report an issue", body: "Help us make your experience better." }
];
export default function ContactPage(){return <AppShell><main className="ug-contact-page">
  <p className="ug-kicker"><Sparkles size={15}/> WE'RE HERE TO HELP</p>
  <h1>Let's <em>talk.</em></h1><p>Questions, ideas, or feedback? We'd love to hear from you.</p>
  <section className="ug-contact-card"><Mail size={34}/><div><h2>Get in touch</h2>{SUPPORT_EMAIL ?
    <a href={`mailto:${SUPPORT_EMAIL}`} className="ug-contact-email">{SUPPORT_EMAIL}</a> :
    <p className="ug-contact-pending">Support mailbox not configured for this preview. Set NEXT_PUBLIC_SUPPORT_EMAIL to your new address.</p>
  }</div></section>
  <section className="ug-contact-topics">{subjects.map(({icon:Icon,title,body})=><article key={title}><Icon size={25}/><h3>{title}</h3><p>{body}</p></article>)}</section>
</main></AppShell>}
