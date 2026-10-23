import type { MetadataRoute } from "next";

/** Lets phones and computers install Life OS as an app with its own icon and window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life OS",
    short_name: "Life OS",
    description: "Your personal operating system: priorities, plans, progress and reflection in one place.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8f6",
    theme_color: "#1f2128",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
