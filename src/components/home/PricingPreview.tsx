import Link from "next/link";
import { Check } from "lucide-react";
import { plans } from "@/lib/plans";

export function PricingPreview() {
  return (
    <section className="py-16">
      <div className="bond-container">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-bond-rose md:text-6xl">Simple pricing</h2>
          <p className="mt-5 text-bond-muted md:text-lg">
            No subscriptions. Your first 20 successful text messages are free; after that, 3 EC unlocks 19 messages. KissCoins also powers other paid features.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bond-card flex min-h-[430px] flex-col rounded-[2rem] p-6 ${
                plan.highlight ? "border-bond-violet/50 shadow-glow" : ""
              }`}
            >
              <p className="text-sm font-semibold text-bond-muted">{plan.name}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="font-display text-4xl font-bold">{plan.price}</span>
                {plan.period && <span className="pb-1 text-sm text-bond-muted">{plan.period}</span>}
              </div>
              <p className="mt-3 min-h-[3rem] text-sm leading-6 text-bond-muted">{plan.description}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-bond-gold" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.ctaHref}
                className="mt-auto flex justify-center rounded-full bg-bond-violet px-5 py-3 text-sm font-bold text-white transition hover:scale-[1.01]"
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
