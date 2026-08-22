import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(async ({ command }) => {
  const plugins = [sites()];
  if (command === 'build') {
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    plugins.push(cloudflare({
      config: {
        main: './server/worker.ts',
        compatibility_flags: ['nodejs_compat'],
      },
    }));
  }

  return {
    plugins,
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
  };
});
