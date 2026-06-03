/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx}",
    "./src/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme base
        slate: {
          850: '#1e293b',
          950: '#020617',
        }
      },
      width: {
        'popup': '380px'
      },
      maxHeight: {
        'popup': '560px'
      }
    }
  },
  plugins: []
}
