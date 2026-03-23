<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { t } from '$lib/i18n';
  import { settingsStore } from '$lib/stores/settings-store';
  import { filesStore } from '$lib/stores/files-store';
  import { aiStore } from '$lib/services/ai/ai-service';
  import {
    getEmbeddingConfig,
    getIndexStatus,
    indexKnowledgeBase,
    deleteIndex,
  } from '$lib/services/kb';
  import { EMBEDDING_MODELS, getMaxDimension } from '$lib/services/kb/types';
  import type { IndexStatus } from '$lib/services/kb/types';

  import type { KnowledgeBase } from '$lib/stores/files-store';

  let {
    onOpenKBManager,
  }: {
    onOpenKBManager?: () => void;
  } = $props();

  let knowledgeBases = $state<KnowledgeBase[]>([]);

  const PROVIDERS = [
    { value: '', label: 'kb.useSameAsAI' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'ollama', label: 'Ollama' },
    { value: 'glm', label: 'GLM' },
    { value: 'doubao', label: 'Doubao' },
    { value: 'deepseek', label: 'DeepSeek' },
  ];

  let embeddingProvider = $state('');
  let embeddingModel = $state('');
  let embeddingDimensions = $state(1024);
  let autoIndexOnSave = $state(false);
  let showModelDropdown = $state(false);

  let indexStatus: IndexStatus | null = $state(null);
  let isIndexing = $state(false);
  let progressPhase = $state('');
  let progressCurrent = $state(0);
  let progressTotal = $state(0);
  let progressFileName = $state('');

  let activeKBPath = $state('');
  let activeKBName = $state('');

  // Effective provider (resolved from AI chat if not explicitly set)
  let effectiveProvider = $derived(
    embeddingProvider || aiStore.getActiveConfig()?.provider || 'openai',
  );

  // Available models for the effective provider
  let availableModels = $derived(EMBEDDING_MODELS[effectiveProvider] || []);

  // Whether the current provider supports embedding
  let providerSupportsEmbedding = $derived(availableModels.length > 0);

  // Filter models by current input for smart suggestions
  let filteredModels = $derived.by(() => {
    if (!embeddingModel) return availableModels;
    const q = embeddingModel.toLowerCase();
    const matched = availableModels.filter((m) => m.model.toLowerCase().includes(q));
    return matched.length > 0 ? matched : availableModels;
  });

  // Max dimension warning
  let maxDim = $derived(getMaxDimension(effectiveProvider, embeddingModel));
  let showDimWarning = $derived(embeddingDimensions > maxDim);
  let effectiveDim = $derived(Math.min(embeddingDimensions, maxDim));

  // Load settings
  const unsubSettings = settingsStore.subscribe((s) => {
    embeddingProvider = s.embeddingProvider || '';
    embeddingDimensions = s.embeddingDimensions || 1024;
    autoIndexOnSave = s.autoIndexOnSave || false;
    // Auto-fill model with provider default if empty
    if (s.embeddingModel) {
      embeddingModel = s.embeddingModel;
    } else {
      const p = s.embeddingProvider || aiStore.getActiveConfig()?.provider || 'openai';
      const presets = EMBEDDING_MODELS[p];
      embeddingModel = presets?.[0]?.model || '';
    }
  });

  const unsubFiles = filesStore.subscribe((s) => {
    knowledgeBases = s.knowledgeBases;
    const kb = s.knowledgeBases.find((k) => k.id === s.activeKnowledgeBaseId);
    const newPath = kb?.path || '';
    const newName = kb?.name || '';
    if (newPath !== activeKBPath) {
      activeKBPath = newPath;
      activeKBName = newName;
      if (newPath) loadStatus();
    }
  });

  async function loadStatus() {
    if (!activeKBPath) {
      indexStatus = null;
      return;
    }
    try {
      indexStatus = await getIndexStatus(activeKBPath);
    } catch {
      indexStatus = null;
    }
  }

  function handleProviderChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    // Auto-fill default model for the new provider
    const newProvider = val || aiStore.getActiveConfig()?.provider || 'openai';
    const presets = EMBEDDING_MODELS[newProvider];
    const defaultModel = presets?.[0]?.model || '';
    settingsStore.update({ embeddingProvider: val || null, embeddingModel: defaultModel });
    embeddingModel = defaultModel;
  }

  function handleModelChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    settingsStore.update({ embeddingModel: val });
  }

  function handleDimensionsChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 64 && val <= 4096) {
      settingsStore.update({ embeddingDimensions: val });
    }
  }

  function handleAutoIndexChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    settingsStore.update({ autoIndexOnSave: checked });
  }

  async function handleReindex() {
    if (!activeKBPath || isIndexing) return;
    const config = getEmbeddingConfig();
    if (!config) return;

    isIndexing = true;
    try {
      indexStatus = await indexKnowledgeBase(activeKBPath, config);
    } catch (e) {
      console.error('[KB] Indexing failed:', e);
    } finally {
      isIndexing = false;
    }
  }

  async function handleDeleteIndex() {
    if (!activeKBPath) return;
    try {
      await deleteIndex(activeKBPath);
      indexStatus = null;
      await loadStatus();
    } catch (e) {
      console.error('[KB] Delete failed:', e);
    }
  }

  let progressUnlisten: UnlistenFn | null = null;

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.model-combo')) {
      showModelDropdown = false;
    }
  }

  onMount(async () => {
    window.addEventListener('click', handleWindowClick);
    loadStatus();
    progressUnlisten = await listen<{
      phase: string;
      current: number;
      total: number;
      file_name: string;
    }>('kb-index-progress', (event) => {
      progressPhase = event.payload.phase;
      progressCurrent = event.payload.current;
      progressTotal = event.payload.total;
      progressFileName = event.payload.file_name;
    });
  });

  onDestroy(() => {
    unsubSettings();
    unsubFiles();
    progressUnlisten?.();
    window.removeEventListener('click', handleWindowClick);
  });
