import { Brain, MessageCircleHeart, ScrollText, ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

const items = [
  {
    icon: Brain,
    title: "Ever Memory™",
    body: "Companions remember facts, promises, emotional shifts, open threads, and relationship state."
  },
  {
    icon: ScrollText,
    title: "Story So Far",
    body: "Old messages are compressed into clean summaries so the story does not reset."
  },
  {
    icon: MessageCircleHeart,
    title: "Cinematic Conversations",
    body: "Replies combine dialogue, action, emotion, and story movement instead of generic chatbot talk."
  },
  {
    icon: ShieldCheck,
    title: "Premium Companions",
    body: "Creators must fill structured companion fields so public companions stay high quality."
  }
];

export function MemorySystem() {
  return (
    <section className="py-16">
      <div className="bond-container">
        <SectionHeader
          eyebrow="The difference"
          title="Not just chat. A bond that continues."
          description="EverBond is designed around what users actually want: memory, consistency, and loyalty."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="bond-card rounded-[2rem] p-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-bond-violet/15 text-bond-violet">
                  <Icon size={22} />
                </div>
                <h3 className="font-display text-xl font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-bond-muted">{item.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
