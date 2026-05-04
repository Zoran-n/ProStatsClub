const https = require('https');

const notes = `## Comparaison de clubs — 6 nouvelles fonctionnalites

### Comparaison multi-saisons
- Selecteur de saison par club dans l'onglet Stats
- Compare les stats d'une saison differente entre clubs (via l'historique)
- Radar et tableau refletent dynamiquement la saison choisie

### Mode Battle
- Nouvel onglet Battle dans la comparaison de clubs (2 clubs minimum)
- Vote sur 7 stats : V%, Victoires, Buts, Buts/Match, Joueurs, Note moy., MOTM
- Classement final en temps reel + podium visuel + bouton Reinitialiser

### Comparaisons nommees
- Sauvegarder une comparaison sous un nom personnalise (ex: Finale div 2)
- Panel Sauvegardees : restaurer en un clic, renommer inline, supprimer
- Stockees localement (max 30 entrees, persistance automatique)

### Export PDF rapport
- Bouton PDF dans la barre d'actions de la comparaison
- Rapport complet : header colore, tableau des 10 stats, radar multi-clubs, section H2H

### Alertes SR
- Icone Bell/BellOff par slot de club — surveille le Skill Rating
- Toast de notification si le SR a change depuis la derniere visite

### Joueurs cross-clubs par poste
- Onglet Joueurs ameliore : tableau GK/DEF/MIL/ATT avec meilleur joueur surligne

---

### Installation Windows
Telecharge le fichier .exe ci-dessous.

### Mise a jour automatique
Si tu as deja une version installee, l'app proposera la mise a jour automatiquement.`;

const body = JSON.stringify({ body: notes });
const token = process.env.GITHUB_TOKEN;

if (!token) { console.error('GITHUB_TOKEN not set'); process.exit(1); }

const options = {
  hostname: 'api.github.com',
  path: '/repos/Zoran-n/proclubs-tauri/releases/310257296',
  method: 'PATCH',
  headers: {
    'Authorization': 'token ' + token,
    'User-Agent': 'prostatclub-updater',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('HTTP Status:', res.statusCode);
    if (result.id) {
      console.log('Release updated! v' + result.tag_name + ' — ' + result.name);
    } else {
      console.log('Error:', result.message || data.substring(0, 300));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e));
req.write(body);
req.end();
