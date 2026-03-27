/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#FAF8F5',
        ink: '#1a1a1a',
        muted: '#6b6b6b',
        faint: '#b5b0a8',
      },
    },
  },
  plugins: [],
};
