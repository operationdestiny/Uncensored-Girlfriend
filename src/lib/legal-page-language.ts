import type { LanguageCode } from "@/lib/site-language";
/** Legacy compatibility type. Old EverBond LLC policies must never be served by the new brand. */
export type LegalEmailParagraph = { prefix: string; email: string; suffix?: string };
export type LegalSection = { id: string; title: string; paragraphs: string[]; emailParagraph?: LegalEmailParagraph };
export type DmcaAgentCopy = { title: string; department: string; organization: string; addressLine1: string; addressLine2: string; phoneLabel: string; phone: string; emailLabel: string; email: string };
export type LegalPageCopy = { label: string; title: string; contents: string; controllingLanguage: string; sections: LegalSection[]; dmcaAgent: DmcaAgentCopy };
const placeholder: LegalPageCopy = {
  label: "Uncensored Girlfriend — Legal (Development Only)",
  title: "Legal documents are being prepared",
  contents: "Not yet published",
  controllingLanguage: "This development preview is not accepting users or payments.",
  sections: [{id:"pending", title:"New platform documentation required", paragraphs:["Publish independently reviewed Terms, Privacy Policy, adult-safety rules, billing/refund policies and provider disclosures before launch."]}],
  dmcaAgent: {title:"Not configured",department:"",organization:"",addressLine1:"",addressLine2:"",phoneLabel:"",phone:"",emailLabel:"",email:""}
};
export const LEGAL_PAGE_COPY: Record<LanguageCode, LegalPageCopy> = {
  EN: placeholder, ES: placeholder, FR: placeholder, DE: placeholder, JA: placeholder, KO: placeholder
};
