use crate::ea_client::EaClient;
use crate::models::{Club, ClubData, Match, Player, Settings};
use crate::storage::StorageManager;
use tauri::State;

#[tauri::command]
pub async fn search_club(
    name: String,
    platform: Option<String>,
    ea_client: State<'_, EaClient>,
) -> Result<Vec<Club>, String> {
    ea_client
        .search_club(&name, platform.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_club(
    club_id: String,
    platform: String,
    ea_client: State<'_, EaClient>,
) -> Result<ClubData, String> {
    let (stats_r, members_r, matches_r, info_r) = tokio::join!(
        ea_client.get_stats(&club_id, &platform),
        ea_client.get_members(&club_id, &platform),
        ea_client.get_matches(&club_id, &platform, "leagueMatch", 10, None),
        ea_client.get_info(&club_id, &platform),
    );
    let info = info_r.unwrap_or(serde_json::Value::Null);
    let mut club = match stats_r {
        Ok(c) if !c.id.is_empty() => c,
        Ok(_) | Err(_) => Club {
            id: club_id.clone(),
            platform: platform.clone(),
            ..Default::default()
        },
    };
    // Fill missing name + crest from clubs/info response
    if club.name.is_empty() {
        let info_club = info
            .get(&club_id)
            .or_else(|| info.as_object().and_then(|o| o.values().next()));
        if let Some(ic) = info_club {
            if let Some(n) = ic.get("name").and_then(|v| v.as_str()) {
                if !n.is_empty() {
                    club.name = n.to_string();
                }
            }
            if club.crest_asset_id.is_none() {
                club.crest_asset_id = ic
                    .get("customKit")
                    .and_then(|k| k.get("crestAssetId"))
                    .and_then(|s| s.as_str())
                    .map(String::from);
            }
        }
    }
    let players = members_r.unwrap_or_default();
    let matches = matches_r.unwrap_or_default();
    Ok(ClubData {
        club,
        players,
        matches,
        info,
    })
}

#[tauri::command]
pub async fn get_matches(
    club_id: String,
    platform: String,
    match_type: String,
    match_time_val: Option<String>,
    ea_client: State<'_, EaClient>,
) -> Result<Vec<Match>, String> {
    ea_client
        .get_matches(
            &club_id,
            &platform,
            &match_type,
            10,
            match_time_val.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_members(
    club_id: String,
    platform: String,
    ea_client: State<'_, EaClient>,
) -> Result<Vec<Player>, String> {
    ea_client
        .get_members(&club_id, &platform)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_logo(crest_id: String, ea_client: State<'_, EaClient>) -> Result<String, String> {
    ea_client
        .get_logo(&crest_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings(
    settings: Settings,
    storage: State<'_, StorageManager>,
) -> Result<(), String> {
    storage.save_settings(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_settings(storage: State<'_, StorageManager>) -> Result<Settings, String> {
    Ok(storage.load_settings())
}

/// Returns only NEW matches (not in known_ids)
#[tauri::command]
pub async fn poll_session(
    club_id: String,
    platform: String,
    known_ids: Vec<String>,
    ea_client: State<'_, EaClient>,
) -> Result<Vec<Match>, String> {
    let known: std::collections::HashSet<String> = known_ids.into_iter().collect();
    let (league, playoff, friendly) = tokio::join!(
        ea_client.get_matches(&club_id, &platform, "leagueMatch", 10, None),
        ea_client.get_matches(&club_id, &platform, "playoffMatch", 10, None),
        ea_client.get_matches(&club_id, &platform, "friendlyMatch", 10, None),
    );
    let mut new_matches = vec![];
    for m in league
        .unwrap_or_default()
        .into_iter()
        .chain(playoff.unwrap_or_default())
        .chain(friendly.unwrap_or_default())
    {
        if !known.contains(&m.match_id) {
            new_matches.push(m);
        }
    }
    Ok(new_matches)
}

/// Fetch raw club info JSON (for tactics import)
#[tauri::command]
pub async fn get_club_info(
    club_id: String,
    platform: String,
    ea_client: State<'_, EaClient>,
) -> Result<serde_json::Value, String> {
    ea_client
        .get_info(&club_id, &platform)
        .await
        .map_err(|e| e.to_string())
}

/// Auto-detect platform for a club ID
#[tauri::command]
pub async fn detect_platform(
    club_id: String,
    ea_client: State<'_, EaClient>,
) -> Result<String, String> {
    ea_client
        .detect_platform(&club_id)
        .await
        .map_err(|e| e.to_string())
}

/// Check if a proxy is configured via environment variables
#[tauri::command]
pub async fn check_proxy() -> Result<Option<String>, String> {
    let proxy = std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("https_proxy"))
        .or_else(|_| std::env::var("http_proxy"))
        .ok();
    Ok(proxy)
}

/// Dynamically update the proxy (takes effect immediately)
#[tauri::command]
pub async fn set_proxy(
    proxy_url: Option<String>,
    ea_client: State<'_, EaClient>,
) -> Result<(), String> {
    ea_client.set_proxy(proxy_url).map_err(|e| e.to_string())
}

/// Fetch seasonal stats history for a club
#[tauri::command]
pub async fn get_season_history(
    club_id: String,
    platform: String,
    ea_client: State<'_, EaClient>,
) -> Result<serde_json::Value, String> {
    ea_client
        .get_season_history(&club_id, &platform)
        .await
        .map_err(|e| e.to_string())
}

/// Check for app updates by fetching latest.json from GitHub
#[tauri::command]
pub async fn check_for_update(current_version: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://github.com/Zoran-n/proclubs-tauri/releases/latest/download/latest.json")
        .header("User-Agent", "ProClubs-Stats-Updater")
        .send()
        .await
        .map_err(|e| format!("Requête échouée: {}", e))?;
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("JSON invalide: {}", e))?;
    let remote_version = json
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0");
    let has_update = remote_version != current_version;
    Ok(serde_json::json!({
        "available": has_update,
        "version": remote_version,
        "notes": json.get("notes").and_then(|v| v.as_str()).unwrap_or(""),
        "url": json.get("platforms")
            .and_then(|p| p.get("windows-x86_64"))
            .and_then(|w| w.get("url"))
            .and_then(|u| u.as_str())
            .unwrap_or("")
    }))
}

/// Fetch the all-time leaderboard for a platform
#[tauri::command]
pub async fn get_leaderboard(
    platform: String,
    max_count: Option<u32>,
    ea_client: State<'_, EaClient>,
) -> Result<serde_json::Value, String> {
    ea_client
        .get_leaderboard(&platform, max_count.unwrap_or(25))
        .await
        .map_err(|e| e.to_string())
}
