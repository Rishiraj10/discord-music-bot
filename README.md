# 🎵 Discord Music Bot

A feature-rich Discord music bot with YouTube, Spotify, playlists, and **free hosting on Render**.

Audio runs through **Lavalink** (no `ffmpeg.exe` or `yt-dlp` on your bot). That is what makes music work on Render.

---

## ✨ Features

| Feature | Description |
|--------|-------------|
| 🎵 Play music | YouTube URLs, search, Spotify tracks/playlists/albums |
| ⏭ Skip / ⏮ Previous | Skip songs or go back |
| ⏸ Pause / ▶️ Resume | Full playback control |
| 🔊 Volume | 0–200% volume control |
| 🔁 Loop | Loop track, loop queue, or off |
| 🔀 Shuffle | Shuffle the queue |
| 📋 Queue | View, remove, or clear queue |
| 🎼 Playlists | Per-user saved playlists |
| 🔍 Search | Pick from 5 YouTube results with buttons |
| 🌐 Render-ready | HTTP keep-alive + Lavalink (no local ffmpeg) |

---

## 🚀 Deploy on Render (free)

### 1 — Discord bot

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** → enable **Message Content Intent**
3. Copy **Bot Token**
4. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands` → permissions **Connect**, **Speak**, **Send Messages**, **Embed Links**
5. Invite the bot to your server

### 2 — Spotify (optional, for Spotify links)

1. [Spotify Dashboard](https://developer.spotify.com/dashboard) → create app
2. Copy **Client ID** and **Client Secret**

### 3 — Lavalink (required for music)

The bot does not play audio by itself on Render. It connects to a **Lavalink** server (free public nodes exist).

1. Open [https://lavalink.darrennathanael.com/](https://lavalink.darrennathanael.com/) (or any Lavalink v4 node list)
2. Pick a node with **SSL** and note **Host**, **Port**, **Password**
3. Example (change when the list updates):

   | Variable | Example |
   |----------|---------|
   | `LAVALINK_HOST` | `lavalink.lexnet.cc` |
   | `LAVALINK_PORT` | `443` |
   | `LAVALINK_PASSWORD` | *(password from the list)* |
   | `LAVALINK_SECURE` | `true` |

### 4 — Push to GitHub & deploy on Render

1. Push this repo to GitHub
2. [Render](https://render.com) → **New → Web Service** → connect the repo
3. **Build command:** `npm install`
4. **Start command:** `node index.js`
5. **Environment variables:**

   ```
   BOT_TOKEN=...
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   LAVALINK_HOST=...
   LAVALINK_PASSWORD=...
   LAVALINK_PORT=443
   LAVALINK_SECURE=true
   PORT=10000
   ```

6. Deploy

### 5 — Keep bot awake (UptimeRobot)

Free Render sleeps without HTTP traffic. Ping every 5 minutes:

1. [UptimeRobot](https://uptimerobot.com) → **HTTP monitor**
2. URL: `https://YOUR-APP.onrender.com`
3. Interval: **5 minutes**

### 6 — Test in Discord

1. Join a voice channel
2. `/join` then `/play never gonna give you up`
3. In Render **Logs**, you should see: `✅ Lavalink node "main" connected`

---

## 🛠 Local development

```bash
npm install
cp .env.example .env
# Fill BOT_TOKEN, Spotify keys, and Lavalink variables (same as Render)
npm start
```

**Requirements:** Node.js 18+. No `ffmpeg.exe` in the project — Lavalink handles audio.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Could not connect to voice | Be in a voice channel; bot needs **Connect** + **Speak** |
| Lavalink is not configured | Set `LAVALINK_HOST` and `LAVALINK_PASSWORD` on Render |
| Lavalink offline in logs | Public node may be down — try another from the Lavalink list |
| No audio / play fails | Check Render logs; try a different Lavalink node |
| Bot sleeps / slow first command | Set up UptimeRobot on your Render URL |
| Commands missing | Global slash commands can take up to ~1 hour |

---

## 📖 Commands

`/play` `/search` `/join` `/leave` `/skip` `/pause` `/resume` `/stop` `/queue` `/volume` `/loop` `/shuffle` `/nowplaying` `/playlist` `/help`

---

*Built with discord.js v14, Shoukaku, and Lavalink*
