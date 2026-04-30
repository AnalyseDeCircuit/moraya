<script lang="ts">
	/**
	 * DiffView.svelte (v0.32.0) — side-by-side unified-diff viewer.
	 *
	 * Loads two file versions (snapshot + current or two snapshots), parses the
	 * `git diff` unified output line-by-line, and renders left/right panes
	 * with added/deleted/context highlighting. Read-only overlay; closing the
	 * view restores the editor as-is.
	 *
	 * Inputs (props):
	 *   - kbPath: KB root absolute path
	 *   - relPath: file path relative to KB root
	 *   - leftHash:  snapshot commit (or null = working tree)
	 *   - rightHash: snapshot commit (or null = working tree / HEAD)
	 *   - currentContent: editor's current content (used when rightHash=null)
	 *   - onClose: callback when [← Back to Edit] pressed
	 */
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { gitShowFile, gitDiff } from '$lib/services/git';

	let {
		kbPath,
		relPath,
		leftHash,
		rightHash,
		currentContent,
		onClose,
	}: {
		kbPath: string;
		relPath: string;
		leftHash: string | null;
		rightHash: string | null;
		currentContent: string;
		onClose: () => void;
	} = $props();

	type LineKind = 'context' | 'added' | 'deleted' | 'header';
	interface RenderLine {
		kind: LineKind;
		leftLine: number | null;
		rightLine: number | null;
		text: string;
	}

	let loading = $state(true);
	let errorMessage = $state('');
	let renderLines = $state<RenderLine[]>([]);
	let stats = $state({ added: 0, deleted: 0 });
	let leftLabel = $derived(leftHash ? leftHash.slice(0, 8) : $t('diff.leftLabel'));
	let rightLabel = $derived(
		rightHash ? rightHash.slice(0, 8) : $t('diff.rightLabel'),
	);

	function parseUnifiedDiff(diff: string): RenderLine[] {
		const out: RenderLine[] = [];
		const lines = diff.split('\n');
		let leftCounter = 0;
		let rightCounter = 0;

		for (const raw of lines) {
			if (raw.startsWith('diff --git') || raw.startsWith('index ')
				|| raw.startsWith('+++ ') || raw.startsWith('--- ')) {
				continue;
			}
			if (raw.startsWith('@@')) {
				// e.g. "@@ -3,5 +3,7 @@ optional context"
				const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
				if (m) {
					leftCounter = parseInt(m[1], 10);
					rightCounter = parseInt(m[2], 10);
				}
				out.push({ kind: 'header', leftLine: null, rightLine: null, text: raw });
				continue;
			}
			if (raw.startsWith('+')) {
				out.push({
					kind: 'added',
					leftLine: null,
					rightLine: rightCounter,
					text: raw.slice(1),
				});
				rightCounter++;
				continue;
			}
			if (raw.startsWith('-')) {
				out.push({
					kind: 'deleted',
					leftLine: leftCounter,
					rightLine: null,
					text: raw.slice(1),
				});
				leftCounter++;
				continue;
			}
			// context line (starts with ' ')
			if (raw.length === 0) {
				// trailing empty lines from diff — skip
				continue;
			}
			out.push({
				kind: 'context',
				leftLine: leftCounter,
				rightLine: rightCounter,
				text: raw.startsWith(' ') ? raw.slice(1) : raw,
			});
			leftCounter++;
			rightCounter++;
		}
		return out;
	}

	async function load() {
		loading = true;
		errorMessage = '';
		try {
			// Detect identical content fast-path: no diff at all
			const left = leftHash
				? await gitShowFile(kbPath, leftHash, relPath)
				: currentContent;
			const right = rightHash
				? await gitShowFile(kbPath, rightHash, relPath)
				: currentContent;

			if (left === right) {
				renderLines = [];
				stats = { added: 0, deleted: 0 };
				return;
			}

			// Detect binary content (gitShowFile returns empty for binary)
			if (leftHash && left.length === 0) {
				errorMessage = $t('diff.binaryFile');
				return;
			}
			if (rightHash && right.length === 0) {
				errorMessage = $t('diff.binaryFile');
				return;
			}

			// Get unified diff via git
			const diffOutput = await gitDiff(
				kbPath,
				leftHash ?? undefined,
				rightHash ?? undefined,
				relPath,
			);
			const parsed = parseUnifiedDiff(diffOutput);
			renderLines = parsed;
			stats = {
				added: parsed.filter((l) => l.kind === 'added').length,
				deleted: parsed.filter((l) => l.kind === 'deleted').length,
			};
		} catch (e: unknown) {
			errorMessage =
				e instanceof Error ? e.message : 'Failed to load diff';
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="diff-view-overlay" role="dialog" aria-label="Diff View">
	<div class="diff-toolbar">
		<button class="back-btn" onclick={onClose}>
			{$t('diff.backToEdit')}
		</button>
		<span class="title">{relPath} · {leftLabel} ↔ {rightLabel}</span>
		{#if !loading && !errorMessage && renderLines.length > 0}
			<span class="stats">
				+{stats.added} {$t('diff.addedLine')} · -{stats.deleted} {$t('diff.deletedLine')}
			</span>
		{/if}
	</div>

	{#if loading}
		<div class="diff-state" role="status" aria-live="polite">⟳ {$t('history.loading')}</div>
	{:else if errorMessage}
		<div class="diff-state error" role="alert">⚠ {errorMessage}</div>
	{:else if renderLines.length === 0}
		<div class="diff-state" role="status">{$t('diff.noChanges')}</div>
	{:else}
		<div class="diff-grid" role="grid" aria-label={$t('diff.title', { filename: relPath, hash1: leftLabel, hash2: rightLabel })}>
			{#each renderLines as line, i (i)}
				{#if line.kind === 'header'}
					<div class="hunk-header" role="separator">{line.text}</div>
				{:else}
					<div
						class="row left-cell line-{line.kind}"
						role="gridcell"
					>
						{#if line.kind === 'deleted'}
							<span class="sr-only">{$t('diff.deletedLine')}</span>
						{/if}
						<span class="ln" aria-hidden="true">{line.leftLine ?? ''}</span>
						<span class="content">{line.text}</span>
					</div>
					<div
						class="row right-cell line-{line.kind}"
						role="gridcell"
					>
						{#if line.kind === 'added'}
							<span class="sr-only">{$t('diff.addedLine')}</span>
						{/if}
						<span class="ln" aria-hidden="true">{line.rightLine ?? ''}</span>
						<span class="content">{line.text}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.diff-view-overlay {
		position: absolute;
		inset: 0;
		background: var(--color-bg);
		color: var(--color-text);
		display: flex;
		flex-direction: column;
		z-index: 50;
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-sm);
	}
	.diff-toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
	}
	.back-btn {
		padding: 4px 12px;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: 4px;
		cursor: pointer;
		font-size: var(--font-size-sm);
	}
	.back-btn:hover {
		background: var(--color-hover);
	}
	.title {
		font-family: var(--font-family-mono);
		color: var(--color-text-muted);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stats {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}
	.diff-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
	}
	.diff-state.error {
		color: #dc2626;
	}
	.diff-grid {
		flex: 1;
		overflow: auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
	}
	.hunk-header {
		grid-column: 1 / -1;
		padding: 4px 12px;
		background: rgba(99, 102, 241, 0.08);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
	}
	.row {
		display: flex;
		gap: 8px;
		padding: 0 12px;
		min-height: 1.5em;
		white-space: pre-wrap;
		word-break: break-word;
		border-right: 1px solid var(--color-border);
	}
	.right-cell {
		border-right: none;
	}
	.ln {
		flex-shrink: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		min-width: 36px;
		text-align: right;
		opacity: 0.6;
	}
	.content {
		flex: 1;
		font-family: var(--font-family-mono);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.line-context {
		background: transparent;
	}
	.line-added {
		background: rgba(34, 197, 94, 0.15);
	}
	.line-deleted {
		background: rgba(239, 68, 68, 0.15);
	}
	/* Hide deleted on right pane / added on left pane */
	.left-cell.line-added {
		background: rgba(0, 0, 0, 0.04);
		opacity: 0.4;
	}
	.left-cell.line-added .content {
		visibility: hidden;
	}
	.right-cell.line-deleted {
		background: rgba(0, 0, 0, 0.04);
		opacity: 0.4;
	}
	.right-cell.line-deleted .content {
		visibility: hidden;
	}
</style>
