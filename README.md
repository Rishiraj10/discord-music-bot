# 🎵 Discord Music Bot

A feature-rich Discord music bot with YouTube, Spotify support, custom playlists, and free 24/7 hosting.

---

## ✨ Features

| Feature | Description |
|--------|-------------|
| 🎵 Play music | YouTube URLs, YouTube search, Spotify tracks/playlists/albums |
| ⏭ Skip / ⏮ Previous | Skip songs or go back |
| ⏸ Pause / ▶️ Resume | Full playback control |
| 🔊 Volume | 0–200% volume control |
| 🔁 Loop | Loop track, loop queue, or off |
| 🔀 Shuffle | Shuffle the queue randomly |
| 📋 Queue | View, remove, or clear queue |
| 🎼 Playlists | Create, save, manage, play custom playlists per user |
| 🔍 Search | Search YouTube and pick from 5 results with buttons |
| 📡 24/7 VC | Bot stays in voice channel, rejoins if disconnected |
| 🌐 Keep-alive | HTTP server so Render/Railway keeps it running |

---

## 🚀 Setup Guide

### Step 1 — Create a Discord Bot

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** → click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copy your **Bot Token** (keep this secret!)
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Connect`, `Speak`, `Send Messages`, `Embed Links`, `Read Message History`
7. Copy the generated URL and open it to invite the bot to your server

### Step 2 — Get Spotify Credentials

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in the details (Redirect URI can be `http://localhost`)
4. Copy your **Client ID** and **Client Secret**

### Step 3 — Deploy for Free 24/7 on Render.com

1. Push this project to a **GitHub repository**
2. Go to [https://render.com](https://render.com) → Sign up free
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Set these settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free
6. Under **Environment Variables**, add:
   ```
   BOT_TOKEN = your_discord_bot_token
   SPOTIFY_CLIENT_ID = your_spotify_client_id
   SPOTIFY_CLIENT_SECRET = your_spotify_client_secret
   PORT = 10000
   ```
7. Click **Deploy**!

### Step 4 — Keep It Alive (Prevent Render Sleep)

Free Render services sleep after 15 min of no HTTP requests.  
Use **UptimeRobot** (free) to ping your bot every 5 minutes:

1. Go to [https://uptimerobot.com](https://uptimerobot.com) → Sign up
2. Add a **HTTP(S) monitor**
3. URL: `https://your-render-app-name.onrender.com`
4. Interval: **5 minutes**
5. Save ✅

Your bot will now run **24/7 for free**!

---

## 📖 All Commands

### ▶️ Playback
```
/play <song name or URL>        Play from YouTube/Spotify or search
/play <url> next:True           Insert song next in queue
/search <term>                  Search YouTube, pick from results
/skip [count]                   Skip 1 or more songs
/previous                       Go to previous song
/pause                          Pause playback
/resume                         Resume playback
/stop                           Stop and clear everything
/nowplaying                     Show current song info
```

### 🎚️ Controls
```
/volume <0-200>                 Set volume (100 = normal)
/loop <off|track|queue>         Set loop mode
/shuffle                        Shuffle the queue
```

### 📋 Queue
```
/queue [page]                   View song queue
/remove <position>              Remove song from queue
/clear                          Clear queue, keep current song
```

### 🎼 Custom Playlists
```
/playlist create <name>         Create a new playlist
/playlist add <name>            Add currently playing song
/playlist addurl <name> <url>   Add by YouTube/Spotify URL
/playlist remove-song <n> <pos> Remove a song from playlist
/playlist play <name>           Load and play your playlist
/playlist list                  See all your playlists
/playlist view <name>           See songs in a playlist
/playlist rename <name> <new>   Rename a playlist
/playlist delete <name>         Delete a playlist
```

### 🤖 Bot
```
/join                           Join your voice channel (24/7 mode)
/leave                          Leave voice channel
/help                           Show command list
```

---

## 🎧 Supported Sources

- ✅ **YouTube** — direct URLs + search
- ✅ **Spotify tracks** — `https://open.spotify.com/track/...`
- ✅ **Spotify playlists** — up to 50 songs
- ✅ **Spotify albums** — up to 50 tracks

> **Note**: Spotify audio is fetched from YouTube using track name + artist search. This is legal for personal use.

---

## 📁 Project Structure

```
discord-music-bot/
├── index.js              # Bot entry point & slash command loader
├── MusicQueue.js         # Core audio engine (queue, playback, Spotify resolver)
├── utils/
│   └── helpers.js        # Shared utilities (embeds, queue helpers)
├── commands/
│   ├── play.js           # /play
│   ├── search.js         # /search with button selection
│   ├── playlist.js       # /playlist (all subcommands)
│   ├── help.js           # /help
│   ├── nowplaying.js     # /nowplaying
│   ├── queue.js          # /queue
│   ├── skip.js           # /skip
│   ├── pause.js          # /pause
│   ├── resume.js         # /resume
│   ├── stop.js           # /stop
│   ├── volume.js         # /volume
│   ├── loop.js           # /loop
│   ├── shuffle.js        # /shuffle
│   ├── previous.js       # /previous
│   ├── remove.js         # /remove
│   ├── clear.js          # /clear
│   ├── join.js           # /join
│   └── leave.js          # /leave
├── data/
│   └── playlists.json    # Saved user playlists (auto-created)
├── .env.example          # Environment variables template
├── render.yaml           # Render.com deployment config
├── package.json
└── README.md
```

---

## 🛠 Local Development

```bash
# Clone / download the project
cd discord-music-bot

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your tokens

# Run the bot
npm start

# Or with auto-restart on file change
npm run dev
```

**Requirements**: Node.js 18+, FFmpeg (installed automatically via `ffmpeg-static`)

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't respond | Check BOT_TOKEN in .env, ensure Message Content Intent is enabled |
| No audio plays | Ensure bot has Connect + Speak permissions in the voice channel |
| Spotify doesn't work | Verify SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET |
| Bot goes offline | Set up UptimeRobot to ping your Render URL every 5 min |
| Commands not showing | Slash commands can take up to 1 hour to appear globally |

---

*Made with ❤️ using discord.js v14, @discordjs/voice, and ytdl-core*
