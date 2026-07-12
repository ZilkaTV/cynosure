/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep near-black backgrounds with a cosmic purple tint (matches the crest field).
        base: {
          950: '#07060d',
          900: '#0c0a17',
          850: '#120f22',
          800: '#181530',
          700: '#221d43',
          600: '#322a5e',
          500: '#463a7d',
        },
        // Cynosure purple — the shield field / eagle.
        accent: {
          DEFAULT: '#8b5cf6',
          light: '#b79cff',
          dark: '#6d28d9',
        },
        // The gold banner and shield trim.
        gold: {
          DEFAULT: '#d8b96a',
          light: '#eed699',
          dark: '#b0913f',
        },
        signal: {
          green: '#33d17a',
          red: '#f0556b',
          blue: '#5b9dff',
          silver: '#c9ccd6',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', '"Rajdhani"', 'system-ui', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(circle at 50% 0%, rgba(139,92,246,0.16), transparent 62%)',
        starfield:
          'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.35), transparent), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.25), transparent), radial-gradient(1.5px 1.5px at 40% 80%, rgba(199,204,214,0.3), transparent), radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.3), transparent)',
      },
    },
  },
  plugins: [],
}
