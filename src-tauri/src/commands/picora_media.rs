/**
 * Picora media listing & detail commands.
 *
 * Covers:
 *   GET /v1/media?type=image|audio|video&cursor=&limit=&q=&isPublic=&kbId=&status=
 *   GET /v1/images/:id | /v1/audio/:id | /v1/videos/:id
 *   GET /v1/videos/:id/status
 *   PATCH /v1/images/:id | /v1/audio/:id | /v1/videos/:id  (visibility toggle)
 *
 * All HTTP calls use Bearer auth; errors are sanitized before returning.
 */

use serde::{Deserialize, Serialize};
use tauri::command;

const DEFAULT_TIMEOUT_SECS: u64 = 20;

// ── HTTP helpers ──────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .build()
        .map_err(|_| "Failed to initialize HTTP client".to_string())
}

fn sanitize_status(status: u16) -> String {
    match status {
        401 | 403 => format!("Picora authentication failed ({})", status),
        404 => "Picora resource not found (404)".to_string(),
        408 | 504 => format!("Picora request timed out ({})", status),
        429 => "Picora rate limit exceeded (429)".to_string(),
        500..=599 => format!("Picora service unavailable ({})", status),
        _ => format!("Picora request failed ({})", status),
    }
}

fn build_error(status: u16, body: &str, ctx: &str) -> String {
    let cleaned: String = body
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(200)
        .collect();
    let cleaned = cleaned
        .replace("sk_live_", "sk_***_")
        .replace("Bearer ", "Bearer ***");
    if cleaned.is_empty() {
        format!("[{}] {}", ctx, sanitize_status(status))
    } else {
        format!("[{}] {} — {}", ctx, sanitize_status(status), cleaned)
    }
}

// ── Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedMediaItem {
    pub id: String,
    #[serde(rename = "type")]
    pub media_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playback_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    pub filename: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub size_bytes: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub is_public: bool,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kb_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaListResponse {
    pub items: Vec<UnifiedMediaItem>,
    pub next_cursor: Option<String>,
    pub total: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoStatus {
    pub id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playback_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerCaps {
    pub media_listing_v2: bool,
}

// ── Commands ──────────────────────────────────────────────────────────

/// List media assets from Picora. Corresponds to GET /v1/media.
#[command]
pub async fn picora_media_list(
    api_base: String,
    api_key: String,
    media_type: String,
    cursor: Option<String>,
    limit: u32,
    q: Option<String>,
    is_public: Option<bool>,
    kb_id: Option<String>,
    status_filter: Option<String>,
) -> Result<MediaListResponse, String> {
    if api_base.trim().is_empty() {
        return Err("Picora endpoint is empty".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("Picora API key is empty".to_string());
    }
    if !["image", "audio", "video"].contains(&media_type.as_str()) {
        return Err(format!("Invalid media_type: {}", media_type));
    }
    let limit = limit.clamp(1, 50);

    let base = api_base.trim_end_matches('/');
    let url = format!("{}/v1/media", base);

    let client = http_client()?;
    let mut req = client
        .get(&url)
        .bearer_auth(&api_key)
        .query(&[("type", media_type.as_str()), ("limit", &limit.to_string())]);

    if let Some(c) = &cursor {
        req = req.query(&[("cursor", c.as_str())]);
    }
    if let Some(q_val) = &q {
        if !q_val.is_empty() {
            req = req.query(&[("q", q_val.as_str())]);
        }
    }
    if let Some(pub_val) = is_public {
        req = req.query(&[("isPublic", if pub_val { "true" } else { "false" })]);
    }
    if let Some(kb) = &kb_id {
        req = req.query(&[("kbId", kb.as_str())]);
    }
    if let Some(st) = &status_filter {
        if !st.is_empty() {
            req = req.query(&[("status", st.as_str())]);
        }
    }

    let res = req.send().await.map_err(|_| "Network error contacting Picora".to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(build_error(status, &body, "media_list"));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|_| "Picora returned invalid JSON".to_string())?;

    let data = body.get("data").unwrap_or(&body);
    // Picora `/v1/media` returns one of:
    //   1. `{ "data": [...] }`                           (legacy)
    //   2. `{ "data": { "items": [...], "nextCursor" } }` (paginated, v0.17.1+)
    //   3. `[...]`                                       (bare array)
    let items_val = data
        .get("items")
        .cloned()
        .or_else(|| data.as_array().map(|arr| serde_json::Value::Array(arr.clone())))
        .unwrap_or(serde_json::Value::Array(vec![]));
    // Surface the real serde error instead of silently swallowing it — a
    // single new/renamed field from the server otherwise wipes the entire
    // list with no diagnostic, leaving users with an empty picker.
    let items: Vec<UnifiedMediaItem> = serde_json::from_value(items_val)
        .map_err(|e| format!("Failed to parse Picora media list: {}", e))?;

    let next_cursor = data
        .get("nextCursor")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());

    let total = data
        .get("total")
        .and_then(|v| v.as_i64());

    Ok(MediaListResponse { items, next_cursor, total })
}

/// Fetch detail for a single media asset.
///
/// **Endpoint strategy** (per Picora v0.18.4 release notes):
///   1. Prefer `GET /v1/media/:id` — unified endpoint that auto-detects the
///      type from `med_media.media_type` and falls back to `img_images`. Uses
///      the same ID space as the `/v1/media?type=...` listing, so IDs always
///      resolve. Available on Picora ≥ v0.18.4.
///   2. Fall back to `GET /v1/{images|audio|videos}/:id` only if the unified
///      endpoint 404s — supports older Picora servers without v0.18.4.
#[command]
pub async fn picora_media_detail(
    api_base: String,
    api_key: String,
    media_type: String,
    id: String,
) -> Result<UnifiedMediaItem, String> {
    if api_base.trim().is_empty() {
        return Err("Picora endpoint is empty".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("Picora API key is empty".to_string());
    }
    let path = match media_type.as_str() {
        "image" => "images",
        "audio" => "audio",
        "video" => "videos",
        _ => return Err(format!("Invalid media_type: {}", media_type)),
    };
    if id.trim().is_empty() {
        return Err("Media ID is empty".to_string());
    }

    let base = api_base.trim_end_matches('/');
    let unified = format!("{}/v1/media/{}", base, id.trim());
    let client = http_client()?;

    // 1) Unified endpoint first.
    let res = client
        .get(&unified)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|_| "Network error contacting Picora".to_string())?;

    // 2) Fallback to type-specific path for older Picora (< v0.18.4) on 404.
    let res = if res.status().as_u16() == 404 {
        let typed = format!("{}/v1/{}/{}", base, path, id.trim());
        client
            .get(&typed)
            .bearer_auth(&api_key)
            .send()
            .await
            .map_err(|_| "Network error contacting Picora".to_string())?
    } else {
        res
    };

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(build_error(status, &body, "media_detail"));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|_| "Picora returned invalid JSON".to_string())?;

    let data = body.get("data").unwrap_or(&body);
    let mut item: UnifiedMediaItem = serde_json::from_value(data.clone())
        .map_err(|_| "Failed to parse media detail response".to_string())?;

    // Defensive URL recovery: when both `url` and `playbackUrl` are empty,
    // scan the raw detail JSON for any HTTPS-shaped string (covers Picora
    // server variants that put the playable URL under a different key —
    // e.g. `streamUrl`, `videoUrl`, `mp4Url`, `hlsUrl`, or nested `sources[].src`).
    if item.url.as_deref().unwrap_or("").is_empty()
        && item.playback_url.as_deref().unwrap_or("").is_empty()
    {
        if let Some(found) = find_first_url(data) {
            item.playback_url = Some(found);
        }
    }
    Ok(item)
}

/// Recursively walk a JSON value and return the first string that looks like
/// a media-playable URL (https:// or http://, not the thumbnail). Skips known
/// non-playback fields like `thumbnailUrl`, `posterUrl` so the heuristic
/// doesn't accidentally pick the cover image as the playback source.
fn find_first_url(v: &serde_json::Value) -> Option<String> {
    const SKIP_KEYS: &[&str] = &["thumbnailUrl", "posterUrl", "coverUrl", "previewUrl"];
    match v {
        serde_json::Value::Object(map) => {
            for (k, child) in map.iter() {
                if SKIP_KEYS.contains(&k.as_str()) {
                    continue;
                }
                if let Some(found) = find_first_url(child) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for child in arr {
                if let Some(found) = find_first_url(child) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::String(s) => {
            if s.starts_with("https://") || s.starts_with("http://") {
                Some(s.clone())
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Poll video transcoding status.
#[command]
pub async fn picora_video_status(
    api_base: String,
    api_key: String,
    id: String,
) -> Result<VideoStatus, String> {
    if api_base.trim().is_empty() {
        return Err("Picora endpoint is empty".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("Picora API key is empty".to_string());
    }
    if id.trim().is_empty() {
        return Err("Video ID is empty".to_string());
    }

    let base = api_base.trim_end_matches('/');
    let url = format!("{}/v1/videos/{}/status", base, id.trim());
    let client = http_client()?;

    let res = client
        .get(&url)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|_| "Network error contacting Picora".to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(build_error(status, &body, "video_status"));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|_| "Picora returned invalid JSON".to_string())?;

    let data = body.get("data").unwrap_or(&body);
    serde_json::from_value(data.clone())
        .map_err(|_| "Failed to parse video status response".to_string())
}

/// Toggle is_public on a media asset.
#[command]
pub async fn picora_media_update_visibility(
    api_base: String,
    api_key: String,
    media_type: String,
    id: String,
    is_public: bool,
) -> Result<(), String> {
    if api_base.trim().is_empty() {
        return Err("Picora endpoint is empty".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("Picora API key is empty".to_string());
    }
    let path = match media_type.as_str() {
        "image" => "images",
        "audio" => "audio",
        "video" => "videos",
        _ => return Err(format!("Invalid media_type: {}", media_type)),
    };
    if id.trim().is_empty() {
        return Err("Media ID is empty".to_string());
    }

    let base = api_base.trim_end_matches('/');
    let url = format!("{}/v1/{}/{}", base, path, id.trim());
    let client = http_client()?;

    let body = serde_json::json!({ "isPublic": is_public });
    let res = client
        .patch(&url)
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|_| "Network error contacting Picora".to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body_text = res.text().await.unwrap_or_default();
        return Err(build_error(status, &body_text, "media_visibility"));
    }

    Ok(())
}

/// Probe Picora server capabilities via GET /v1/health.
#[command]
pub async fn picora_server_caps(
    api_base: String,
    api_key: String,
) -> Result<ServerCaps, String> {
    if api_base.trim().is_empty() {
        return Err("Picora endpoint is empty".to_string());
    }

    let base = api_base.trim_end_matches('/');
    let url = format!("{}/v1/health", base);
    let client = http_client()?;

    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.bearer_auth(&api_key);
    }

    let res = req.send().await.map_err(|_| "Network error contacting Picora".to_string())?;

    if !res.status().is_success() {
        return Ok(ServerCaps { media_listing_v2: false });
    }

    let body: serde_json::Value = res
        .json()
        .await
        .unwrap_or(serde_json::json!({}));

    let media_listing_v2 = body
        .pointer("/data/features/mediaListingV2")
        .or_else(|| body.pointer("/features/mediaListingV2"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(ServerCaps { media_listing_v2 })
}

// ── Unit tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_status_401() {
        let msg = sanitize_status(401);
        assert!(msg.contains("authentication failed"));
        assert!(!msg.contains("sk_live"));
    }

    #[test]
    fn sanitize_status_404() {
        assert!(sanitize_status(404).contains("not found"));
    }

    #[test]
    fn sanitize_status_500() {
        assert!(sanitize_status(500).contains("unavailable"));
    }

    #[test]
    fn build_error_strips_bearer_token() {
        let msg = build_error(401, "Bearer sk_live_secrettoken invalid", "test");
        assert!(!msg.contains("sk_live_secrettoken"));
        assert!(msg.contains("sk_***_"));
    }

    #[test]
    fn build_error_truncates_long_body() {
        let long_body = "x".repeat(300);
        let msg = build_error(500, &long_body, "ctx");
        // Should not exceed sane length (200 char body cap + prefix)
        assert!(msg.len() < 350);
    }

    #[test]
    fn build_error_fallback_on_empty_body() {
        let msg = build_error(403, "", "test");
        assert!(msg.contains("authentication failed"));
        assert!(msg.contains("[test]"));
    }
}
