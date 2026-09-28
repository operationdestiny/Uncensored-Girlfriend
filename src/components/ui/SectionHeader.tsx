export function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-bond-rose">{eyebrow}</p>}
      <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">{title}</h2>
      {description && <p className="mt-4 text-bond-muted md:text-lg">{description}</p>}
    </div>
  );
}