</script>

<div class="kb-settings">
  <!-- Knowledge Base Management -->
  <div class="kb-manage-section">
    <div class="kb-manage-row">
      <button class="kb-manage-btn" onclick={() => onOpenKBManager?.()}>
        {$t('knowledgeBase.manage')}
      </button>
      <span class="kb-count">{knowledgeBases.length} {$t('knowledgeBase.title').toLowerCase()}</span>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="setting-group">
    <label class="setting-label">{$t('kb.provider')}</label>
    <select class="setting-input" value={embeddingProvider} onchange={handleProviderChange}>
      {#each PROVIDERS as p}
        <option value={p.value}>{p.value === '' ? $t(p.label) : p.label}</option>
      {/each}
    </select>
    {#if !embeddingProvider && !providerSupportsEmbedding}
      <div class="provider-warning">
        {$t('kb.providerNoEmbedding')}
      </div>
    {/if}
  </div>

  <div class="setting-group">
    <label class="setting-label">{$t('kb.model')}</label>
    <div class="model-combo">
      <input
        class="setting-input model-input"
        type="text"
        value={embeddingModel}
        placeholder={availableModels[0]?.model || 'text-embedding-3-small'}
        onfocus={() => showModelDropdown = true}
        oninput={(e) => { embeddingModel = (e.target as HTMLInputElement).value; showModelDropdown = true; }}
        onchange={handleModelChange}
        onkeydown={(e) => { if (e.key === 'Escape') showModelDropdown = false; }}
      />
      {#if showModelDropdown && filteredModels.length > 0}
        <div class="model-dropdown">
          {#each filteredModels as m}
            <button
              class="model-option"
              class:active={embeddingModel === m.model}
              onmousedown={(e) => {
                e.preventDefault();
                embeddingModel = m.model;
                settingsStore.update({ embeddingModel: m.model });
                showModelDropdown = false;
              }}
            >
              <span class="model-name">{m.model}</span>
              <span class="model-dim">max {m.maxDim}d</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="setting-group">
    <label class="setting-label" for="kb-dimensions">{$t('kb.dimensions')}</label>
    <input
      id="kb-dimensions"
      class="setting-input"
      type="number"
      min="64"
      max="4096"
      step="64"
      value={embeddingDimensions}
      onchange={handleDimensionsChange}
    />
    {#if showDimWarning}
      <div class="dim-warning">
        {$t('kb.dimensionWarning').replace('{max}', String(maxDim)).replace('{actual}', String(effectiveDim))}
      </div>
    {/if}
  </div>

  <div class="setting-group">
    <label class="setting-label setting-checkbox">
      <input type="checkbox" checked={autoIndexOnSave} onchange={handleAutoIndexChange} />
      {$t('kb.autoIndex')}
    </label>
  </div>

  {#if activeKBPath}
    <div class="kb-status-section">
      <div class="section-title">{activeKBName}</div>

      {#if indexStatus?.indexed}
        <div class="status-text">
          {$t('kb.status.indexed')
            .replace('{chunks}', String(indexStatus.chunkCount))
            .replace('{files}', String(indexStatus.fileCount))}
        </div>
        {#if indexStatus.lastUpdated}
          <div class="status-meta">{new Date(indexStatus.lastUpdated).toLocaleString()}</div>
        {/if}
        {#if indexStatus.staleFiles.length > 0}
          <div class="status-stale">
            {$t('kb.status.stale').replace('{count}', String(indexStatus.staleFiles.length))}
          </div>
        {/if}
      {:else}
        <div class="status-text">{$t('kb.status.notIndexed')}</div>
      {/if}

      {#if isIndexing}
        <div class="progress-section">
          <div class="progress-text">
            {#if progressPhase === 'scanning'}
              {$t('kb.progress.scanning')}
            {:else if progressPhase === 'chunking'}
              {$t('kb.progress.chunking').replace('{current}', String(progressCurrent)).replace('{total}', String(progressTotal))}
            {:else if progressPhase === 'embedding'}
              {$t('kb.progress.embedding').replace('{current}', String(progressCurrent)).replace('{total}', String(progressTotal))}
            {:else if progressPhase === 'indexing'}
              {$t('kb.progress.indexing')}
            {:else if progressPhase === 'done'}
              {$t('kb.progress.done')}
            {/if}
          </div>
          {#if progressTotal > 0}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {(progressCurrent / progressTotal) * 100}%"></div>
            </div>
          {/if}
        </div>
      {/if}

      <div class="action-buttons">
        <button class="btn btn-primary" onclick={handleReindex} disabled={isIndexing}>
          {$t('kb.reindexAll')}
        </button>
        {#if indexStatus?.indexed}
          <button class="btn btn-danger" onclick={handleDeleteIndex} disabled={isIndexing}>
            {$t('kb.deleteIndex')}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .kb-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .kb-manage-section {
    display: flex;
    align-items: center;
  }

  .kb-manage-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .kb-manage-btn {
    padding: 5px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .kb-manage-btn:hover {
    background: var(--bg-hover);
  }

  .kb-count {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .section-divider {
    height: 1px;
    background: var(--border-color);
    margin: 4px 0;
  }

  .model-combo {
    position: relative;
  }

  .model-input {
    width: 100%;
    box-sizing: border-box;
  }

  .model-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 2px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10;
    max-height: 180px;
    overflow-y: auto;
  }

  .model-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
  }

  .model-option:hover,
  .model-option.active {
    background: var(--bg-hover);
  }

  .model-name {
    font-family: monospace;
  }

  .model-dim {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    flex-shrink: 0;
    margin-left: 8px;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .setting-input {
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }

  .setting-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .dim-warning,
  .provider-warning {
    font-size: var(--font-size-xs);
    color: var(--text-warning, #e0a800);
    margin-top: 4px;
  }

  .kb-status-section {
    margin-top: 8px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-secondary);
  }

  .section-title {
    font-weight: 600;
    font-size: var(--font-size-sm);
    margin-bottom: 8px;
  }

  .status-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  .status-meta {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .status-stale {
    font-size: var(--font-size-xs);
    color: var(--text-warning, #e0a800);
    margin-top: 4px;
  }

  .progress-section {
    margin-top: 8px;
  }

  .progress-text {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .progress-bar {
    height: 4px;
    background: var(--border-color);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-color, #4a9eff);
    transition: width 0.3s ease;
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .btn {
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent-color, #4a9eff);
    color: white;
  }

  .btn-danger {
    background: transparent;
    border: 1px solid var(--text-danger, #e53e3e);
    color: var(--text-danger, #e53e3e);
  }
</style>
