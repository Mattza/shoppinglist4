/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0891B2',
        secondary: '#22D3EE',
        cta: '#22C55E',
        background: '#ECFEFF',
        surface: '#ffffff',
        text: '#164E63',
        'text-muted': '#0e7490',
        border: '#a5f3fc',
        'border-strong': '#22d3ee',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.1)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        xl: '0 20px 25px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        md: '8px',
        lg: '12px',
      },
      fontFamily: {
        sans: ['Nunito Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Rubik', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

