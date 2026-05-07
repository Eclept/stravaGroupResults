import 'dotenv/config';
import { createInterface } from 'readline';
import { writeFileSync } from 'fs';

const { CLIENT_ID, CLIENT_SECRET } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Greška: CLIENT_ID i CLIENT_SECRET moraju biti postavljeni u .env fajlu.');
  console.error('Kopiraj .env.example u .env i popuni vrijednosti.');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const authUrl =
  `https://www.strava.com/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=http://localhost` +
  `&response_type=code` +
  `&scope=read`;

console.log('\n=== Strava OAuth Setup ===\n');
console.log('1. Otvori ovaj URL u browseru:\n');
console.log('   ' + authUrl);
console.log('\n2. Odobri pristup na Stravi.');
console.log('3. Browser će biti preusmjeren na localhost (stranica neće učitati — to je OK).');
console.log('4. Kopiraj cijeli URL iz adresne trake browsera.\n');

const redirectUrl = await ask('Paste-uj redirect URL ovdje: ');
rl.close();

const url = new URL(redirectUrl.trim());
const code = url.searchParams.get('code');

if (!code) {
  console.error('\nGreška: nije pronađen "code" parametar u URL-u. Pokušaj ponovo.');
  process.exit(1);
}

console.log('\nRazmjenjujem code za access token...');

const res = await fetch('https://www.strava.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error('Greška pri razmjeni tokena:', err);
  process.exit(1);
}

const data = await res.json();

const tokens = {
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_at: data.expires_at,
};

writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
console.log('\nUspješno! Tokeni su sačuvani u tokens.json.');
console.log('Sada možeš pokrenuti: node strava-club-csv.js\n');
