/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "var(--c-bg)", soft: "var(--c-bg-soft)", card: "var(--c-bg-card)", hover: "var(--c-bg-hover)" },
        border: { DEFAULT: "var(--c-border)", soft: "var(--c-border-soft)" },
        primary: {
          DEFAULT: "var(--c-primary)",
          50: "var(--c-primary-50)", 100: "var(--c-primary-100)", 200: "var(--c-primary-200)",
          300: "var(--c-primary-300)", 400: "var(--c-primary-400)", 500: "var(--c-primary-500)",
          600: "var(--c-primary-600)", 700: "var(--c-primary-700)", 800: "var(--c-primary-800)", 900: "var(--c-primary-900)",
        },
        accent: {
          DEFAULT: "var(--c-accent)", 400: "var(--c-accent-400)", 500: "var(--c-accent)", 600: "var(--c-accent-600)",
        },
        warning: { DEFAULT: "var(--c-warning)", 400: "var(--c-warning-400)", 500: "var(--c-warning)", 600: "var(--c-warning-600)" },
        error: { DEFAULT: "var(--c-error)", 400: "var(--c-error-400)", 500: "var(--c-error)", 600: "var(--c-error-600)" },
        success: { DEFAULT: "var(--c-success)", 400: "var(--c-success-400)", 500: "var(--c-success)", 600: "var(--c-success-600)" },
        muted: { DEFAULT: "var(--c-muted)", soft: "var(--c-muted-soft)" },
        text: { DEFAULT: "var(--c-text)", soft: "var(--c-text-soft)" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.25rem" },
      animation: {
        "fade-in": "fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-soft": "pulseSoft 2.5s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideDown: { from: { opacity: "0", transform: "translateY(-10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        scaleIn: { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        pulseSoft: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};
