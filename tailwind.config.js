/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",  // <- scan all JS/TS/JSX/TSX files inside src
    "./public/index.html",          // <- optional: scan index.html
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
