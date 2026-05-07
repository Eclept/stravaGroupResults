import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const {
  CLIENT_ID,
  CLIENT_SECRET,
  CLUB_ID,
  START_ATHLETE_FIRSTNAME,
  START_ATHLETE_LASTNAME,
  START_ACTIVITY_NAME,
  START_DISTANCE_KM,
  START_MOVING_TIME,
  START_ELAPSED_TIME,
} = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !CLUB_ID) {
  console.error('Greška: CLIENT_ID, CLIENT_SECRET i CLUB_ID moraju biti postavljeni u .env fajlu.');
  process.exit(1);
}

const hasMarker =
  START_ATHLETE_FIRSTNAME && START_ATHLETE_LASTNAME && START_ACTIVITY_NAME && START_DISTANCE_KM;

function loadTokens() {
  try {
    return JSON.parse(readFileSync('tokens.json', 'utf8'));
  } catch {
    console.error('Greška: tokens.json nije pronađen. Pokreni prvo: node setup-auth.js');
    process.exit(1);
  }
}

async function refreshIfNeeded(tokens) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > nowSec + 60) return tokens;

  console.log('Token je istekao, osvježavam...');
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    console.error('Greška pri osvježavanju tokena:', await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
  writeFileSync('tokens.json', JSON.stringify(updated, null, 2));
  return updated;
}

async function fetchAllActivities(accessToken) {
  const activities = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url =
      `https://www.strava.com/api/v3/clubs/${CLUB_ID}/activities` +
      `?page=${page}&per_page=${perPage}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      console.error('Rate limit dostignut. Sačekaj malo i pokušaj ponovo.');
      process.exit(1);
    }

    if (!res.ok) {
      console.error(`Greška pri dohvatanju aktivnosti (stranica ${page}):`, await res.text());
      process.exit(1);
    }

    const page_activities = await res.json();
    if (!Array.isArray(page_activities) || page_activities.length === 0) break;

    activities.push(...page_activities);
    console.log(`  Učitano ${activities.length} aktivnosti (stranica ${page})...`);

    if (page_activities.length < perPage) break;
    page++;
  }

  return activities;
}

function aggregateRunners(activities) {
  const map = new Map();

  for (const act of activities) {
    if (act.type !== 'Run' && act.type !== 'VirtualRun') continue;

    const name = `${act.athlete?.firstname ?? ''} ${act.athlete?.lastname ?? ''}`.trim();
    if (!name) continue;

    if (!map.has(name)) {
      map.set(name, { km: 0, aktivnosti: 0 });
    }
    const entry = map.get(name);
    entry.km += act.distance ?? 0;
    entry.aktivnosti += 1;
  }

  return [...map.entries()]
    .map(([ime, { km, aktivnosti }]) => ({
      Ime: ime,
      Km: (km / 1000).toFixed(2),
      'Broj aktivnosti': aktivnosti,
    }))
    .sort((a, b) => parseFloat(b.Km) - parseFloat(a.Km));
}

function writeCsv(rows, filename) {
  if (rows.length === 0) {
    console.log('Nema Run aktivnosti u club feed-u.');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => `"${r[h]}"`).join(',')),
  ];
  writeFileSync(filename, lines.join('\n') + '\n', 'utf8');
}

function sliceFromMarker(activities) {
  if (!hasMarker) {
    console.log('  START_MARKER nije postavljen u .env — koristim sve aktivnosti.');
    return activities;
  }

  const targetDist = parseFloat(START_DISTANCE_KM);
  const targetMoving = START_MOVING_TIME ? parseInt(START_MOVING_TIME) : null;
  const targetElapsed = START_ELAPSED_TIME ? parseInt(START_ELAPSED_TIME) : null;

  const idx = activities.findIndex((act) => {
    const firstnameMatch = act.athlete?.firstname === START_ATHLETE_FIRSTNAME;
    const lastnameMatch = act.athlete?.lastname === START_ATHLETE_LASTNAME;
    const nameMatch = act.name === START_ACTIVITY_NAME;
    const distMatch = Math.abs((act.distance ?? 0) / 1000 - targetDist) < 0.05;
    const movingMatch = targetMoving === null || act.moving_time === targetMoving;
    const elapsedMatch = targetElapsed === null || act.elapsed_time === targetElapsed;
    return firstnameMatch && lastnameMatch && nameMatch && distMatch && movingMatch && elapsedMatch;
  });

  if (idx === -1) {
    console.warn(
      `  Upozorenje: početna aktivnost nije pronađena` +
      ` (${START_ATHLETE_FIRSTNAME} ${START_ATHLETE_LASTNAME} | ${START_ACTIVITY_NAME} | ${START_DISTANCE_KM} km).` +
      ` Koristim sve aktivnosti.`
    );
    return activities;
  }

  console.log(
    `  Početna aktivnost: [${idx}] ${START_ATHLETE_FIRSTNAME} ${START_ATHLETE_LASTNAME}` +
    ` | ${START_ACTIVITY_NAME} | ${START_DISTANCE_KM} km — uzimam aktivnosti 0 do ${idx}.`
  );
  return activities.slice(0, idx + 1);
}

// --- main ---
console.log(`\nDohvatam aktivnosti za klub ID: ${CLUB_ID}\n`);

let tokens = loadTokens();
tokens = await refreshIfNeeded(tokens);

const allActivities = await fetchAllActivities(tokens.access_token);
console.log(`\nUkupno dohvaćeno aktivnosti: ${allActivities.length}`);

const activities = sliceFromMarker(allActivities);
console.log(`  Aktivnosti posle početne tačke: ${activities.length}`);

const rows = aggregateRunners(activities);
const runCount = rows.reduce((s, r) => s + r['Broj aktivnosti'], 0);
console.log(`Run aktivnosti: ${runCount} | Trkača: ${rows.length}`);

const outputFile = 'club_activities.csv';
writeCsv(rows, outputFile);

if (rows.length > 0) {
  console.log(`\nCSV sačuvan: ${outputFile}`);
  console.log('\nTop 5 trkača:');
  rows.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.Ime} — ${r.Km} km (${r['Broj aktivnosti']} aktivnosti)`)
  );
}
console.log();
