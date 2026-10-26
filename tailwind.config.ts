import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hr: {
          bg: "#eaf1f8",
          primary: "#4a9eff",
          primaryDark: "#2f6fc0",
          ink: "#1f2d42",
          muted: "#7b8da0",
          line: "#e4ebf3",
          side: "#1a4b7a",
        },
      },
      boxShadow: {
        card: "0 6px 24px rgba(26, 74, 122, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
