"use client";

import Link from "next/link";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";

export function CreatorLink({
  username,
  className = ""
}: {
  username: string;
  className?: string;
}) {
  const { language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;
  const cleanUsername = username.trim();

  if (!cleanUsername) return null;

  return (
    <Link
      href={`/creator/${encodeURIComponent(cleanUsername.toLowerCase())}`}
      className={`font-semibold text-bond-rose transition hover:text-white hover:underline ${className}`}
    >
      {copy.createdBy} @{cleanUsername}
    </Link>
  );
}
