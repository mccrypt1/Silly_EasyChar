fn main() {
    let commit = std::env::var("SILLY_EASYCHAR_GIT_COMMIT").unwrap_or_else(|_| {
        std::process::Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "development".to_string())
    });
    println!("cargo:rustc-env=SILLY_EASYCHAR_GIT_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=SILLY_EASYCHAR_GIT_COMMIT");
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "build_info",
                "open_repository",
                "open_marinara_repository",
                "error_log_location",
                "write_error_log",
                "export_character_file",
                "ollama_models",
                "ollama_chat",
                "choose_character_folder",
                "scan_character_folder",
                "read_character_file",
                "read_character_file_with_fingerprint",
                "save_character_file",
                "add_character_file",
                "duplicate_character_file",
                "create_card_backup",
                "remove_character_file",
                "list_recovery_cards",
                "read_recovery_card",
                "restore_removed_card",
                "delete_removed_card",
                "list_card_versions",
                "read_card_version",
                "rename_card_version",
                "restore_card_version",
            ]),
        ),
    )
    .expect("failed to run tauri build script");
}
