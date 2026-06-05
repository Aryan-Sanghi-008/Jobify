import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}', './popup/**/*.html'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
