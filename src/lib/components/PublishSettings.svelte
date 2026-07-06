<script lang="ts">
  import { onDestroy } from 'svelte';
  import { settingsStore } from '$lib/stores/settings-store';
  import { t } from '$lib/i18n';
  import {
    type PublishTarget,
    type GitHubTarget,
    type CustomAPITarget,
    FRONT_MATTER_PRESETS,
    FILE_NAME_PRESETS,
    DEFAULT_RSS_CONFIG,
    resolveFileName,
    createDefaultGitHubTarget,
    createDefaultCustomAPITarget,
  } from '$lib/services/publish/types';
  import { testGitHubConnection } from '$lib/services/publish/github-publisher';
  import { testCustomAPIConnection } from '$lib/services/publish/api-publisher';
  import { Select } from '$lib/components/ui';

  let targets = $state<PublishTarget[]>([]);
  let editingTarget = $state<PublishTarget | null>(null);
  let showAddMenu = $state(false);
  let testStatus = $state<Record<string, 'idle' | 'testing' | 'success' | 'failed'>>({});
  let headersText = $state('');

  // Top-level store subscription — do NOT wrap in $effect().
  // Svelte 5 $effect tracks reads in subscribe callbacks, causing infinite loops.
  const unsubSettings = settingsStore.subscribe(state => {
    targets = state.publishTargets || [];
  });
  onDestroy(() => { unsubSettings(); });

  function addGitHubTarget() {
    editingTarget = createDefaultGitHubTarget();
    showAddMenu = false;
  }

  function addCustomAPITarget() {
    const target = createDefaultCustomAPITarget();
    editingTarget = target;
    headersText = JSON.stringify(target.headers, null, 2);
    showAddMenu = false;
  }

  function editTarget(target: PublishTarget) {
    const cloned = JSON.parse(JSON.stringify(target));
    // Ensure rss config exists for backward compatibility
    if (cloned.type === 'github' && !cloned.rss) {
      cloned.rss = { ...DEFAULT_RSS_CONFIG };
    } else if (cloned.type === 'custom-api' && !cloned.rss) {
      cloned.rss = { enabled: false, feedEndpoint: '' };
    }
    editingTarget = cloned;
    if (cloned.type === 'custom-api') {
      headersText = JSON.stringify((cloned as CustomAPITarget).headers, null, 2);
    }
  }

  function deleteTarget(id: string) {
    const updated = targets.filter(t => t.id !== id);
    settingsStore.update({ publishTargets: JSON.parse(JSON.stringify(updated)) });
  }

  function saveTarget() {
    if (!editingTarget) return;
    // Sanitize macOS smart/curly quotes for custom-api targets
    if (editingTarget.type === 'custom-api') {
      const api = editingTarget as CustomAPITarget;
      try {
        const sanitized = headersText
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'");
        api.headers = JSON.parse(sanitized);
      } catch {
        // Keep existing headers if JSON is invalid
      }
      api.bodyTemplate = api.bodyTemplate
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
    }
    // Deep clone to plain object to avoid Svelte 5 $state proxy in store
    const targetToSave: PublishTarget = JSON.parse(JSON.stringify(editingTarget));
    const existing = targets.findIndex(t => t.id === targetToSave.id);
    let updated: PublishTarget[];
    if (existing >= 0) {
      updated = [...targets];
      updated[existing] = targetToSave;
    } else {
      updated = [...targets, targetToSave];
    }
    // Deep clone entire array to strip Svelte 5 $state proxies before passing to store
    settingsStore.update({ publishTargets: JSON.parse(JSON.stringify(updated)) });
    editingTarget = null;
  }

  function cancelEdit() {
    editingTarget = null;
  }

  async function testConnection(target: PublishTarget) {
    testStatus[target.id] = 'testing';
    testStatus = { ...testStatus };
    let success = false;
    if (target.type === 'github') {
      success = await testGitHubConnection(target);
    } else {
      success = await testCustomAPIConnection(target);
    }
    testStatus[target.id] = success ? 'success' : 'failed';
    testStatus = { ...testStatus };
    setTimeout(() => {
      testStatus[target.id] = 'idle';
      testStatus = { ...testStatus };
    }, 3000);
  }

  function handlePresetChange(preset: string) {
    if (!editingTarget || editingTarget.type !== 'github') return;
    const gh = editingTarget as GitHubTarget;
    gh.frontMatterPreset = preset;
    if (FRONT_MATTER_PRESETS[preset]) {
      gh.frontMatterTemplate = FRONT_MATTER_PRESETS[preset];
    }
  }

  function handleFileNamePresetChange(preset: string) {
    if (!editingTarget) return;
    if (FILE_NAME_PRESETS[preset]) {
      editingTarget.fileNamePattern = FILE_NAME_PRESETS[preset];
    }
  }

  let templatePresetOptions = $derived([
    { value: 'hugo', label: $t('publish.preset_hugo') },
    { value: 'hexo', label: $t('publish.preset_hexo') },
    { value: 'astro', label: $t('publish.preset_astro') },
    { value: 'custom', label: $t('publish.preset_custom') },
  ]);

  let methodOptions = $derived([
    { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' },
  ]);

  let fileNamePresetOptions = $derived([
    { value: 'dateSlug', label: $t('publish.preset_date_slug') },
    { value: 'simple', label: $t('publish.preset_simple') },
    { value: 'dateFilename', label: $t('publish.preset_date_filename') },
    { value: 'yearMonth', label: $t('publish.preset_year_month') },
  ]);

  // Which preset key matches the current file-name pattern (for the Select value).
  let fileNamePresetValue = $derived.by(() => {
    const pattern = editingTarget?.fileNamePattern;
    const match = (Object.keys(FILE_NAME_PRESETS) as (keyof typeof FILE_NAME_PRESETS)[])
      .find((k) => FILE_NAME_PRESETS[k] === pattern);
    return match ?? undefined;
  });

  let fileNamePreview = $derived.by(() => {
    if (!editingTarget) return '';
    const pattern = editingTarget.fileNamePattern || '{{date}}-{{slug}}';
    return resolveFileName(pattern, {
      date: new Date().toISOString().slice(0, 10),
      slug: 'my-article',
      filename: 'my-article',
      title: 'My Article',
    });
  });
</script>

<div class="publish-settings gx-tab">
  {#if editingTarget}
    <!-- Edit form -->
    <div class="edit-form">
      <div class="form-header">
        <h4>{editingTarget.type === 'github' ? $t('publish.github') : $t('publish.custom_api')}</h4>
      </div>

      <div class="setting-group">
        <label class="setting-label" for="pub-target-name">{$t('publish.target_name')}</label>
        <input
          id="pub-target-name"
          type="text"
          class="setting-input"
          bind:value={editingTarget.name}
          placeholder={$t('publish.target_name_placeholder')}
        />
      </div>

      {#if editingTarget.type === 'github'}
        {@const gh = editingTarget as GitHubTarget}
        <div class="setting-group">
          <label class="setting-label" for="pub-repo-url">{$t('publish.repo_url')}</label>
          <input
            id="pub-repo-url"
            type="text"
            class="setting-input"
            bind:value={gh.repoUrl}
            placeholder={$t('publish.repo_url_placeholder')}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-branch">{$t('publish.branch')}</label>
          <input id="pub-branch" type="text" class="setting-input" bind:value={gh.branch} />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-articles-dir">{$t('publish.articles_dir')}</label>
          <input
            id="pub-articles-dir"
            type="text"
            class="setting-input"
            bind:value={gh.articlesDir}
            placeholder={$t('publish.articles_dir_placeholder')}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-images-dir">{$t('publish.images_dir')}</label>
          <input
            id="pub-images-dir"
            type="text"
            class="setting-input"
            bind:value={gh.imagesDir}
            placeholder={$t('publish.images_dir_placeholder')}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-token">{$t('publish.token')}</label>
          <input
            id="pub-token"
            type="password"
            class="setting-input"
            bind:value={gh.token}
            placeholder={$t('publish.token_placeholder')}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-template-preset">{$t('publish.template_presets')}</label>
          <Select
            id="pub-template-preset"
            class="setting-input"
            block
            value={gh.frontMatterPreset || 'hugo'}
            options={templatePresetOptions}
            onchange={(v) => handlePresetChange(v as string)}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-front-matter">{$t('publish.front_matter_template')}</label>
          <textarea
            id="pub-front-matter"
            class="setting-textarea"
            bind:value={gh.frontMatterTemplate}
            spellcheck="false"
            rows="8"
          ></textarea>
        </div>
      {:else}
        {@const api = editingTarget as CustomAPITarget}
        <div class="setting-group">
          <label class="setting-label" for="pub-endpoint">{$t('publish.endpoint')}</label>
          <input
            id="pub-endpoint"
            type="text"
            class="setting-input"
            bind:value={api.endpoint}
            placeholder={$t('publish.endpoint_placeholder')}
          />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-method">{$t('publish.method')}</label>
          <Select id="pub-method" class="setting-input" block bind:value={api.method} options={methodOptions} />
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-headers">{$t('publish.headers')}</label>
          <textarea
            id="pub-headers"
            class="setting-textarea"
            bind:value={headersText}
            spellcheck="false"
            rows="4"
          ></textarea>
        </div>

        <div class="setting-group">
          <label class="setting-label" for="pub-body-template">{$t('publish.body_template')}</label>
          <textarea
            id="pub-body-template"
            class="setting-textarea"
            bind:value={api.bodyTemplate}
            spellcheck="false"
            rows="8"
          ></textarea>
        </div>
      {/if}

      <!-- File naming pattern (shared for all target types) -->
      <div class="setting-group">
        <label class="setting-label" for="pub-filename-input">{$t('publish.file_name_pattern')}</label>
        <div class="filename-row">
          <Select
            class="setting-input filename-preset"
            value={fileNamePresetValue}
            options={fileNamePresetOptions}
            onchange={(v) => handleFileNamePresetChange(v as string)}
          />
          <input
            id="pub-filename-input"
            type="text"
            class="setting-input filename-input"
            bind:value={editingTarget.fileNamePattern}
            placeholder={'{{date}}-{{slug}}'}
          />
        </div>
        <span class="setting-hint filename-preview">{$t('publish.file_name_preview')}：{fileNamePreview}</span>
        <span class="setting-hint">{$t('publish.file_name_variables')}</span>
      </div>

      <!-- RSS Feed Configuration -->
      {#if editingTarget.type === 'github'}
        {@const gh = editingTarget as GitHubTarget}
        <div class="section-divider">
          <span class="section-title">{$t('publish.rss_section')}</span>
        </div>

        <div class="setting-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={gh.rss?.enabled ?? false}
              onchange={() => { if (gh.rss) gh.rss.enabled = !gh.rss.enabled; }}
            />
            <span>{$t('publish.rss_enable')}</span>
          </label>
          <span class="setting-hint">{$t('publish.rss_enable_hint')}</span>
        </div>

        {#if gh.rss?.enabled}
          <div class="setting-group">
            <label class="setting-label" for="rss-site-url">{$t('publish.rss_site_url')}</label>
            <input
              id="rss-site-url"
              type="text"
              class="setting-input"
              bind:value={gh.rss.siteUrl}
              placeholder={$t('publish.rss_site_url_placeholder')}
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-feed-title">{$t('publish.rss_feed_title')}</label>
            <input
              id="rss-feed-title"
              type="text"
              class="setting-input"
              bind:value={gh.rss.feedTitle}
              placeholder={$t('publish.rss_feed_title_placeholder')}
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-feed-desc">{$t('publish.rss_feed_description')}</label>
            <input
              id="rss-feed-desc"
              type="text"
              class="setting-input"
              bind:value={gh.rss.feedDescription}
              placeholder={$t('publish.rss_feed_description_placeholder')}
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-author">{$t('publish.rss_author_name')}</label>
            <input
              id="rss-author"
              type="text"
              class="setting-input"
              bind:value={gh.rss.authorName}
              placeholder={$t('publish.rss_author_name_placeholder')}
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-language">{$t('publish.rss_language')}</label>
            <input
              id="rss-language"
              type="text"
              class="setting-input"
              bind:value={gh.rss.language}
              placeholder="en"
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-feed-path">{$t('publish.rss_feed_path')}</label>
            <input
              id="rss-feed-path"
              type="text"
              class="setting-input"
              bind:value={gh.rss.feedPath}
              placeholder={$t('publish.rss_feed_path_placeholder')}
            />
          </div>

          <div class="setting-group">
            <label class="setting-label" for="rss-max-items">{$t('publish.rss_max_items')}: {gh.rss.maxItems}</label>
            <input
              id="rss-max-items"
              type="range"
              min="5"
              max="100"
              step="5"
              bind:value={gh.rss.maxItems}
            />
          </div>

          <div class="setting-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={gh.rss.includeFullContent}
                onchange={() => { if (gh.rss) gh.rss.includeFullContent = !gh.rss.includeFullContent; }}
              />
              <span>{$t('publish.rss_include_full_content')}</span>
            </label>
          </div>
        {/if}
      {:else if editingTarget.type === 'custom-api'}
        {@const api = editingTarget as CustomAPITarget}
        <div class="section-divider">
          <span class="section-title">{$t('publish.rss_section')}</span>
        </div>

        <div class="setting-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={api.rss?.enabled ?? false}
              onchange={() => { if (api.rss) api.rss.enabled = !api.rss.enabled; }}
            />
            <span>{$t('publish.rss_enable')}</span>
          </label>
        </div>

        {#if api.rss?.enabled}
          <div class="setting-group">
            <label class="setting-label" for="rss-endpoint">{$t('publish.rss_feed_endpoint')}</label>
            <input
              id="rss-endpoint"
              type="text"
              class="setting-input"
              bind:value={api.rss.feedEndpoint}
              placeholder={$t('publish.rss_feed_endpoint_placeholder')}
            />
          </div>
        {/if}
      {/if}

      <div class="form-actions">
        <button class="btn btn-secondary" onclick={cancelEdit}>{$t('common.cancel')}</button>
        <button class="btn btn-primary" onclick={saveTarget} disabled={!editingTarget.name}>
          {$t('common.save')}
        </button>
      </div>
    </div>
  {:else}
    <!-- Target list -->
    {#if targets.length === 0}
      <div class="empty-state">
        <p>{$t('publish.settings_empty')}</p>
        <p class="hint">{$t('publish.settings_hint')}</p>
      </div>
    {:else}
      <div class="target-list">
        {#each targets as target (target.id)}
          <div class="target-card">
            <div class="target-info">
              <span class="target-icon">
                {target.type === 'github' ? '🔵' : '🟣'}
              </span>
              <div class="target-details">
                <span class="target-name">{target.name || '(unnamed)'}</span>
                <span class="target-type">
                  {target.type === 'github' ? $t('publish.github') : $t('publish.custom_api')}
                </span>
              </div>
            </div>
            <div class="target-actions">
              <button
                class="action-btn"
                class:testing={testStatus[target.id] === 'testing'}
                class:success={testStatus[target.id] === 'success'}
                class:failed={testStatus[target.id] === 'failed'}
                onclick={() => testConnection(target)}
                disabled={testStatus[target.id] === 'testing'}
              >
                {#if testStatus[target.id] === 'testing'}
                  ...
                {:else if testStatus[target.id] === 'success'}
                  ✓
                {:else if testStatus[target.id] === 'failed'}
                  ✗
                {:else}
                  ⚡
                {/if}
              </button>
              <button class="action-btn" onclick={() => editTarget(target)}>✎</button>
              <button class="action-btn danger" onclick={() => deleteTarget(target.id)}>✕</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Add button -->
    <div class="add-section">
      {#if showAddMenu}
        <div class="add-menu">
          <button class="add-option" onclick={addGitHubTarget}>
            🔵 {$t('publish.github')}
          </button>
          <button class="add-option" onclick={addCustomAPITarget}>
            🟣 {$t('publish.custom_api')}
          </button>
        </div>
      {/if}
      <button class="btn btn-add" onclick={() => showAddMenu = !showAddMenu}>
        + {$t('publish.add_target')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* Outer layout: .gx-tab on root. */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-muted);
    text-align: center;
    gap: 0.5rem;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .empty-state .hint {
    font-size: var(--font-size-xs);
  }

  /* Target list */
  .target-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .target-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-primary);
  }

  .target-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .target-icon {
    font-size: 0.85rem;
  }

  .target-details {
    display: flex;
    flex-direction: column;
  }

  .target-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .target-type {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .target-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  }

  .action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action-btn.danger:hover {
    border-color: #dc3545;
    color: #dc3545;
  }

  .action-btn.testing {
    color: var(--accent-color);
    border-color: var(--accent-color);
  }

  .action-btn.success {
    color: #28a745;
    border-color: #28a745;
  }

  .action-btn.failed {
    color: #dc3545;
    border-color: #dc3545;
  }

  /* Add section */
  .add-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .add-menu {
    display: flex;
    gap: 0.5rem;
  }

  .add-option {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  }

  .add-option:hover {
    border-color: var(--accent-color);
    color: var(--text-primary);
  }

  .btn {
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  }

  .btn-add {
    background: transparent;
    color: var(--accent-color);
    border-color: var(--accent-color);
  }

  .btn-add:hover {
    background: var(--accent-color);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-primary);
    color: var(--text-secondary);
  }

  .btn-secondary:hover {
    color: var(--text-primary);
  }

  .btn-primary {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Edit form */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-header h4 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .setting-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .setting-input {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-sans);
  }

  .setting-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .setting-textarea {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    resize: vertical;
    line-height: 1.5;
  }

  .setting-textarea:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-light);
  }

  .filename-row {
    display: flex;
    gap: 0.5rem;
  }

  .filename-input {
    flex: 1;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
  }

  .setting-hint {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }

  .filename-preview {
    color: var(--accent-color);
  }

  /* Section divider */
  .section-divider {
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light);
  }

  .section-title {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Checkbox label */
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }

  /* Range slider */
  input[type="range"] {
    width: 100%;
    cursor: pointer;
  }
</style>
