/**
 * Live menu accelerator mutation — v0.41.5+ (idempotent-floating-bumblebee).
 *
 * Tauri 2.10.3 exposes `MenuItem::set_accelerator(Option<&str>)` (and the
 * same on `CheckMenuItem`), allowing us to mutate keyboard shortcuts in
 * the OS-native menu bar after the menu is built. We use it so the
 * settings panel can change the displayed shortcut hint AND invalidate
 * the original accelerator in one shot.
 *
 * `None` passed to `set_accelerator()` clears the shortcut entirely
 * (used when the user resets to "no shortcut" for entries like
 * Export PDF that ship with no default binding).
 */

use std::collections::HashMap;
use tauri::menu::MenuItemKind;
use tauri::AppHandle;

/// Internal helper: locate a menu item by id (across all submenu levels)
/// and apply a setter. Returns true if found.
///
/// Recurses into nested submenus (e.g. File → Export → "Export PDF") so
/// items several layers deep can still be reached.
fn with_menu_item<F>(app: &AppHandle, item_id: &str, mut setter: F) -> bool
where
    F: FnMut(&MenuItemKind<tauri::Wry>) -> bool,
{
    let Some(menu) = app.menu() else { return false };
    let Ok(items) = menu.items() else { return false };
    for item in &items {
        if visit_menu_item_kind(item, item_id, &mut setter) {
            return true;
        }
    }
    false
}

fn visit_menu_item_kind<F>(
    kind: &MenuItemKind<tauri::Wry>,
    item_id: &str,
    setter: &mut F,
) -> bool
where
    F: FnMut(&MenuItemKind<tauri::Wry>) -> bool,
{
    let id = match kind {
        MenuItemKind::MenuItem(mi) => mi.id().0.as_str().to_string(),
        MenuItemKind::Check(ci) => ci.id().0.as_str().to_string(),
        MenuItemKind::Icon(ii) => ii.id().0.as_str().to_string(),
        MenuItemKind::Submenu(sm) => sm.id().0.as_str().to_string(),
        MenuItemKind::Predefined(_) => String::new(),
    };
    if id == item_id && setter(kind) {
        return true;
    }
    // Recurse into submenus regardless of id match — target may be deeper.
    if let MenuItemKind::Submenu(submenu) = kind {
        if let Ok(sub_items) = submenu.items() {
            for child in &sub_items {
                if visit_menu_item_kind(child, item_id, setter) {
                    return true;
                }
            }
        }
    }
    false
}

/// Apply a single accelerator update. `accelerator: None` clears the shortcut.
fn apply_accelerator(
    app: &AppHandle,
    item_id: &str,
    accelerator: Option<&str>,
) -> Result<(), String> {
    let mut last_err: Option<String> = None;
    let found = with_menu_item(app, item_id, |kind| {
        let result = match kind {
            MenuItemKind::MenuItem(mi) => mi.set_accelerator(accelerator),
            MenuItemKind::Check(ci) => ci.set_accelerator(accelerator),
            MenuItemKind::Icon(ii) => ii.set_accelerator(accelerator),
            _ => return false,
        };
        if let Err(e) = result {
            last_err = Some(format!("set_accelerator failed: {}", e));
        }
        true
    });
    if let Some(err) = last_err {
        return Err(err);
    }
    if !found {
        return Err(format!("Menu item '{}' not found", item_id));
    }
    Ok(())
}

/// Set or clear the accelerator on a single native menu item.
///
/// `accelerator` accepts Tauri-format strings like `"CmdOrCtrl+Shift+J"`.
/// Pass `None` (omit / `null` from JS) to remove the accelerator entirely.
#[tauri::command]
pub fn set_menu_accelerator(
    app: AppHandle,
    item_id: String,
    accelerator: Option<String>,
) -> Result<(), String> {
    apply_accelerator(&app, &item_id, accelerator.as_deref())
}

/// Batch variant — apply many accelerator updates in one IPC call.
///
/// Returns a `failed` map keyed by `item_id` with the reason string for
/// each individual failure. The call itself never errors; the caller
/// inspects `failed` to decide whether to roll back / surface a toast.
#[derive(serde::Serialize, Default)]
pub struct BatchResult {
    pub ok: Vec<String>,
    pub failed: HashMap<String, String>,
}

#[tauri::command]
pub fn set_menu_accelerators_batch(
    app: AppHandle,
    updates: HashMap<String, Option<String>>,
) -> BatchResult {
    let mut out = BatchResult::default();
    for (item_id, accel) in updates {
        match apply_accelerator(&app, &item_id, accel.as_deref()) {
            Ok(()) => out.ok.push(item_id),
            Err(e) => {
                out.failed.insert(item_id, e);
            }
        }
    }
    out
}
