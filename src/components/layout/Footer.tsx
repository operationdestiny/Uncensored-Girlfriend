import Link from "next/link";

const links = [
  { href: "/characters", label: "Companions" },
  { href: "/why-choose-us", label: "Why Choose Us" },
  { href: "/coins", label: "KissCoins" },
  { href: "/safety", label: "Safety" },
  { href: "/legal", label: "Legal" }
];

export function Footer() {
  return (
    <footer className="border-t border-white/5 px-5 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-bond-muted">Copyright © 2026 <span className="text-bond-rose">Uncensored Girlfriend</span> All rights reserved.</p>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => <Link key={link.href} href={link.href} className="text-sm text-bond-muted hover:text-white">{link.label}</Link>)}
        </div>
      </div>
    </footer>
  );
}
