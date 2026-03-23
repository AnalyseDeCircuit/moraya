<script lang="ts">
  import { t } from '$lib/i18n';
  import type { SearchResult } from '$lib/services/kb/types';

  let {
    results,
    loading = false,
    onSelect,
  }: {
    results: SearchResult[];
    loading?: boolean;
    onSelect: (result: SearchResult) => void;
  } = $props();

  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }
</script>

<div class="kb-search-results">
  {#if loading}
    <div class="search-loading">{$t('kb.indexing')}</div>
  {:else if results.length === 0}
    <div class="search-empty">{$t('commandPalette.noResults')}</div>
  {:else}
    {#each results as result}
      <button class="search-result-item" onclick={() => onSelect(result)}>
        <div class="result-header">
          <span class="result-file">{getFileName(result.filePath)}</span>
          {#if result.heading}
            <span class="result-heading"> &gt; {result.heading}</span>
          {/if}
          <span class="result-score">{result.score.toFixed(2)}</span>
        </div>
        <div class="result-preview">{result.preview.slice(0, 150)}</div>
      </button>
    {/each}
  {/if}
</div>

<style>
  .kb-search-results {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .search-loading,
  .search-empty {
    padding: 12px 8px;
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
  }

  .search-result-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    width: 100%;
  }

  .search-result-item:hover {
    background: var(--bg-hover);
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
  }

  .result-file {
    color: var(--text-primary);
    font-weight: 500;
  }

  .result-heading {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .result-score {
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 10px;
    flex-shrink: 0;
  }

  .result-preview {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }
</style>
