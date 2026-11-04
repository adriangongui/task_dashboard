import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F5F2",
        line: "#E7E5DF",
        ink: "#23211E",
        muted: "#7A756C",
        hoy: "#5B5DD6",
        semana: "#22A06B",
        proyecto: "#D97757",
        sinterminar: "#D6517D",
      },
      borderRadius: {
        card: "16px",
        panel: "18px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(35, 33, 30, 0.04)",
        float: "0 24px 60px rgba(35, 33, 30, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
