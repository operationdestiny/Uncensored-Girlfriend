"use client";

import { usePathname } from "next/navigation";

export function ChatLayoutCleanup() {
  const pathname = usePathname();

  if (!pathname || !pathname.startsWith("/chat/")) {
    return null;
  }

  return (
    <style>{`
      .v18-main > div.grid > aside > div {
        min-height: 0;
      }

      .v18-main > div.grid > aside > div > div:first-child {
        flex: 1 1 0% !important;
        min-height: 0 !important;
        aspect-ratio: auto !important;
      }

      .v18-main > div.grid > aside > div > div:first-child > button {
        height: 100% !important;
        aspect-ratio: auto !important;
      }

      .v18-main > div.grid > aside > div > div:first-child img {
        height: 100% !important;
        width: 100% !important;
        object-fit: cover !important;
      }

      .v18-main > div.grid > aside > div > div:nth-child(2) > h1 {
        display: flex !important;
        height: 2.5rem !important;
        align-items: center !important;
        justify-content: center !important;
        padding-left: 1rem !important;
        padding-right: 1rem !important;
        font-size: 13px !important;
        line-height: 1 !important;
      }

      .v18-main > div.grid > aside > div > div:nth-child(2) > a {
        height: 2.5rem !important;
        align-items: center !important;
      }

      .v18-main > div.grid > aside > div > div:nth-child(3),
      .v18-main > div.grid > aside > div > div:nth-child(4),
      .v18-main > div.grid > aside > div > a + div {
        display: none !important;
      }
    `}</style>
  );
}
