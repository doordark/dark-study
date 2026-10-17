/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  // class 模式才允许 colorScheme.set() 手动切换深浅色（media 模式会抛错）
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // HyperOS 4 沉浸式暗色基底
        ink: {
          950: "#090D16",
          900: "#0F172A",
          800: "#16203A",
          700: "#1E293B",
        },
      },
      borderRadius: {
        squircle: "28px",
      },
      boxShadow: {
        glow: "0 0 24px rgba(56, 189, 248, 0.35)",
      },
    },
  },
  plugins: [],
};
