/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#f9f9f9",
        raisin:   "#1A1A1A",
        salmon:   "#FF746D",
        "deep-red": "#a93533",
        surface:  "#F7F5F2",
      },
      fontFamily: {
        sans: ['"Work Sans"', "sans-serif"],
        display: ['"Work Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
