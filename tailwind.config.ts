import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0C10",
        surface: "#14161B",
        border: "rgba(255,255,255,0.08)",
        muted: "rgba(244,244,242,0.45)",
        faint: "rgba(244,244,242,0.35)",
        accent: "#F54E00", // laranja de marca
        lab: "#8B7CF6", // roxo do laboratorio de integracoes
        ok: "#3DDC84", // verde de estado operacional
        deus: "#8B5CF6",
        saude: "#22C55E",
        familia: "#F59E0B",
        estudo: "#3B82F6",
        negocio: "#EC4899",
        trabalho: "#22D3D0",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

