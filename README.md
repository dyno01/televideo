# Telegram Learning Dashboard

A personal learning manager that scans Telegram channels for educational content (videos, PDFs, documents) and organizes them into a structured dashboard with progress tracking and notes.

---

## Prerequisites

- **Node.js** v18 or higher
- **Telegram API credentials** — get them free at [my.telegram.org](https://my.telegram.org)

---

## Getting Your Telegram API Credentials

1. Go to [https://my.telegram.org](https://my.telegram.org)
2. Log in with your phone number (Telegram sends a code)
3. Click **"API Development Tools"**
4. Fill in any name/description and click **Create Application**
5. You'll see your `App api_id` (a number) and `App api_hash` (a string)

---

## Setup Instructions

### 1. Clone / Open the Project

```bash
cd /path/to/televideo-organiser
```

### 2. Setup the Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and fill in your credentials:

```
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890
SESSION_STRING=
PORT=4000
```

> Leave `SESSION_STRING` empty for now — the backend will generate it on first run and print it to the terminal. Copy that value and paste it back in.

Start the backend:

```bash
npm run dev
```

### 3. Setup the Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Using the App

1. Enter a public Telegram channel username (e.g. `civilengineeringcourse`) and click **Scan**
2. The backend will scan all channel messages and extract videos, PDFs, and files
3. Browse your content in the organized dashboard
4. Click any video to open the player — progress is automatically saved
5. Add timestamp-linked notes while watching
6. PDFs and documents appear in the File Library tab

---

## Project Structure

```
televideo-organiser/
├── backend/
│   ├── server.js            # Express app entry point
│   ├── telegramClient.js    # GramJS Telegram connection
│   ├── db/
│   │   ├── database.js      # SQLite connection + helpers
│   │   └── schema.sql       # Table definitions (reference)
│   └── routes/
│       ├── channelRoutes.js
│       ├── videoRoutes.js
│       ├── progressRoutes.js
│       ├── notesRoutes.js
│       └── filesRoutes.js
│
└── frontend/
    ├── app/
    │   ├── page.tsx                          # Home (channel import)
    │   ├── channel/[username]/page.tsx       # Channel dashboard
    │   └── video/[id]/page.tsx               # Video player
    └── components/
        ├── VideoPlayer.tsx
        ├── LectureList.tsx
        ├── NotesPanel.tsx
        ├── FileLibrary.tsx
        └── ChannelCard.tsx
```

---

## Security Notes

- Your `.env` file is **never committed** (it's in `.gitignore`)
- The app **only reads** channel metadata — it never sends messages or modifies anything
- Media files stay on Telegram's servers — nothing is downloaded or re-hosted
- For personal use only

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, Lucide Icons |
| Backend | Node.js, Express.js |
| Telegram | GramJS (telegram npm package) |
| Database | SQLite (better-sqlite3) |
# televideo
