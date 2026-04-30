<script lang="ts">
  import CloudResourcePicker from './CloudResourcePicker.svelte';
  import type { UnifiedMediaItem } from '$lib/services/cloud-resource/types';

  let {
    targetPos,
    mode = 'insert',
    embedded = false,
    onInsert,
    onClose,
  }: {
    targetPos?: number;
    mode?: 'insert' | 'browse';
    embedded?: boolean;
    onInsert?: (items: UnifiedMediaItem[], insertAsHtml: boolean, targetPos?: number) => void;
    onClose: () => void;
  } = $props();
</script>

<CloudResourcePicker type="image" multiSelect={true} {targetPos} {mode} {embedded} {onInsert} {onClose} />
