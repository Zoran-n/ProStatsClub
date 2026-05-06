use crate::models::{Club, Match, Player};
use anyhow::{anyhow, Result};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, ORIGIN, REFERER, USER_AGENT,
};
use tauri::Emitter;

const BASE_URL: &str = "https://proclubs.ea.com/api/fc";
const LOGO_BASE: &str = "https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l";
const PLATFORMS: &[&str] = &["common-gen5", "common-gen4", "pc"];

pub struct EaClient {
    client: std::sync::RwLock<reqwest::Client>,
    app_handle: tauri::AppHandle,
}

fn build_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0",
        ),
    );
    h.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    h.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"),
    );
    h.insert(ORIGIN, HeaderValue::from_static("https://www.ea.com"));
    h.insert(REFERER, HeaderValue::from_static("https://www.ea.com/"));
    h.insert("sec-fetch-dest", HeaderValue::from_static("empty"));
    h.insert("sec-fetch-mode", HeaderValue::from_static("cors"));
    h.insert("sec-fetch-site", HeaderValue::from_static("cross-site"));
    h.insert("dnt", HeaderValue::from_static("1"));
    h
}

fn build_client(proxy_url: Option<&str>) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .default_headers(build_headers())
        .timeout(std::time::Duration::from_secs(15));
    if let Some(proxy) = proxy_url.filter(|s| !s.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(proxy)?);
    }
    Ok(builder.build()?)
}

impl EaClient {
    pub fn new(app_handle: tauri::AppHandle, proxy_url: Option<String>) -> Self {
        let client = build_client(proxy_url.as_deref()).expect("Failed to build HTTP client");
        Self {
            client: std::sync::RwLock::new(client),
            app_handle,
        }
    }

    pub fn set_proxy(&self, proxy_url: Option<String>) -> Result<()> {
        let new_client = build_client(proxy_url.as_deref())?;
        *self.client.write().unwrap() = new_client;
        Ok(())
    }

    fn http(&self) -> reqwest::Client {
        self.client.read().unwrap().clone()
    }

    fn emit_log(&self, msg: impl Into<String>) {
        let _ = self.app_handle.emit("api_log", msg.into());
    }

    async fn get_json(&self, url: &str) -> Result<serde_json::Value> {
        self.emit_log(format!("→ GET {}", url));
        let resp = self.http().get(url).send().await?;
        let status = resp.status().as_u16();
        let text = resp.text().await?;
        let preview = &text[..text.len().min(400)];
        self.emit_log(format!("← {} ({} chars) {}", status, text.len(), preview));
        if status >= 400 {
            return Err(anyhow!(
                "HTTP {} — body: {}",
                status,
                &text[..text.len().min(300)]
            ));
        }
        serde_json::from_str(&text).map_err(|e| {
            anyhow!(
                "JSON parse error: {} | body: {}",
                e,
                &text[..text.len().min(300)]
            )
        })
    }

    // Search on all 3 platforms in parallel, deduplicate
    pub async fn search_club(&self, name: &str, platform: Option<&str>) -> Result<Vec<Club>> {
        if let Some(p) = platform {
            return self.search_on_platform(name, p).await;
        }
        let (r1, r2, r3) = tokio::join!(
            self.search_on_platform(name, "common-gen5"),
            self.search_on_platform(name, "common-gen4"),
            self.search_on_platform(name, "pc"),
        );
        let mut seen = std::collections::HashSet::new();
        let mut all: Vec<Club> = vec![];
        for res in [r1, r2, r3] {
            for club in res.unwrap_or_default() {
                if seen.insert(club.id.clone()) {
                    all.push(club);
                }
            }
        }
        Ok(all)
    }

