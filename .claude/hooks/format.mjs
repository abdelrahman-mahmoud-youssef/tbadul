import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function loadPrettier() {
  const require = createRequire(resolve(projectDir, 'package.json'));
  const entry = require.resolve('prettier');
  const module = await import(pathToFileURL(entry).href);
  return module.default ?? module;
}

function report(message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
    }),
  );
}

const input = JSON.parse((await readStdin()) || '{}');
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

let prettier;
try {
  prettier = await loadPrettier();
} catch {
  process.exit(0);
}

const info = await prettier.getFileInfo(filePath, {
  ignorePath: [resolve(projectDir, '.prettierignore'), resolve(projectDir, '.gitignore')],
});
if (info.ignored || !info.inferredParser) process.exit(0);

const source = await readFile(filePath, 'utf8');
const options = await prettier.resolveConfig(filePath, { editorconfig: true });
try {
  const formatted = await prettier.format(source, { ...options, filepath: filePath });
  if (formatted !== source) await writeFile(filePath, formatted);
} catch (error) {
  report(
    `Prettier could not format ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
  );
}
