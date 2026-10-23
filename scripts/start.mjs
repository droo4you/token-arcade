import { spawn } from 'node:child_process';

// Production-style local preview: the host and Cartridge builds remain separate origins.
const children = [
  spawn(process.execPath, ['--experimental-strip-types', '--env-file-if-exists=.env', 'scripts/cartridges.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--env-file-if-exists=.env', '--experimental-sqlite', '--experimental-strip-types', 'apps/api/src/server.ts'], { stdio: 'inherit' }),
];
const stop = () => { for (const child of children) child.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => { stop(); if (code) process.exitCode = code; });
