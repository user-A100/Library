//! Native application menu (macOS) and locale labels.

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

/// Broadcast when a native menu item is clicked; payload `{ action: <menu id> }`.
/// Wire naming follows docs/development/lifecycle-events.md (`domain:event`);
/// this is a request/command signal, not a lifecycle fact event.
pub const MENU_INVOKED_EVENT: &str = "menu:invoked";

/// Labels for the native application menu.
#[cfg(target_os = "macos")]
pub struct MenuLabels {
    pub settings: &'static str,
    pub new_window: &'static str,
    pub open_vault: &'static str,
    pub create_vault: &'static str,
    pub refresh_tree: &'static str,
    pub close: &'static str,
    pub toggle_sidebar: &'static str,
    pub split_pane: &'static str,
    pub toggle_chat: &'static str,
    pub app: &'static str,
    pub file: &'static str,
    pub edit: &'static str,
    pub view: &'static str,
    pub window: &'static str,
}

#[cfg(target_os = "macos")]
const EN: MenuLabels = MenuLabels {
    settings: "Settings…",
    new_window: "New Window",
    open_vault: "Open Vault…",
    create_vault: "Create Vault…",
    refresh_tree: "Refresh File Tree",
    // Closes the active document tab first; with no tabs, closes the window.
    close: "Close",
    toggle_sidebar: "Toggle Sidebar",
    split_pane: "Split Pane Right",
    toggle_chat: "Toggle Chat",
    app: "Agentero",
    file: "File",
    edit: "Edit",
    view: "View",
    window: "Window",
};

#[cfg(target_os = "macos")]
const ZH_CN: MenuLabels = MenuLabels {
    settings: "设置…",
    new_window: "新建窗口",
    open_vault: "打开知识库…",
    create_vault: "创建知识库…",
    refresh_tree: "刷新文件树",
    close: "关闭",
    toggle_sidebar: "切换侧边栏",
    split_pane: "向右分栏",
    toggle_chat: "切换对话",
    app: "Agentero",
    file: "文件",
    edit: "编辑",
    view: "视图",
    window: "窗口",
};

/// Return the menu label set for a locale, falling back to English.
#[cfg(target_os = "macos")]
pub fn menu_labels(lang: &str) -> &'static MenuLabels {
    match lang {
        "zh-CN" | "zh" => &ZH_CN,
        _ => &EN,
    }
}

#[cfg(target_os = "macos")]
pub fn build_menu(
    app: &tauri::AppHandle,
    lang: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let labels = menu_labels(lang);

    // Appears under the app name menu on macOS (e.g. "Agentero").
    let settings = MenuItemBuilder::with_id("settings", labels.settings)
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let new_window = MenuItemBuilder::with_id("new_window", labels.new_window)
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let open_vault = MenuItemBuilder::with_id("open_vault", labels.open_vault)
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let create_vault = MenuItemBuilder::with_id("create_vault", labels.create_vault)
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;

    let refresh_tree = MenuItemBuilder::with_id("refresh_tree", labels.refresh_tree)
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    // Smart Close (⌘W): frontend closes the active tab first; with no tabs, closes the window.
    // Must not use PredefinedMenuItem::CloseWindow — that would steal ⌘W before the renderer.
    let close = MenuItemBuilder::with_id("close_tab_or_window", labels.close)
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", labels.toggle_sidebar)
        .accelerator("CmdOrCtrl+Alt+S")
        .build(app)?;

    let split_pane = MenuItemBuilder::with_id("split_pane", labels.split_pane)
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;

    let toggle_chat = MenuItemBuilder::with_id("toggle_chat", labels.toggle_chat)
        .accelerator("CmdOrCtrl+L")
        .build(app)?;

    let app_submenu = SubmenuBuilder::new(app, labels.app)
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, labels.file)
        .item(&new_window)
        .separator()
        .item(&open_vault)
        .item(&create_vault)
        .item(&refresh_tree)
        .separator()
        .item(&close)
        .build()?;

    // Required so text fields keep standard edit shortcuts after custom menu is set.
    let edit_submenu = SubmenuBuilder::new(app, labels.edit)
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, labels.view)
        .item(&toggle_sidebar)
        .item(&split_pane)
        .item(&toggle_chat)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, labels.window)
        .minimize()
        .maximize()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .build()
}

/// Rebuild and install the native application menu for the given locale.
/// macOS-only: other platforms have no native window menu (actions live in the
/// React title bar + keyboard shortcuts), so this is a no-op there.
#[tauri::command]
pub fn set_locale(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let menu = build_menu(&app, &locale).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&app, &locale);
    }
    Ok(())
}
