# Strava Club Activity CSV Generator

Fetches all activities from a Strava club feed and exports a CSV with per-member running stats (km and activity count). Optionally filters the feed to start from a specific activity (e.g. the first run of a monthly challenge).

## Prerequisites

- Node.js 18 or newer
- A Strava account that is a member of the club

## Setup

### 1. Create a Strava API application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application
3. Set **Authorization Callback Domain** to `localhost`
4. Copy your **Client ID** and **Client Secret**

### 2. Configure `.env`

Copy `.env.example` to `.env` and fill in the values:

```
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
CLUB_ID=your_club_id
```

**Finding your Club ID:** Open the club page on Strava in a browser. The ID is in the URL:
`https://www.strava.com/clubs/2096954` → Club ID is `2096954`

### 3. Install dependencies

```bash
npm install
```

### 4. Authorize with Strava (once)

```bash
node setup-auth.js
```

Follow the prompts: open the printed URL in a browser, approve access, then paste the redirect URL back into the terminal. This saves your tokens to `tokens.json`.

### 5. Generate the CSV

```bash
node strava-club-csv.js
```

Output: `club_activities.csv`

---

## Start Marker (optional)

The club feed is ordered **newest-first** and does not include activity dates (Strava API limitation). To track only a specific period (e.g. a monthly challenge), set a **start marker** in `.env` — the script will include all activities up to and including the matching one.

```
START_ATHLETE_FIRSTNAME=Boris
START_ATHLETE_LASTNAME=P.
START_ACTIVITY_NAME=Morning Run
START_DISTANCE_KM=4.11
START_MOVING_TIME=1470
START_ELAPSED_TIME=1483
```

The script matches on all six fields simultaneously to avoid false matches:
- Athlete first name (exact)
- Athlete last name (exact — Strava abbreviates last names in club feeds, e.g. `P.` not `Petelj`)
- Activity name (exact)
- Distance (within ±0.05 km)
- Moving time in seconds (exact, optional)
- Elapsed time in seconds (exact, optional)

`START_MOVING_TIME` and `START_ELAPSED_TIME` are optional — if omitted, only the first four fields are used. Setting them makes false matches practically impossible.

If the marker is not found, the script falls back to using all activities and prints a warning.

If no `START_*` variables are set, all fetched activities are included.

### How to find the correct values

Temporarily add a debug listing to the script by commenting out the marker variables in `.env`, then run to see all activities with their times:

```
[0]  Milan S.  | Evening Run  | 10.00 km | moving: 3120s | elapsed: 3245s
[1]  Nemanja A.| Evening Run  | 10.01 km | moving: 3600s | elapsed: 3720s
...
[37] Boris P.  | Morning Run  |  4.11 km | moving: 1470s | elapsed: 1483s
```

Copy the values exactly as shown into `.env`.

> **Note on last names:** Strava only returns the first letter of the last name for club members (e.g. `P.`). Use that abbreviated form for `START_ATHLETE_LASTNAME`.

---

## CSV output

| Column | Description |
|---|---|
| Ime | Full name (as returned by Strava: `Firstname L.`) |
| Km | Total kilometers (sum of all Run/VirtualRun activities) |
| Broj aktivnosti | Number of Run/VirtualRun activities |

Rows are sorted by km descending.

---

## Token refresh

Access tokens expire after 6 hours. The script automatically refreshes the token using the stored refresh token and updates `tokens.json` — no manual action needed.
