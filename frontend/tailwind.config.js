/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'draw': 'draw 1s ease-out forwards'
      },
      keyframes: {
        draw: {
          '0%': { strokeDashoffset: '339.292' },
          '100%': { strokeDashoffset: 'var(--target-offset)' }
        }
      }
    }
  },
  plugins: []
}
