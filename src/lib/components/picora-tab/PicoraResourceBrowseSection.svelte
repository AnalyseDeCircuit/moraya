<script lang="ts">
  import { t } from '$lib/i18n';
  import CloudImagePicker from '$lib/components/cloud-resource/CloudImagePicker.svelte';
  import CloudAudioPicker from '$lib/components/cloud-resource/CloudAudioPicker.svelte';
  import CloudVideoPicker from '$lib/components/cloud-resource/CloudVideoPicker.svelte';

  type Tab = 'image' | 'audio' | 'video';
  let activeTab = $state<Tab>('image');

  const tr = $t;

  function noop() { /* embedded mode never closes — owned by parent settings panel */ }
</script>

<section class="resource-browse-section">
  <header class="section-header">
    <h3>{tr('settings.picora.resources.title')}</h3>
    <div class="tabs">
      <button class="tab-btn" class:active={activeTab === 'image'} onclick={() => { activeTab = 'image'; }}>
        {tr('settings.picora.resources.tabs.image')}
      </button>
      <button class="tab-btn" class:active={activeTab === 'audio'} onclick={() => { activeTab = 'audio'; }}>
        {tr('settings.picora.resources.tabs.audio')}
      </button>
      <button class="tab-btn" class:active={activeTab === 'video'} onclick={() => { activeTab = 'video'; }}>
        {tr('settings.picora.resources.tabs.video')}
      </button>
    </div>
  </header>

  <div class="picker-frame">
    {#if activeTab === 'image'}
      <CloudImagePicker mode="browse" embedded={true} onClose={noop} />
    {:else if activeTab === 'audio'}
      <CloudAudioPicker mode="browse" embedded={true} onClose={noop} />
    {:else if activeTab === 'video'}
      <CloudVideoPicker mode="browse" embedded={true} onClose={noop} />
    {/if}
  </div>
</section>

<style>
  .resource-browse-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 0.5rem;
  }
  .section-header h3 { margin: 0; font-size: var(--font-size-base); font-weight: 600; color: var(--text-primary); }
  .tabs { display: flex; gap: 0; }
  .tab-btn {
    padding: 0.25rem 0.7rem;
    background: transparent;
    border: 1px solid var(--border-light);
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--font-size-xs);
  }
  .tab-btn:first-child { border-radius: 4px 0 0 4px; }
  .tab-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }
  .tab-btn.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
  .picker-frame {
    border: 1px solid var(--border-light);
    border-radius: 6px;
    overflow: hidden;
  }
</style>
