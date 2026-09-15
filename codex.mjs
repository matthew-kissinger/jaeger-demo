import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const overrides = [
  ['mcp_servers.kiln_workspace.command', "C:\\Users\\Mattm\\AppData\\Roaming\\fnm\\node-versions\\v22.23.2\\installation\\node.exe"],
  ['mcp_servers.kiln_workspace.args', ["C:\\Users\\Mattm\\X\\kiln-oss\\dist\\mcp-server.mjs"]],
  ['mcp_servers.kiln_workspace.env.KILN_PROGRAM_STORE', "C:\\Users\\Mattm\\X\\jaeger-demo\\.kiln\\programs"],
  ['mcp_servers.kiln_workspace.env.KILN_RENDER', 'auto'],
].flatMap(([key, value]) => ['-c', key + '=' + JSON.stringify(value)]);
const args = process.argv.slice(2);
const sub = args.find(arg => !arg.startsWith('-'));
const rest = sub === 'exec' ? args : ['exec', ...args];
const executable = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const child = spawn(executable, [...rest.slice(0, 1), ...overrides, '--cd', root, '--skip-git-repo-check', ...rest.slice(1)], { cwd: root, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
