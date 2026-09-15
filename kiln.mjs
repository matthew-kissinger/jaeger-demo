// Generated runtime launcher. Repair paths with kiln-init <workspace> --repair.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.KILN_PROGRAM_STORE = join(dirname(fileURLToPath(import.meta.url)), '.kiln', 'programs');
try {
  const { main } = await import("file:///C:/Users/Mattm/X/kiln-oss/dist/cli.mjs");
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message + '\nIf the installation moved, run kiln-init <workspace> --repair from the current Kiln installation.');
  process.exitCode = 1;
}
