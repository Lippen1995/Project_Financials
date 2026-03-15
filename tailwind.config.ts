import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0E1B1E",
        mist: "#E7EEF0",
        tide: "#0F4C5C",
        sand: "#F8F4EC",
        ember: "#C06C3E",
        moss: "#2D6A4F"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 76, 92, 0.12)"
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(192,108,62,0.18), transparent 26%), radial-gradient(circle at top right, rgba(15,76,92,0.18), transparent 28%), linear-gradient(180deg, rgba(248,244,236,0.98), rgba(231,238,240,0.98))"
      }
    }
  },
  plugins: []
};

export default config;