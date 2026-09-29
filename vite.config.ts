import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig, loadEnv} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = fileURLToPath(new URL('./bluecrestback/', import.meta.url));

function localBackendPlugin(runtimeEnv: Record<string, string>) {
  const waitForBackend = async (timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const response = await fetch('http://127.0.0.1:4000/health', {
          signal: AbortSignal.timeout(750),
        });
        if (response.ok) return;
      } catch {
        // SQLite may still be initializing; retry briefly.
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error('BlueCrest backend did not become ready on port 4000 within 15 seconds.');
  };

  return {
    name: 'bluecrest-local-backend',
    apply: 'serve' as const,
    async configureServer(server) {
      let backendProcess;

      try {
        const response = await fetch('http://127.0.0.1:4000/health', {
          signal: AbortSignal.timeout(750),
        });

        if (response.ok) {
          const health = await response.json();
          const capabilities = health?.data?.capabilities;

          if (Array.isArray(capabilities) && capabilities.includes('card_applications')) {
            console.log('BlueCrest backend already running on http://127.0.0.1:4000');
            return;
          }

          throw new Error(
            'Port 4000 is running an outdated BlueCrest backend. Stop the old Node process and restart npm run dev.'
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('outdated BlueCrest backend')) {
          throw error;
        }
        // Start the local API below.
      }

      console.log('Starting BlueCrest SQLite backend on http://127.0.0.1:4000');
      backendProcess = spawn(process.execPath, ['server.js'], {
        cwd: backendRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...runtimeEnv,
          NODE_ENV: 'development',
          DB_PROVIDER: 'sqlite',
        },
      });

      backendProcess.on('exit', (code) => {
        if (code && code !== 0) {
          console.error(`BlueCrest backend stopped with exit code ${code}`);
        }
      });

      await waitForBackend();
      console.log('BlueCrest SQLite backend is ready');

      server.httpServer?.once('close', () => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill();
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), localBackendPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
