import catalogData from "@/data/evershop-gifts.json";

export const EVERSHOP_CATEGORIES = [
  "all",
  "romance",
  "clothing-jewelry",
  "luxury",
  "food-treats",
  "magical"
] as const;

export type EverShopCategory = (typeof EVERSHOP_CATEGORIES)[number];
export type EverShopTier = "Common" | "Standard" | "Premium";

export type EverShopGift = {
  id: number;
  slug: string;
  category: Exclude<EverShopCategory, "all">;
  categoryLabel: string;
  title: string;
  tier: EverShopTier;
  price: number;
  description: string;
  reactionPreview: string;
  image: string;
};

const sourceGifts = catalogData as EverShopGift[];

function halfEverShopPrice(price: number) {
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error(`Invalid EverShop gift price: ${price}`);
  }

  // EverCoin wallets use whole-number balances. For odd prices, round the
  // mathematical half down so customers never pay more than half.
  return Math.max(Math.floor(price / 2), 1);
}

export const EVERSHOP_GIFTS: EverShopGift[] = sourceGifts.map((gift) => ({
  ...gift,
  price: halfEverShopPrice(gift.price)
}));

const giftById = new Map(
  EVERSHOP_GIFTS.map((gift) => [gift.id, gift] as const)
);

export function getEverShopGift(giftId: number) {
  return giftById.get(giftId) ?? null;
}
