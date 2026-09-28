import { redirect } from "next/navigation";
/** Backward-compatible old URL, without publishing the previous company's sales page. */
export default function LegacyWhyPage(){redirect("/why-choose-us");}
