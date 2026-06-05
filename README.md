# Smart Mandi

Smart Mandi is a farmer-first digital mandi prototype that helps farmers compare crop prices, receive AI-style selling suggestions, and connect directly with buyers to reduce dependence on middlemen.

## What It Does

- Shows dynamic mandi prices for major crops.
- Provides login and signup flows for farmers and buyers.
- Displays personalised crop selling suggestions.
- Provides an interactive AI crop advice form powered by local Ollama when available.
- Lets farmers publish crop listings.
- Lets buyers reveal seller contact details and send buy requests.
- Stores demo users, listings, prices, and requests in a local JSON database.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js built-in HTTP server
- Database: Local JSON file
- Runtime: No npm package install required

## Run Locally

From the project root:

```powershell
.\start-smart-mandi.ps1
```

Then open:

```text
http://127.0.0.1:3000/index.html
```

## Demo Login

Farmer account:

```text
Mobile: 9876543210
Password: demo123
```

Buyer account:

```text
Mobile: 9123456780
Password: demo123
```

## API Routes

- `GET /api/health`
- `GET /api/prices`
- `GET /api/listings`
- `POST /api/listings`
- `POST /api/buy-requests`
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/suggestions?crop=Wheat`
- `POST /api/ai/advice`

## Optional Ollama AI

Smart Mandi can use Ollama as a local AI provider, so the prototype does not require paid API credits.

Install Ollama, then pull a model:

```powershell
ollama pull llama3.2
```

Start Ollama, then run Smart Mandi normally. The backend calls:

```text
http://127.0.0.1:11434/api/generate
```

Defaults:

```text
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

If Ollama is not running, Smart Mandi returns a rule-based fallback answer so the demo still works.

## Local Data Files

- `database/smart-mandi.json` contains the seed demo data.
- `database/smart-mandi-runtime.json` is created automatically when the app saves new users, listings, or buy requests.
- If OneDrive blocks runtime file writes, the backend keeps new demo data in memory for the current server session.

## Hackathon Pitch

Smart Mandi gives farmers clearer market information, AI-assisted selling guidance, and direct buyer access. It aims to improve price transparency and reduce unnecessary commission layers between farmers and buyers.

## Next Steps

- Replace the JSON file with SQLite, MongoDB, PostgreSQL, or MySQL.
- Add JWT authentication and session expiry.
- Add farmer and buyer dashboards.
- Add listing edit/delete controls.
- Integrate real mandi price data.
- Add real AI recommendations using weather, demand, soil, and price history.
- Add admin verification for farmers, buyers, and listings.
- Deploy the backend and frontend under a real domain.
