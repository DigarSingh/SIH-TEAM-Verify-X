/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#102A43',
        navy: '#0B1F3A',
        sky: '#2D8CFF',
        mist: '#EEF5FB',
        cloud: '#F7FAFC',
        teal: '#0EA5A8',
        coral: '#EA6A47',
        // The same hues adjusted for TEXT, because WCAG AA needs 4.5:1 and plain sky is only 3.3:1 on white (plain teal 2.9:1).
        // `sky-deep` / `teal-deep` for text and small icons on light surfaces, `sky-light` for text on the navy surfaces,
        // plain `sky` / `teal` for fills, rings and other non-text uses.
        'sky-deep': '#1663CC',
        'sky-light': '#66B0FF',
        'teal-deep': '#0A7275',
      },
      boxShadow: {
        card: '0 10px 32px rgba(15, 42, 67, 0.07)',
        lift: '0 18px 44px rgba(15, 42, 67, 0.12)',
      },
      fontFamily: {
        sans: ['"DM Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Manrope Variable"', '"DM Sans Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.28s ease-out both',
        'slide-in': 'slide-in 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};
