#!/usr/bin/env node
/**
 * Checks two folder invariants as hard rules, in CI, offline.
 *
 *   1. ONE DOOR    — at most one child of a folder is imported from outside it.
 *   2. LEAF EXITS  — a child may import values from outside the folder only if
 *                    it is a leaf (imports no sibling) or the folder's door.
 *
 * Type-only imports are free under both: depending on a port costs nothing at
 * runtime, and it is depending on an *implementation* that the leaf rule is
 * there to confine. That is why the codebase writes `import type` explicitly.
 *
 * Overlap with `nao reshape`, which now covers much of this ground:
 *   - reshape discounts type-only arrows too, and reached that independently.
 *   - reshape classifies egress by origin (leaf / door / middle) and calls a
 *     door exiting "structural: a facade imports what it hands on". The door
 *     exemption above exists because of that — an earlier version of this
 *     script flagged composition roots, which was wrong.
 *   - reshape scores entry concentration as a ratio against a 0.60 gate and
 *     counts inbound *edges*; this counts distinct entry *files* and demands
 *     exactly one. That is the stricter, more literal reading, and it is the
 *     main thing this script still adds — along with failing a build.
 *
 *   node scripts/check-architecture.mjs            # fail on regressions only
 *   node scripts/check-architecture.mjs --baseline # rewrite the baseline
 *   node scripts/check-architecture.mjs --strict    # fail on every violation
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';

const ROOT = resolve('src');
const BASELINE = resolve('scripts/architecture-baseline.json');

/** `import ... from '<spec>'`, capturing the clause so type-only ones can be told apart. */
const IMPORT_RE = /^\s*import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/gm;

function sourceFiles(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) sourceFiles(path, out);
		else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(path);
	}
	return out;
}

function resolveImport(importer, spec) {
	if (!spec.startsWith('.')) return null; // npm package — not our concern
	const base = resolve(dirname(importer), spec);
	for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Every resolved import, tagged with whether it carries runtime weight.
 * `import type {...}` and inline `{ type Foo }` are erased at build time; an
 * import is only a value import if at least one binding survives.
 */
function importsOf(file) {
	const text = readFileSync(file, 'utf8');
	const found = [];
	for (const [, typeKeyword, clause, spec] of text.matchAll(IMPORT_RE)) {
		const target = resolveImport(file, spec);
		if (!target) continue;
		const bindings = clause.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
		const isValue = !typeKeyword && bindings.some(b => !b.startsWith('type '));
		found.push({ target, isValue });
	}
	return found;
}

/** The immediate child of `folder` that contains `path`, or null if outside it. */
function childOf(folder, path) {
	const rel = relative(folder, path);
	if (rel.startsWith('..') || rel === '') return null;
	return join(folder, rel.split(sep)[0]);
}

const files = sourceFiles(ROOT);
const graph = new Map(files.map(f => [f, importsOf(f)]));
const folders = [...new Set(files.map(f => dirname(f)))].sort();

const violations = [];
for (const folder of folders) {
	const children = [...new Set(files.map(f => childOf(folder, f)).filter(Boolean))].sort();
	if (children.length < 2) continue;

	const dependsOnSibling = new Set();
	const doors = new Set();
	const outward = new Map(); // child -> Set of external value-import targets

	for (const file of files) {
		const from = childOf(folder, file);
		for (const { target, isValue } of graph.get(file)) {
			const to = childOf(folder, target);
			if (from && to && from !== to) {
				if (isValue) dependsOnSibling.add(from);
			} else if (from && !to && isValue) {
				if (!outward.has(from)) outward.set(from, new Set());
				outward.get(from).add(target);
			} else if (to && !from) {
				if (isValue) doors.add(to);
			}
		}
	}

	const name = d => relative(resolve('.'), d);
	if (doors.size > 1) {
		violations.push({
			rule: 'one-door',
			id: `one-door:${name(folder)}`,
			detail: `${doors.size} entry points: ${[...doors].map(d => name(d)).join(', ')}`,
		});
	}
	for (const child of children) {
		if (!outward.has(child)) continue;
		const isLeaf = !dependsOnSibling.has(child);
		// A door importing what it hands on is structural, not a defect.
		if (isLeaf || doors.has(child)) continue;
		violations.push({
			rule: 'leaf-exit',
			id: `leaf-exit:${name(child)}`,
			detail: `exits from the middle to ${[...outward.get(child)].map(t => name(t)).sort().join(', ')}`,
		});
	}
}

const strict = process.argv.includes('--strict');
if (process.argv.includes('--baseline')) {
	writeFileSync(BASELINE, `${JSON.stringify(violations.map(v => v.id).sort(), null, 2)}\n`);
	console.log(`Baseline written: ${violations.length} known violation(s).`);
	process.exit(0);
}

const known = new Set(
	!strict && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : [],
);
const fresh = violations.filter(v => !known.has(v.id));
const fixed = [...known].filter(id => !violations.some(v => v.id === id));

for (const v of violations) {
	const tag = known.has(v.id) ? 'known' : 'NEW  ';
	console.log(`  [${tag}] ${v.id}\n           ${v.detail}`);
}
if (fixed.length) {
	console.log(`\n${fixed.length} baseline entry/entries now fixed — re-run with --baseline to shrink it:`);
	for (const id of fixed) console.log(`  - ${id}`);
}

console.log(
	`\n${violations.length} violation(s), ${fresh.length} new, `
	+ `${folders.length} folder(s) checked.`,
);
if (fresh.length) {
	console.error(`\nFAIL: ${fresh.length} new architecture violation(s).`);
	process.exit(1);
}
console.log('OK');
