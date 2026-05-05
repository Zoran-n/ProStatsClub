use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Club {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub skill_rating: Option<String>,
    #[serde(default)]
    pub wins: u32,
    #[serde(default)]
    pub losses: u32,
    #[serde(default)]
    pub ties: u32,
    #[serde(default)]
    pub goals: u32,
    #[serde(default)]
    pub crest_asset_id: Option<String>,
    #[serde(default)]
    pub custom_kit: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub goals: u32,
    #[serde(default)]
    pub assists: u32,
    #[serde(default)]
    pub passes_made: u32,
    #[serde(default)]
    pub tackles_made: u32,
    #[serde(default)]
    pub motm: u32,
    #[serde(default)]
    pub rating: f64,
    #[serde(default)]
    pub games_played: u32,
    // Statistiques avancées
    #[serde(default)]
    pub interceptions: u32,
    #[serde(default)]
    pub fouls_committed: u32,
    #[serde(default)]
    pub yellow_cards: u32,
    #[serde(default)]
    pub red_cards: u32,
    #[serde(default)]
    pub clean_sheets: u32,
    #[serde(default)]
    pub save_attempts: u32,
    #[serde(default)]
    pub shots_on_target: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct SeasonStats {
    #[serde(default)]
    pub season_id: String,
    #[serde(default)]
    pub wins: u32,
    #[serde(default)]
    pub losses: u32,
    #[serde(default)]
    pub ties: u32,
    #[serde(default)]
    pub goals: u32,
    #[serde(default)]
    pub goals_against: u32,
    #[serde(default)]
    pub skill_rating: Option<String>,
    #[serde(default)]
    pub division: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    #[serde(default)]
    pub match_id: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub match_duration: Option<u32>,
    #[serde(default)]
    pub clubs: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub players: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub match_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tactic {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub formation: String,
    #[serde(default)]
    pub sliders: HashMap<String, f32>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub ea_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub club_name: String,
    #[serde(default)]
    pub club_id: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub matches: Vec<Match>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub goal: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EaProfile {
    #[serde(default)]
    pub gamertag: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub club_id: String,
    #[serde(default)]
    pub club_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PublicProfileConfig {
    #[serde(default)]
    pub selected_stats: Vec<String>,
    #[serde(default)]
    pub objective: Option<serde_json::Value>,
    #[serde(default)]
    pub theme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub history: Vec<Club>,
    #[serde(default)]
    pub favs: Vec<Club>,
    #[serde(default)]
    pub tactics: Vec<Tactic>,
    #[serde(default)]
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub compare_history: Vec<serde_json::Value>,
    #[serde(default)]
    pub ea_profile: Option<EaProfile>,
    #[serde(default)]
    pub ea_profiles: Vec<EaProfile>,
    #[serde(default)]
    pub sync_history: Vec<serde_json::Value>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_true")]
    pub dark_mode: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default = "default_true")]
    pub show_grid: bool,
    #[serde(default = "default_true")]
    pub show_animations: bool,
    #[serde(default = "default_true")]
    pub show_logs: bool,
    #[serde(default)]
    pub show_id_search: bool,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default)]
    pub custom_accent: Option<String>,
    #[serde(default)]
    pub custom_bg: Option<String>,
    #[serde(default)]
    pub custom_surface: Option<String>,
    #[serde(default)]
    pub custom_card: Option<String>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub onboarded: bool,
    #[serde(default)]
    pub match_cache: HashMap<String, Vec<Match>>,
    #[serde(default)]
    pub discord_webhook: Option<String>,
    #[serde(default)]
    pub auto_update: bool,
    #[serde(default)]
    pub match_annotations: HashMap<String, String>,
    #[serde(default)]
    pub visible_kpis: Vec<String>,
    #[serde(default)]
    pub session_templates: Vec<serde_json::Value>,
    #[serde(default)]
    pub nav_layout: Option<String>,
    #[serde(default)]
    pub cache_timestamps: HashMap<String, u64>,
    #[serde(default)]
    pub cache_owners: HashMap<String, String>,
    #[serde(default)]
    pub public_profile_config: Option<PublicProfileConfig>,
}

fn default_theme() -> String {
    "cyan".to_string()
}
fn default_true() -> bool {
    true
}
fn default_font_size() -> String {
    "medium".to_string()
}
fn default_font_family() -> String {
    "barlow".to_string()
}
fn default_language() -> String {
    "fr".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            history: vec![],
            favs: vec![],
            tactics: vec![],
            sessions: vec![],
            compare_history: vec![],
            ea_profile: None,
            ea_profiles: vec![],
            sync_history: vec![],
            theme: "cyan".to_string(),
            dark_mode: true,
            proxy_url: None,
            show_grid: true,
            show_animations: true,
            show_logs: true,
            show_id_search: false,
            font_size: "medium".to_string(),
            font_family: "barlow".to_string(),
            custom_accent: None,
            custom_bg: None,
            custom_surface: None,
            custom_card: None,
            language: "fr".to_string(),
            onboarded: false,
            match_cache: HashMap::new(),
            discord_webhook: None,
            auto_update: false,
            match_annotations: HashMap::new(),
            visible_kpis: vec![],
            session_templates: vec![],
            nav_layout: None,
            cache_timestamps: HashMap::new(),
            cache_owners: HashMap::new(),
            public_profile_config: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClubData {
    pub club: Club,
    pub players: Vec<Player>,
    pub matches: Vec<Match>,
    pub info: serde_json::Value,
}
