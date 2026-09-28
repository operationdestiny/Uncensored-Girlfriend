import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bond: {
          bg: "#0B0B12",
          card: "#151522",
          raised: "#1D1B2E",
          violet: "#8B5CF6",
          rose: "#F472B6",
          gold: "#FBBF24",
          text: "#F8FAFC",
          muted: "#A1A1AA",
          line: "#2D2A3D"
        }
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 80px rgba(139, 92, 246, 0.18)",
        rose: "0 0 80px rgba(244, 114, 182, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
