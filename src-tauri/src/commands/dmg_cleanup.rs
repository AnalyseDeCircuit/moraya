//! Detect and clean up stale Moraya DMG mounts.
//!
//! macOS users routinely forget to eject a downloaded DMG after dragging
//! `Moraya.app` to `/Applications`. The DMG stays mounted at `/Volumes/Moraya*`
//! and macOS LaunchServices registers the `.app` bundle inside it — so the
//! "Open With" menu sprouts one Moraya entry per previously downloaded
//! version. v0.41.6 added a heads-up in the DMG window background, but
//! existing installs already have stale mounts and won't see that hint
//! retroactively, so we also self-detect at startup.
//!
//! No-op on Windows / Linux (no DMG concept; the file-association issue
//! there has different shape and is handled at install time).

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct StaleMoraya {
    /// Filesystem path to the stray `.app` bundle, e.g.
    /// `/Volumes/Moraya 1/Moraya.app`.
    pub app_path: String,
    /// Path passed to `hdiutil detach`, i.e. the mount root, e.g.
    /// `/Volumes/Moraya 1`.
    pub mount_path: String,
    /// `CFBundleShortVersionString` from the `.app`'s Info.plist
    /// (`"0.29.0"`, `"0.39.0"`). Empty string if the plist couldn't be read.
    pub version: String,
}

/// Find every `Moraya.app` mounted under `/Volumes/` except the currently
/// running app. Returns an empty list on non-macOS platforms.
#[tauri::command]
pub fn find_stale_moraya_mounts() -> Vec<StaleMoraya> {
    #[cfg(target_os = "macos")]
    {
        scan_volumes()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

/// Run `hdiutil detach` on a mount root, e.g. `/Volumes/Moraya 1`.
///
/// We don't validate the path beyond the `/Volumes/` prefix because
/// `hdiutil` itself rejects anything that isn't a real mount point — the
/// prefix check is defense-in-depth, not the security boundary.
#[tauri::command]
pub fn eject_dmg_mount(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if !path.starts_with("/Volumes/") {
            return Err("Refusing to detach a non-/Volumes path".to_string());
        }
        let output = std::process::Command::new("hdiutil")
            .args(["detach", &path])
            .output()
            .map_err(|e| format!("Failed to run hdiutil: {e}"))?;
        if output.status.success() {
            Ok(())
        } else {
            // Surface hdiutil's own message so the user-facing toast is useful
            // (e.g. "Resource busy"). Strip trailing whitespace so it formats
            // cleanly in a toast.
            let msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(if msg.is_empty() {
                "hdiutil detach failed".to_string()
            } else {
                msg
            })
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Not supported on this platform".to_string())
    }
}

// ── macOS implementation ──────────────────────────────────────────

#[cfg(target_os = "macos")]
fn scan_volumes() -> Vec<StaleMoraya> {
    use std::path::Path;

    let volumes = match std::fs::read_dir("/Volumes") {
        Ok(it) => it,
        Err(_) => return Vec::new(),
    };

    // Path the running app sits at — we MUST NOT report ourselves as stale.
    // current_exe() returns
    // `/Applications/Moraya.app/Contents/MacOS/moraya`; canonicalize first
    // so symlink mounts don't fool the comparison.
    let self_app_path: Option<String> = std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
        .and_then(|p| {
            // Walk up to the .app boundary.
            p.ancestors().find_map(|anc| {
                anc.file_name()
                    .and_then(|n| n.to_str())
                    .filter(|n| n.ends_with(".app"))
                    .map(|_| anc.to_string_lossy().into_owned())
            })
        });

    let mut out: Vec<StaleMoraya> = Vec::new();
    for entry in volumes.flatten() {
        let mount_path = entry.path();
        // Only inspect mounts whose volume name starts with "Moraya"
        // (covers "Moraya", "Moraya 1", "Moraya 2", "Moraya 0.41.5", etc.).
        // Avoids walking unrelated DMGs the user has mounted.
        let name = match mount_path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.starts_with("Moraya") => n,
            _ => continue,
        };

        let app_path = mount_path.join("Moraya.app");
        if !app_path.is_dir() {
            continue;
        }

        // Skip if THIS is the running app (paranoia — current_exe should
        // never be inside /Volumes, but if a user runs from a DMG, we'd
        // erase the very process we live in).
        let app_path_str = app_path.to_string_lossy().into_owned();
        if let Some(ref own) = self_app_path {
            if Path::new(own) == app_path.as_path() {
                continue;
            }
        }

        let version = read_short_version(&app_path).unwrap_or_default();

        out.push(StaleMoraya {
            app_path: app_path_str,
            mount_path: mount_path.to_string_lossy().into_owned(),
            version,
        });

        // Defense against pathological situations (e.g. user mounted 100
        // moraya DMGs — unlikely but cheap to guard). Caller only needs
        // enough to show in a dialog.
        if out.len() >= 16 {
            break;
        }

        let _ = name; // suppress unused-binding warning if logging is added later
    }
    out
}

#[cfg(target_os = "macos")]
fn read_short_version(app_path: &std::path::Path) -> Option<String> {
    // Shelling out to `defaults read` would work but spawns a process per
    // app. Parse the Info.plist directly. Both XML and binary plist
    // formats are valid here; we only need a fast text scan that works
    // for the XML case (typical for Tauri-bundled apps) — binary plist
    // falls back to an empty string, which the UI tolerates.
    let plist = app_path.join("Contents/Info.plist");
    let contents = std::fs::read_to_string(&plist).ok()?;
    let key_idx = contents.find("<key>CFBundleShortVersionString</key>")?;
    let after = &contents[key_idx..];
    let str_open = after.find("<string>")?;
    let str_close = after.find("</string>")?;
    if str_close <= str_open {
        return None;
    }
    let v = &after[str_open + "<string>".len()..str_close];
    Some(v.trim().to_string())
}
