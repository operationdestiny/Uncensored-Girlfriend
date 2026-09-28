import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Uncensored Girlfriend",
    short_name: "Uncensored Girlfriend",
    description:
      "Uncensored Girlfriend AI companions, chats, memories, images, videos, gifts, and your account in one installable app.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#050507",
    prefer_related_applications: false,
    icons: [
      {
        src: "/pwa/ug-lips-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/pwa/ug-lips-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/pwa/ug-lips-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
