"use client";

/** Brand-safe fallback used by older pages that still request a banner. */
type BannerKind = "discover" | "pricing" | "create";
type Props = { banner: BannerKind; alt: string; className?: string; draggable?: boolean };
const titles: Record<BannerKind, string> = {
  discover: "Find your next connection",
  pricing: "KissCoins",
  create: "Create your girlfriend"
};
const subtitles: Record<BannerKind, string> = {
  discover: "Your companion. Your imagination.",
  pricing: "Credits for chat, gifts, media and more",
  create: "A personality and story made for you"
};
export function LocalizedBannerImage({ banner, alt, className, draggable }: Props) {
  return (
    <div role="img" aria-label={alt} draggable={draggable}
      className={`relative isolate flex min-h-[165px] w-full items-center overflow-hidden rounded-3xl border border-[#ffb5d5]/20 bg-[#141018] px-6 py-6 sm:min-h-[220px] sm:px-12 ${className ?? ""}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#ff4f9a]/20 blur-3xl" />
      <div className="relative z-10 max-w-[70%]">
        <p className="text-xs font-bold uppercase tracking-[.26em] text-[#ffb5d5]">Uncensored Girlfriend</p>
        <p className="mt-2 text-2xl font-extrabold text-white sm:text-4xl">{titles[banner]}</p>
        <p className="mt-3 text-sm text-[#d3b9c7] sm:text-base">{subtitles[banner]}</p>
      </div>
      <img src={banner === "pricing" ? "/ug-lips-logo.svg" : "/ug-hero-portrait.webp"} alt="" aria-hidden="true"
        className={banner === "pricing" ? "absolute right-5 top-1/2 h-20 w-20 -translate-y-1/2 sm:h-28 sm:w-28" : "absolute right-0 top-0 h-full w-1/3 object-cover object-top opacity-80 [mask-image:linear-gradient(to_right,transparent,black)]"} />
    </div>
  );
}
