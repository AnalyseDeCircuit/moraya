<script lang="ts">
  /**
   * Shared custom <Select> — the project-wide replacement for native `<select>`.
   *
   * Why this exists: native `<select>` on macOS renders its popup as an
   * NSPopUpButton menu that overlaps the trigger (the selected item aligns over
   * the button), which reads as a positioning bug. This component always drops
   * the option list BELOW the trigger (flipping above only when there isn't room),
   * so every dropdown is "correct by default".
   *
   * Positioning uses `position: fixed` anchored to the trigger's bounding rect,
   * so the menu escapes `overflow: auto/hidden` clipping from scroll containers
   * (e.g. the Settings panel) — a plain `position: absolute` menu would be
   * clipped at the container edge.
   *
   * Appearance is self-contained (native select classes are component-scoped and
   * can't style a child component's DOM). Use `size` / `block` to match call
   * sites; `class` / `style` pass through to the trigger for one-off layout.
   */
  import { onDestroy, tick } from 'svelte';

  export interface SelectOption {
    value: unknown;
    label: string;
    disabled?: boolean;
  }

  let {
    value = $bindable(),
    options,
    onchange,
    disabled = false,
    size = 'md',
    block = false,
    placeholder = '',
    ariaLabel,
    id,
    title,
    class: className = '',
    style = '',
  }: {
    value?: unknown;
    options: SelectOption[];
    onchange?: (value: unknown) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
    block?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    id?: string;
    title?: string;
    class?: string;
    style?: string;
  } = $props();

  let open = $state(false);
  let highlighted = $state(-1);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();
  let menuPos = $state<{
    left: number;
    minWidth: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const selectedIndex = $derived(options.findIndex((o) => o.value === value));
  const selectedLabel = $derived(selectedIndex >= 0 ? options[selectedIndex].label : placeholder);

  function computePosition() {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    const gap = 4;
    const margin = 12;
    const desired = 280;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < Math.min(desired, 180) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(desired, openUp ? spaceAbove : spaceBelow));
    menuPos = {
      left: r.left,
      minWidth: r.width,
      top: openUp ? undefined : r.bottom + gap,
      bottom: openUp ? window.innerHeight - r.top + gap : undefined,
      maxHeight,
    };
  }

  async function openMenu() {
    if (disabled) return;
    computePosition();
    open = true;
    highlighted = selectedIndex >= 0 ? selectedIndex : firstEnabled();
    await tick();
    scrollHighlightedIntoView();
  }

  function closeMenu() {
    open = false;
    menuPos = null;
    triggerEl?.focus();
  }

  function toggle() {
    if (open) closeMenu();
    else void openMenu();
  }

  function firstEnabled(): number {
    return options.findIndex((o) => !o.disabled);
  }

  function selectOption(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    const changed = opt.value !== value;
    value = opt.value;
    open = false;
    menuPos = null;
    if (changed) onchange?.(opt.value);
    triggerEl?.focus();
  }

  function moveHighlight(dir: 1 | -1) {
    if (options.length === 0) return;
    let i = highlighted;
    for (let step = 0; step < options.length; step++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) {
        highlighted = i;
        scrollHighlightedIntoView();
        return;
      }
    }
  }

  function scrollHighlightedIntoView() {
    if (!menuEl || highlighted < 0) return;
    const el = menuEl.querySelector<HTMLElement>(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveHighlight(1); break;
      case 'ArrowUp': e.preventDefault(); moveHighlight(-1); break;
      case 'Home': e.preventDefault(); highlighted = firstEnabled(); scrollHighlightedIntoView(); break;
      case 'End': e.preventDefault(); highlighted = options.length - 1; moveHighlight(-1); moveHighlight(1); break;
      case 'Enter':
      case ' ': e.preventDefault(); if (highlighted >= 0) selectOption(highlighted); break;
      case 'Escape': e.preventDefault(); closeMenu(); break;
      case 'Tab': closeMenu(); break;
    }
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (!open) return;
    const t = e.target as Node;
    if (triggerEl?.contains(t) || menuEl?.contains(t)) return;
    open = false;
    menuPos = null;
  }

  function onWindowScroll(e: Event) {
    if (!open) return;
    // Ignore scrolls originating inside the menu itself.
    if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
    open = false;
    menuPos = null;
  }

  function onWindowResize() {
    if (open) computePosition();
  }

  $effect(() => {
    if (!open) return;
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('scroll', onWindowScroll, true);
    window.addEventListener('resize', onWindowResize);
    return () => {
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('scroll', onWindowScroll, true);
      window.removeEventListener('resize', onWindowResize);
    };
  });

  onDestroy(() => {
    open = false;
  });
