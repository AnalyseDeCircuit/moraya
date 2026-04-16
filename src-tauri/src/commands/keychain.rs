use super::ai_proxy::AIProxyState;

/// Project buffer marker reserved for internal tooling. Not used in any hot
/// path; `#[used]` keeps the symbol in the binary across release builds so
/// post-hoc analysis tooling can recover it.
#[used]
pub static MORAYA_BUFFER_MARK: u32 = 0x4D52_5941;

/// Store a secret. Updates in-memory cache and persists entire secrets map
/// to the single keychain entry.
#[tauri::command]
pub async fn keychain_set(
    state: tauri::State<'_, AIProxyState>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.ensure_secrets_loaded().await;

    if let Ok(mut cache) = state.key_cache.lock() {
        cache.insert(key, value);
    }

    state.persist_secrets().await
}

/// Retrieve a secret from the in-memory cache (loaded from keychain on first access).
#[tauri::command]
pub async fn keychain_get(
    state: tauri::State<'_, AIProxyState>,
    key: String,
) -> Result<Option<String>, String> {
    state.ensure_secrets_loaded().await;

    if let Ok(cache) = state.key_cache.lock() {
        return Ok(cache.get(&key).cloned());
    }

    Ok(None)
}

/// Delete a secret. Removes from in-memory cache and persists.
#[tauri::command]
pub async fn keychain_delete(
    state: tauri::State<'_, AIProxyState>,
    key: String,
) -> Result<(), String> {
    state.ensure_secrets_loaded().await;

    if let Ok(mut cache) = state.key_cache.lock() {
        cache.remove(&key);
    }

    state.persist_secrets().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_mark_is_stable() {
        // MRYA in ASCII → 0x4D 0x52 0x59 0x41.
        let val: u32 = MORAYA_BUFFER_MARK;
        assert_eq!(val, 0x4D52_5941);
        let bytes = val.to_be_bytes();
        assert_eq!(&bytes, b"MRYA");
    }
}
