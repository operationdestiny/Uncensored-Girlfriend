import { SearchLandingPage } from "@/components/seo/SearchLandingPage";
import { buildSeoLandingMetadata } from "@/lib/seo-landing-pages";

export const metadata = buildSeoLandingMetadata("ai-girlfriend-with-memory");

export default function Page() {
  return <SearchLandingPage slug="ai-girlfriend-with-memory" />;
}
