import type { Config } from "tailwindcss";

// Cores vem dos tokens em app/globals.css (formato "r g b" para suportar /alpha).
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        "surface-3": token("surface-3"),
        line: token("line"),
        fg: token("fg"),
        "fg-2": token("fg-2"),
        "fg-3": token("fg-3"),
        accent: token("accent"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
        violet: token("violet"),
      },
      borderRadius: {
        card: "var(--radius)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        pop: "0 12px 40px -12px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