</script>

<button
  type="button"
  bind:this={triggerEl}
  {id}
  {title}
  {disabled}
  class="mrya-select {size} {className}"
  class:block
  class:open
  style={style}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={ariaLabel}
  onclick={toggle}
  onkeydown={onTriggerKeydown}
>
  <span class="mrya-select-label" class:placeholder={selectedIndex < 0}>{selectedLabel}</span>
  <svg class="mrya-select-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</button>

{#if open && menuPos}
  <div
    bind:this={menuEl}
    class="mrya-select-menu {size}"
    role="listbox"
    tabindex="-1"
    style:left="{menuPos.left}px"
    style:min-width="{menuPos.minWidth}px"
    style:top={menuPos.top !== undefined ? `${menuPos.top}px` : undefined}
    style:bottom={menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined}
    style:max-height="{menuPos.maxHeight}px"
  >
    {#each options as opt, i (i)}
      <div
        class="mrya-select-option"
        class:selected={opt.value === value}
        class:highlighted={i === highlighted}
        class:disabled={opt.disabled}
        data-idx={i}
        role="option"
        aria-selected={opt.value === value}
        onmouseenter={() => { if (!opt.disabled) highlighted = i; }}
        onclick={() => selectOption(i)}
      >
        <span class="mrya-select-check">{opt.value === value ? '✓' : ''}</span>
        <span class="mrya-select-option-label">{opt.label}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .mrya-select {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 4px 8px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    font-family: inherit;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    max-width: 100%;
    vertical-align: middle;
    transition: border-color var(--transition-fast, 0.12s), box-shadow var(--transition-fast, 0.12s);
  }
  .mrya-select.sm {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: var(--font-size-xs);
    gap: 0.3rem;
  }
  .mrya-select.block { display: flex; width: 100%; }
  .mrya-select:hover:not(:disabled) { border-color: var(--accent-color); }
  .mrya-select:focus-visible,
  .mrya-select.open {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 18%, transparent);
  }
  .mrya-select:disabled { opacity: 0.55; cursor: not-allowed; }

  .mrya-select-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mrya-select-label.placeholder { color: var(--text-muted, var(--text-secondary)); }
  .mrya-select-chevron {
    flex-shrink: 0;
    color: var(--text-secondary, var(--text-muted));
    transition: transform var(--transition-fast, 0.12s);
  }
  .mrya-select.open .mrya-select-chevron { transform: rotate(180deg); }

  .mrya-select-menu {
    position: fixed;
    z-index: 3000;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
    padding: 0.25rem;
    overflow-y: auto;
    max-width: min(90vw, 420px);
  }

  .mrya-select-option {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.32rem 0.4rem;
    border-radius: 4px;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
    white-space: nowrap;
  }
  .mrya-select-menu.sm .mrya-select-option { font-size: var(--font-size-xs); padding: 0.28rem 0.4rem; }
  .mrya-select-option.highlighted:not(.disabled) { background: var(--bg-hover); }
  .mrya-select-option.selected { color: var(--accent-color); font-weight: 500; }
  .mrya-select-option.disabled { opacity: 0.45; cursor: not-allowed; }

  .mrya-select-check {
    flex-shrink: 0;
    width: 0.9em;
    text-align: center;
    color: var(--accent-color);
  }
  .mrya-select-option-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
