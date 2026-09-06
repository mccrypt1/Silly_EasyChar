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
    tauri_build::build()
}
