# Kiln asset workspace

Author and refine assets in this directory. The engine is installed separately. Do not read its implementation or example collection to solve an asset task.

Two surfaces drive the same engine and share .kiln/programs, so either is fine and you can mix them freely. The kiln_workspace MCP server returns each render as an image in your context. The node kiln.mjs CLI writes renders to disk, so read the PNG back before judging anything visual. A server named kiln may be a different installation; do not substitute it silently, and report the setup problem instead. To check, call kiln_list_primitives with capabilities true and compare capabilities.engine.installUrl against runtime in .kiln/workspace.json.

Read the skill for your task from skills/ in this directory, never a global plugin copy. The maintained copies are there, mirrored into .claude/skills/ and .agents/skills/ because harnesses scan different directories. Use kiln_list_primitives for API signatures.

## The loop

1. Draft. Pass code once to kiln_render or kiln_validate, or import a file with node kiln.mjs source asset.kiln.js. Either returns a programRef, normally a short immutable p_ handle. Keep it even when validation fails. Copy it exactly; never construct, expand or shorten one, and do not retransmit the program.
2. Render. kiln_render, or node kiln.mjs render PROGRAM_REF --views sheet.png.
3. Review. Look at the image. Check viewFidelity before judging materials: a CPU view is honest about silhouette, proportion and contact, and says nothing about colour, metalness or roughness.
4. Edit. Read exact anchors with kiln_source and a literal query, following nextOffset for more context, then call kiln_edit with programRef and edits. Each edit returns a new programRef; use that one from then on. Rewriting the whole file through the CLI works, but it loses the anchored diff and the revision lineage.
5. Save. The user chooses a named destination; discover configured collections when needed and otherwise default to project. Use kiln_save, or node kiln.mjs save. Keep the exact asset and revision IDs. Save refinements as child revisions rather than replacing their parent. When the user wants to see the result, call kiln_present; if the host cannot render it, launch node kiln.mjs view yourself and provide its loopback URL.

Export at any point. Source is node kiln.mjs source PROGRAM_REF --out revised.kiln.js; geometry is node kiln.mjs render PROGRAM_REF --out asset.glb --views sheet.png. Source and ZIP exports refuse to overwrite a file. Render replaces existing GLB and PNG files only after each replacement is fully written and closed; a failed write or rename preserves the previous file. Replacement is per file, not a transaction across outputs. Replace PROGRAM_REF with the exact returned reference; full sha256 references also remain valid.

## Material-faithful views

This workspace asks for render mode auto: a GPU service when one answers on port 8000, CPU views otherwise. Without that service every render reports viewFidelity.materialFaithful false, and nothing rendered here can confirm a material.

To start it, read runtime from .kiln/workspace.json and run npm install && npm start in render-service/ under that path. It is a separate package with a native dependency, so the install is its own step and can take a while. Start it at any time; the CLI picks it up on the next call, and MCP starts one itself on the first render that needs it. The one case that needs a restart is installing it AFTER this session began: the MCP server checks at startup whether a renderer could run here, and a session that began before the install stays on CPU for its lifetime.

For a task about appearance, say so rather than silently accepting CPU views.

## Context compaction

Long-running and headless sessions may compact context automatically. Keep a small KILN_PROGRESS.md when the task spans many tool calls. Before a compaction boundary, or after each meaningful revision, record the active goal, current programRef, files changed, validation and render results, unresolved errors, and the exact next action. After compaction, read that note and continue; do not stop merely because the conversation was summarized. Never replace a programRef from memory -- copy the exact current value from the note or the latest tool result.

## Keep this context clean

Skills and MCP servers from user-level configuration still load here: a workspace separates task context, not operating-system permissions. When you verify the server, report anything registered that is unrelated to this task so the user can decide whether to narrow it.

Keep .kiln/programs while working. Source files are portable; references resolve only in a store containing their source.
