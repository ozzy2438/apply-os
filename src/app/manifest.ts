import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Apply OS",
    short_name: "Apply OS",
    description: "Personal career decision engine powered by TypeSafe AI (Jev).",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d0c",
    theme_color: "#d4a017",
  };
}
