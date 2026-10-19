// Ejecuta un script de Python usando el venv del proyecto (Windows o Unix).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const candidates = ['.venv/Scripts/python.exe', '.venv/bin/python'];
const python = candidates.find((p) => existsSync(p));
if (!python) {
  console.error('No encuentro el venv. Créalo con:  py -3.12 -m venv .venv  y luego  .venv\\Scripts\\pip install -r tools/requirements.txt');
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
});
process.exit(result.status ?? 1);