    async fn search_on_platform(&self, name: &str, platform: &str) -> Result<Vec<Club>> {
        let url = format!(
            "{}/allTimeLeaderboard/search?platform={}&clubName={}",
            BASE_URL,
            platform,
            urlencoding(name)
        );
        let resp = self.get_json(&url).await?;
        let clubs = resp
            .get("clubs")
            .or_else(|| resp.get("data"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_else(|| resp.as_array().cloned().unwrap_or_default());
        // Debug: log first club object so we can see the field names
        if let Some(first) = clubs.first() {
            self.emit_log(format!("[search debug] first club obj: {}", first));
        }
        Ok(clubs
            .into_iter()
            .filter_map(|v| self.parse_club(&v, platform))
            .collect())
    }

    fn parse_club(&self, v: &serde_json::Value, platform: &str) -> Option<Club> {
        let id = v
            .get("clubId")
            .or_else(|| v.get("id"))?
            .as_str()?
            .to_string();
        if id.is_empty() {
            return None;
        }
        let crest = v
            .get("customKit")
            .and_then(|k| k.get("crestAssetId"))
            .and_then(|s| s.as_str())
            .map(String::from)
            .or_else(|| {
                v.get("crestAssetId")
                    .and_then(|s| s.as_str())
                    .map(String::from)
            })
            .or_else(|| {
                v.get("clubInfo")
                    .and_then(|ci| ci.get("customKit"))
                    .and_then(|k| k.get("crestAssetId"))
                    .and_then(|s| s.as_str())
                    .map(String::from)
            });
        let name = v
            .get("name")
            .or_else(|| v.get("clubName"))
            .and_then(|s| s.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                v.get("clubInfo")
                    .and_then(|ci| ci.get("name"))
                    .and_then(|s| s.as_str())
            })
            .unwrap_or("")
            .to_string();
        self.emit_log(format!("[parse_club] id={} name={:?}", id, name));
        Some(Club {
            id,
            name,
            platform: platform.to_string(),
            skill_rating: v.get("skillRating").and_then(|n| {
                n.as_str()
                    .map(String::from)
                    .or_else(|| n.as_u64().map(|n| n.to_string()))
            }),
            wins: parse_u32(v, "wins"),
            losses: parse_u32(v, "losses"),
            ties: parse_u32(v, "ties"),
            goals: parse_u32(v, "goals"),
            crest_asset_id: crest,
            custom_kit: v.get("customKit").cloned(),
        })
    }

    pub async fn get_stats(&self, club_id: &str, platform: &str) -> Result<Club> {
        let url = format!(
            "{}/clubs/overallStats?platform={}&clubIds={}",
            BASE_URL, platform, club_id
        );
        let resp = self.get_json(&url).await?;
        let v = extract_club_obj(&resp, club_id)?;
        Ok(self.parse_club(v, platform).unwrap_or_default())
    }

    pub async fn get_info(&self, club_id: &str, platform: &str) -> Result<serde_json::Value> {
        let url = format!(
            "{}/clubs/info?platform={}&clubIds={}",
            BASE_URL, platform, club_id
        );
        self.get_json(&url).await
    }

    pub async fn get_season_history(
        &self,
        club_id: &str,
        platform: &str,
    ) -> Result<serde_json::Value> {
        let url = format!(
            "{}/clubs/seasonalStats?platform={}&clubIds={}",
            BASE_URL, platform, club_id
        );
        self.get_json(&url).await
    }

    pub async fn get_leaderboard(
        &self,
        platform: &str,
        max_count: u32,
    ) -> Result<serde_json::Value> {
        let url = format!(
            "{}/allTimeLeaderboard?platform={}&maxResultCount={}",
            BASE_URL, platform, max_count
        );
        self.get_json(&url).await
    }

    pub async fn get_matches(
        &self,
        club_id: &str,
        platform: &str,
        match_type: &str,
        max_result_count: u32,
        match_time_val: Option<&str>,
    ) -> Result<Vec<Match>> {
        let mut url = format!(
            "{}/clubs/matches?platform={}&clubIds={}&matchType={}&maxResultCount={}",
            BASE_URL, platform, club_id, match_type, max_result_count
        );
        if let Some(cursor) = match_time_val {
            url.push_str(&format!("&matchTimeVal={}", cursor));
        }
        let resp = self.get_json(&url).await?;
        let arr = if let Some(a) = resp.as_array() {
            a.clone()
        } else if let Some(a) = resp.get("data").and_then(|v| v.as_array()) {
            a.clone()
        } else {
            return Ok(vec![]);
        };
        Ok(arr
            .into_iter()
            .map(|v| parse_match(&v, match_type))
            .collect())
    }

    pub async fn get_members(&self, club_id: &str, platform: &str) -> Result<Vec<Player>> {
        let url = format!(
            "{}/members/stats?platform={}&clubId={}",
            BASE_URL, platform, club_id
        );
        let resp = self.get_json(&url).await?;
        let arr = if let Some(a) = resp.get("members").and_then(|v| v.as_array()) {
            a.clone()
        } else if let Some(a) = resp.as_array() {
            a.clone()
        } else {
            return Ok(vec![]);
        };
        Ok(arr.into_iter().filter_map(|v| parse_player(&v)).collect())
    }

    pub async fn get_logo(&self, crest_asset_id: &str) -> Result<String> {
        let url = format!("{}{}.png", LOGO_BASE, crest_asset_id);
        let bytes = self.http().get(&url).send().await?.bytes().await?;
        Ok(format!("data:image/png;base64,{}", B64.encode(&bytes)))
    }

    pub async fn detect_platform(&self, club_id: &str) -> Result<String> {
        for p in PLATFORMS {
            if self.get_stats(club_id, p).await.is_ok() {
                return Ok(p.to_string());
            }
        }
        Err(anyhow!("Club not found on any platform"))
    }
}

fn extract_club_obj<'a>(v: &'a serde_json::Value, club_id: &str) -> Result<&'a serde_json::Value> {
    // Case 1: object keyed by club_id e.g. {"3539213": {...}}
    if let Some(obj) = v.get(club_id) {
        return Ok(obj);
    }
    // Case 2: first value in a non-empty object
    if let Some(obj) = v.as_object().and_then(|o| o.values().next()) {
        return Ok(obj);
    }
    // Case 3: array response — find by clubId or take first
    if let Some(arr) = v.as_array() {
        let found = arr.iter().find(|c| {
            c.get("clubId").and_then(|id| id.as_str()) == Some(club_id)
                || c.get("id").and_then(|id| id.as_str()) == Some(club_id)
        });
        if let Some(club) = found.or_else(|| arr.first()) {
            return Ok(club);
        }
    }
    Err(anyhow!("Club {} not found in response: {}", club_id, v))
}

