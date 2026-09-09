import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Invoke Prisma's local CLI with Node directly. This works both on Linux and
// Windows, where spawning npx.cmd from Node can fail with EINVAL.
const prismaCli = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Prisma SQLite schema-engine can otherwise return an empty error on some hosts.
    RUST_LOG: process.env.RUST_LOG || 'info',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
