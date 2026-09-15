# Start making assets

```bash
cd C:\Users\Mattm\X\jaeger-demo
node codex.mjs
```

Codex keeps configuration in $CODEX_HOME and has no project-local equivalent, so `node codex.mjs` passes this workspace's server, program store and directory as per-invocation `-c` overrides. It writes nothing outside this directory and leaves your $CODEX_HOME and its authentication untouched. Running bare `codex` here reaches no Kiln tools. For headless runs, add the prompt: node codex.mjs "Read AGENTS.md and the project skills, then YOUR TASK.". Accept the project/MCP trust prompts. Ask the agent to read AGENTS.md and create an asset. Kiln needs no separate model key.

Core author/refine/QA skills are installed and registered for this harness. Optional compose/batch skills are selected at setup with --skills compose,batch.

Long-running and headless sessions may compact context automatically. AGENTS.md describes the harness-neutral KILN_PROGRESS.md handoff that preserves the current programRef and next action across compaction. Harness-specific thresholds are documented in Kiln's docs/harnesses.md; leave native automatic compaction enabled when the active model's context size is unknown.

Keep assets here and engine source outside. This separates task context, not operating-system permissions. User instructions and authentication can still apply.

Run repair after anything that invalidates the generated absolute paths: moving this workspace, moving or reinstalling the runtime, or replacing the Node that setup recorded -- an nvm switch or uninstall does that, because the manifest pins the exact interpreter the preflight check validated.

```bash
node C:\Users\Mattm\X\kiln-oss\scripts\create-workspace.mjs C:\Users\Mattm\X\jaeger-demo --repair
```

That path is where the installation was at setup. If the installation itself moved, run the same command from its current location; `runtime` in .kiln/workspace.json records where this workspace last expected it.

Repair updates generated runtime paths only and refuses edited configuration; it preserves skills, assets, and saved revisions.
