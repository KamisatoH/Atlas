import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const output = process.argv[2];

if (!output) {
  console.error('Usage: npm run db:backup -- <output.db>');
  process.exit(1);
}

const outputPath = path.resolve(process.cwd(), output);

try {
  await fs.access(outputPath);
  console.error(`Refusing to overwrite existing backup: ${outputPath}`);
  process.exit(1);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });

const escapedPath = outputPath.replaceAll('\\', '/').replaceAll("'", "''");
const prisma = new PrismaClient();

try {
  // VACUUM INTO produces a consistent SQLite snapshot while the application is running.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);
  console.log(`SQLite backup created: ${outputPath}`);
} finally {
  await prisma.$disconnect();
}
