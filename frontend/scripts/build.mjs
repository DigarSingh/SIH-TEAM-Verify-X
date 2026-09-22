// Production build: type-check, then bundle.
//
// NODE_ENV is set explicitly on purpose. The repository shares one .env between the API and the web app (so VITE_*
// settings live in one place), and Vite honours `NODE_ENV=development` from an .env file: without this, a developer's
// `npm run build` would produce a DEVELOPMENT bundle (React dev build, larger and slower, with DevTools hooks).
import { spawnSync } from 'node:child_process';

const env = { ...process.env, NODE_ENV: 'production' };

for (const args of [['tsc', '-b'], ['vite', 'build']]) {
  // `npx` resolves the binaries of this workspace on every platform; a shell is needed for it on Windows.
  const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
