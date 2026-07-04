import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EditorState } from 'prosemirror-state';
import { schema } from '../schema';
import {
  looksLikeMarkdownSource,
  markdownPasteSlice,
  createMarkdownSourcePastePlugin,
} from './markdown-source-paste';

// ── Wiring tripwire ───────────────────────────────────────────────────
// The editor loads its base plugins from @moraya/core (see setup.ts). This
// moraya-local plugin only takes effect because setup.ts PREPENDS it before
// core's plugins so its handlePaste runs first. That wiring can't be reached
// through createEditor() in a DOM-less unit test, so guard it at the source
// level: if someone removes or re-orders the wiring, this fails with a clear
// pointer instead of silently regressing markdown-source paste.
describe('setup.ts wiring (regression guard)', () => {
  const setupSrc = readFileSync(
    fileURLToPath(new URL('../setup.ts', import.meta.url)),
    'utf-8',
  );

  it('imports the markdown-source paste plugin', () => {
    expect(setupSrc).toMatch(/import\s*\{\s*createMarkdownSourcePastePlugin\s*\}\s*from\s*['"]\.\/plugins\/markdown-source-paste['"]/);
  });

  it('PREPENDS the plugin before core plugins (handlePaste must run first)', () => {
    // The plugins array must place createMarkdownSourcePastePlugin() ahead of
    // the spread of corePlugins.
    const m = setupSrc.match(/const\s+plugins\s*=\s*\[([^\]]*)\]/);
    expect(m, 'plugins array not found in setup.ts').toBeTruthy();
    const body = m![1];
    const pluginIdx = body.indexOf('createMarkdownSourcePastePlugin(');
    const coreIdx = body.indexOf('...corePlugins');
    expect(pluginIdx, 'createMarkdownSourcePastePlugin() missing from plugins array').toBeGreaterThanOrEqual(0);
    expect(coreIdx, '...corePlugins missing from plugins array').toBeGreaterThanOrEqual(0);
    expect(pluginIdx).toBeLessThan(coreIdx);
  });
});

// ── Heuristic ─────────────────────────────────────────────────────────
describe('looksLikeMarkdownSource', () => {
  it('detects headings / lists / quotes / fences / tables', () => {
    expect(looksLikeMarkdownSource('# Hello Word')).toBe(true);
    expect(looksLikeMarkdownSource('- item')).toBe(true);
    expect(looksLikeMarkdownSource('1. first')).toBe(true);
    expect(looksLikeMarkdownSource('> 引用')).toBe(true);
    expect(looksLikeMarkdownSource('```js\ncode\n```')).toBe(true);
    expect(looksLikeMarkdownSource('| a | b |')).toBe(true);
  });
  it('detects math: $$, LaTeX env, inline $x_0$', () => {
    expect(looksLikeMarkdownSource('$$\nR_m = a\n$$')).toBe(true);
    expect(looksLikeMarkdownSource('\\begin{pmatrix} a & b \\end{pmatrix}')).toBe(true);
    expect(looksLikeMarkdownSource('value $x_0$ set')).toBe(true);
  });
  it('does NOT fire on prose or currency', () => {
    expect(looksLikeMarkdownSource('a normal sentence')).toBe(false);
    expect(looksLikeMarkdownSource('costs $5 to $10')).toBe(false);
    expect(looksLikeMarkdownSource('')).toBe(false);
  });
});

// ── Slice builder ─────────────────────────────────────────────────────
describe('markdownPasteSlice', () => {
  it('returns null when the parse collapses to a single empty paragraph', () => {
    expect(markdownPasteSlice('   ')).toBeNull();
    expect(markdownPasteSlice('')).toBeNull();
  });
  it('returns a slice for a math block', () => {
    const s = markdownPasteSlice('$$\nR_m = x\n$$');
    expect(s).not.toBeNull();
    expect(s!.content.firstChild?.type.name).toBe('math_block');
  });
  it('returns a slice for a heading + quote doc', () => {
    const s = markdownPasteSlice('# Hi\n\n> q');
    expect(s).not.toBeNull();
    expect(s!.content.childCount).toBeGreaterThan(1);
  });
});

// ── End-to-end: the ACTUAL plugin handlePaste against a real EditorState ──
function pasteInto(md: string, opts?: { shiftKey?: boolean }): EditorState {
  const plugin = createMarkdownSourcePastePlugin();
  let state = EditorState.create({ schema, plugins: [plugin] });
  // mock view backed by the real state
  const view = {
    get state() { return state; },
    dispatch(tr: import('prosemirror-state').Transaction) { state = state.apply(tr); },
    input: { shiftKey: opts?.shiftKey ?? false },
  };
  const event = {
    clipboardData: {
      getData: (t: string) => (t === 'text/plain' ? md : '<div>' + md + '</div>'),
    },
  } as unknown as ClipboardEvent;
  // Call the plugin's handlePaste prop directly (as ProseMirror would)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handled = (plugin.props.handlePaste as any)(view, event);
  return handled ? state : state;
}

describe('plugin handlePaste (e2e)', () => {
  it('renders a heading (not literal "# Hi")', () => {
    const st = pasteInto('# Hi');
    expect(st.doc.firstChild?.type.name).toBe('heading');
    expect(st.doc.textContent).toBe('Hi');
  });

  it('renders a math block from source with HTML flavor present', () => {
    const st = pasteInto('$$\nR_m = \\begin{pmatrix} a & b \\end{pmatrix}\n$$');
    // find a math_block anywhere
    let found = false;
    st.doc.descendants(n => { if (n.type.name === 'math_block') found = true; });
    expect(found).toBe(true);
  });

  it('does NOT hijack plain prose (leaves doc empty for default handling)', () => {
    const st = pasteInto('just a normal sentence');
    // plugin returned false → no dispatch → doc still empty
    expect(st.doc.textContent).toBe('');
  });

  it('respects Shift+paste (plain paste) — no markdown render', () => {
    const st = pasteInto('# Hi', { shiftKey: true });
    expect(st.doc.textContent).toBe('');
  });
});
