/**
 * Runs the logic test suite on plain Node, with no dev dependencies.
 *
 * The source uses Next.js-style extensionless imports ("./currencies"), which
 * Node's ESM loader won't resolve. So we copy the pure-logic modules into a temp
 * folder, add the .ts extensions, and run the suite there with Node's built-in
 * type stripping (Node 22.6+).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witzcoin-test-'));
const libOut = path.join(tmp, 'lib');
fs.mkdirSync(libOut, { recursive: true });

const addExt = (code) => code.replace(/from '\.\/([a-zA-Z0-9_-]+)'/g, "from './$1.ts'");

for (const file of fs.readdirSync(path.join(root, 'src/lib')).filter((f) => f.endsWith('.ts'))) {
  fs.writeFileSync(path.join(libOut, file), addExt(fs.readFileSync(path.join(root, 'src/lib', file), 'utf8')));
}
const suite = fs.readFileSync(path.join(root, 'scripts/test-logic.ts'), 'utf8')
  .replace(/'\.\.\/src\/lib\//g, "'./lib/");
fs.writeFileSync(path.join(tmp, 'test.ts'), suite);

const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', path.join(tmp, 'test.ts')], {
  stdio: 'inherit',
});
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(res.status ?? 1);
