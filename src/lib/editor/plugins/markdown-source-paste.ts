/**
 * Markdown-source paste plugin (moraya-local, ACTIVE).
 *
 * Problem: `@moraya/core`'s editor-props plugin markdown-parses pasted text via
 * `clipboardTextParser`, but ProseMirror only routes text through that hook
 * when the clipboard has NO `text/html` flavor (`asText = !html && …`, see
 * prosemirror-view `parseFromClipboard`). Copying Markdown *source* from a code
 * editor / LLM chat / browser almost always ALSO puts a `text/html` flavor on
 * the clipboard, so the raw markdown is parsed as HTML and never rendered — the
 * paste appears to "do nothing" in visual mode.
 *
 * Fix: a `handlePaste` prop that fires FIRST (this plugin is prepended before
 * core's in `setup.ts`). When the plain text looks like Markdown source, it
 * parses the PLAIN text as Markdown and inserts the rendered result, ignoring
 * the (varying, unreliable) HTML flavor entirely.
 *
 * Safety:
 *  - Gated on `looksLikeMarkdownSource(plain)` — rendered content's text/plain
 *    never carries markdown markers (#, `- `, ``` , $$, …), so this only fires
 *    for actual source.
 *  - Skips Shift+paste ("paste as plain text") and pastes inside code blocks.
 *  - Tables / images are already intercepted upstream in Editor.svelte's
 *    capture-phase paste handler, so they never reach here.
 */

import { Fragment, Node as PMNode, Slice } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { parseMarkdown } from '../markdown';

/**
 * Un-escape ONLY the safe markdown backslash-escapes inside pasted math, so
 * LaTeX that was over-escaped in a markdown context renders correctly.
 *
 * When LaTeX is pasted from a markdown source (LLM output, escaped docs), the
 * markdown emphasis chars often arrive escaped — `R\_m` instead of `R_m` — so
 * subscripts break. We reverse `\_ → _` and `\* → *` (both are markdown
 * emphasis chars whose escaped form is meaningless in LaTeX math).
 *
 * DELIBERATELY LEFT UNTOUCHED (they are meaningful LaTeX and cannot be safely
 * guessed):
 *   - `\\`  (row break)          — consumed as a unit so it's never altered
 *   - `\ `  (control space)      — space isn't in the unescape set
 *   - `\{ \} \[ \] \( \)`        — literal braces / math delimiters
 *   - `\& \! \# \% \, \;` etc.   — alignment, spacing, params, comments
 *
 * NOTE: a corrupted row break that arrived as `\ ` (single backslash + space,
 * instead of `\\`) is NOT recoverable here without breaking real control
 * spaces — that must be fixed in the source.
 */
export function unescapeMathMarkdown(latex: string): string {
  // Alternation order matters: match `\\` first so a real row break is consumed
  // as a pair and preserved; otherwise unescape `\_` / `\*`.
  return latex.replace(/\\\\|\\([_*])/g, (m, p1: string | undefined) => (p1 !== undefined ? p1 : m));
}

/** Rebuild a fragment, un-escaping markdown emphasis inside math nodes. */
function fixMathEscapes(frag: Fragment): Fragment {
  const out: PMNode[] = [];
  frag.forEach((node) => {
    const name = node.type.name;
    if (name === 'math_block') {
      const cur = typeof node.attrs.value === 'string' ? node.attrs.value : '';
      const fixed = unescapeMathMarkdown(cur);
      out.push(fixed === cur ? node : node.type.create({ ...node.attrs, value: fixed }, node.content, node.marks));
    } else if (name === 'math_inline') {
      const cur = node.textContent;
      const fixed = unescapeMathMarkdown(cur);
      const content = fixed ? Fragment.from(node.type.schema.text(fixed)) : Fragment.empty;
      out.push(fixed === cur ? node : node.type.create(node.attrs, content, node.marks));
    } else if (node.content.size > 0) {
      out.push(node.copy(fixMathEscapes(node.content)));
    } else {
      out.push(node);
    }
  });
  return Fragment.fromArray(out);
}

/**
 * Heuristic: does this text look like Markdown *source* (literal syntax the
 * user wants rendered), as opposed to plain prose?
 *
 * Detects block-level markers (headings, lists, blockquotes, fences, tables,
 * HRs), unambiguous inline syntax (links, images, fenced/inline code, bold),
 * and math ($$ blocks, LaTeX environments, inline $x_0$). Conservative on
 * single `*`/`_` and on currency (`$5`) to avoid misfiring on prose.
 */
export function looksLikeMarkdownSource(text: string): boolean {
  if (!text.trim()) return false;
  for (const ln of text.split('\n')) {
    // headings, unordered/ordered list items, blockquotes, fences, table rows
    if (/^\s{0,3}(#{1,6}\s|[-*+]\s+\S|\d+\.\s+\S|>\s|```|~~~|\|.+\|)/.test(ln)) return true;
    // thematic break (---, ***, ___)
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) return true;
  }
  if (/!\[[^\]]*\]\([^)]+\)/.test(text)) return true;          // image
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;           // link (text + url)
  if (/```[\s\S]+```/.test(text)) return true;                 // fenced code
  if (/(\*\*|__)\S[\s\S]*?\S(\*\*|__)/.test(text)) return true; // bold
  if (/`[^`]+`/.test(text)) return true;                       // inline code
  // Math
  if (/(^|\n)\s{0,3}\$\$/.test(text)) return true;             // $$ block fence
  if (/\$\$[\s\S]+?\$\$/.test(text)) return true;              // inline $$…$$
  if (/\\begin\{[a-zA-Z]+\*?\}/.test(text)) return true;       // \begin{pmatrix} …
  if (/\$[^$\n]*[\\^_][^$\n]*\$/.test(text)) return true;      // inline $x_0$, $\alpha$
  return false;
}

/**
 * Build the Slice to insert from a parsed markdown doc. A single wrapping
 * paragraph is unwrapped so inline content merges into the current line;
 * multi-block / atom-block content is inserted as blocks.
 *
 * Returns null when the parse collapsed to a single EMPTY paragraph (e.g.
 * `[]()`), so the caller can fall through to default paste handling. Atom
 * blocks (math_block, horizontal_rule, image) are valid content even though
 * `content.size` is small and `textContent` is empty — so we do NOT gate on
 * `size > 2`.
 */
export function markdownPasteSlice(plain: string): Slice | null {
  const doc = parseMarkdown(plain);
  const onlyEmptyPara = doc.childCount === 1
    && doc.firstChild!.type.name === 'paragraph'
    && doc.firstChild!.content.size === 0;
  if (onlyEmptyPara) return null;
  // Heal markdown-over-escaped math (\_ → _, \* → *); leaves \\ / \ / \{ etc.
  const content = fixMathEscapes(doc.content);
  const inner = (content.childCount === 1 && content.firstChild!.type.name === 'paragraph')
    ? content.firstChild!.content
    : content;
  return new Slice(inner, 0, 0);
}

export function createMarkdownSourcePastePlugin(): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const plain = event.clipboardData?.getData('text/plain');
        if (!plain) return false;

        // Respect "paste as plain text" (Shift+paste) and pastes inside code.
        const isPlainPaste = !!(view as unknown as { input?: { shiftKey?: boolean } }).input?.shiftKey;
        if (isPlainPaste) return false;
        if (view.state.selection.$from.parent.type.spec.code === true) return false;

        if (!looksLikeMarkdownSource(plain.trim())) return false;

        const slice = markdownPasteSlice(plain);
        if (!slice) return false; // empty parse → let default handling run

        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
  });
}
