import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Ícones do app instalado, gerados de public/favicon.svg com "npm run icons" (os PNGs ficam no repositório).
// O losango dourado fica sobre o fundo da mesa nos ícones que não aceitam transparência.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.3, resizeOptions: { background: '#060912' } },
    apple: { ...minimal2023Preset.apple, padding: 0.3, resizeOptions: { background: '#060912' } },
  },
  images: ['public/favicon.svg'],
});
