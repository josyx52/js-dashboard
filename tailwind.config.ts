import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0C10",
        surface: "#111217",
        border: "rgba(244,244,242,0.12)",
        muted: "#8A8C94",
        accent: "#F54E00", // laranja de marca, estilo PostHog
        deus: "#8B5CF6",
        saude: "#22C55E",
        familia: "#F59E0B",
        estudo: "#3B82F6",
        negocio: "#EC4899",
        trabalho: "#22D3D0",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
