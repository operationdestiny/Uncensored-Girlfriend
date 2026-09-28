import { AppShell } from "@/components/layout/AppShell";
import { EverShopClient } from "@/components/evershop/EverShopClient";

export default async function EverShopPage({
  searchParams
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const params = await searchParams;
  const shoppingFor =
    typeof params.for === "string" ? params.for.slice(0, 80) : "";

  return (
    <AppShell>
      <EverShopClient shoppingFor={shoppingFor} />
    </AppShell>
  );
}