fn parse_match(v: &serde_json::Value, match_type: &str) -> Match {
    Match {
        match_id: v
            .get("matchId")
            .map(|s| match s {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                _ => String::new(),
            })
            .unwrap_or_default(),
        timestamp: v
            .get("timestamp")
            .map(|s| match s {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                _ => String::new(),
            })
            .unwrap_or_default(),
        match_duration: v
            .get("matchDuration")
            .and_then(|n| {
                n.as_u64()
                    .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
            })
            .map(|n| n as u32),
        clubs: v
            .get("clubs")
            .and_then(|c| c.as_object())
            .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default(),
        players: v
            .get("players")
            .and_then(|p| p.as_object())
            .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default(),
        match_type: match_type.to_string(),
    }
}

fn parse_player(v: &serde_json::Value) -> Option<Player> {
    let name = v
        .get("name")
        .or_else(|| v.get("blazeId"))?
        .as_str()?
        .to_string();
    Some(Player {
        name,
        position: v
            .get("proPos")
            .or_else(|| v.get("position"))
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string(),
        goals: parse_u32(v, "goals"),
        assists: parse_u32(v, "assists"),
        passes_made: parse_u32(v, "passesMade").max(parse_u32(v, "passesmade")),
        tackles_made: parse_u32(v, "tacklesMade").max(parse_u32(v, "tacklesmade")),
        motm: parse_u32(v, "manOfTheMatch").max(parse_u32(v, "mom")),
        rating: v
            .get("ratingAve")
            .or_else(|| v.get("rating"))
            .and_then(|n| {
                n.as_f64()
                    .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
            })
            .unwrap_or(0.0),
        games_played: parse_u32(v, "gamesPlayed"),
        interceptions: parse_u32(v, "interceptions"),
        fouls_committed: parse_u32(v, "foulsCommited").max(parse_u32(v, "foulscommited")),
        yellow_cards: parse_u32(v, "yellowCards").max(parse_u32(v, "yellowcards")),
        red_cards: parse_u32(v, "redCards").max(parse_u32(v, "redcards")),
        clean_sheets: parse_u32(v, "cleanSheetsDivisions").max(parse_u32(v, "cleansheetsDiv")),
        save_attempts: parse_u32(v, "saveAttempts").max(parse_u32(v, "saveattempts")),
        shots_on_target: parse_u32(v, "shotsOnTarget").max(parse_u32(v, "shotstarget")),
    })
}

fn parse_u32(v: &serde_json::Value, key: &str) -> u32 {
    v.get(key)
        .and_then(|n| {
            n.as_u64()
                .or_else(|| n.as_str().and_then(|s| s.parse().ok()))
        })
        .unwrap_or(0) as u32
}

fn urlencoding(s: &str) -> String {
    s.replace(' ', "%20").replace('#', "%23")
}
