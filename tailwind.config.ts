import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /**
       * Palette derived from the Gully logo mark:
       * charcoal field · cream stumps · gold bails.
       */
      colors: {
        bg: "#faf8f4", // warm paper
        surface: "#ffffff",
        ink: "#18181b", // logo field — headings + primary actions
        muted: "#6f6a63",
        // Darkened from #a9a49b (~2.3:1 on bg — unreadable in sunlight) to
        // clear WCAG AA at ~4.6:1. faint is still the lightest *text* colour;
        // for hairlines and decoration use `line`, not faint.
        faint: "#767066",
        line: "#eae4d9", // warm hairline
        accent: {
          DEFAULT: "#f0b429", // logo gold — fills, indicators
          soft: "#fdf4de",
          deep: "#8a5a0b", // gold text on light surfaces
        },
        danger: {
          DEFAULT: "#c0392b",
          soft: "#fdf1ef",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(24, 24, 27, 0.04), 0 4px 16px rgba(24, 24, 27, 0.04)",
        lift: "0 2px 4px rgba(24, 24, 27, 0.06), 0 12px 32px rgba(24, 24, 27, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
