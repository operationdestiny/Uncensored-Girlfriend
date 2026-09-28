import { SearchLandingPage } from "@/components/seo/SearchLandingPage";
import { buildSeoLandingMetadata } from "@/lib/seo-landing-pages";

export const metadata = buildSeoLandingMetadata("private-ai-chat");

export default function Page() {
  return <SearchLandingPage slug="private-ai-chat" />;
}
