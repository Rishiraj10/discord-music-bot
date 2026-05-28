const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

let spotifyTokenPromise = null;

function formatError(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message && !e.message.includes('[object Object]')) return e.message;
  const body = e.body;
  if (typeof body === 'string') return body;
  if (body?.error?.message) return body.error.message;
  if (body?.error_description) return body.error_description;
  if (body?.message) return body.message;
  
  // Handle statusCode errors
  if (e.statusCode) {
    const statusMessages = {
      400: 'Bad request to Spotify API',
      401: 'Spotify authentication failed - check credentials',
      403: 'Spotify access forbidden',
      404: 'Spotify content not found',
      429: 'Spotify rate limit exceeded',
      500: 'Spotify server error',
      503: 'Spotify service unavailable'
    };
    return statusMessages[e.statusCode] || `Spotify API error (${e.statusCode})`;
  }
  
  try {
    const raw = JSON.stringify(body ?? e);
    if (raw === '{}') return 'Spotify API connection failed - check credentials';
    return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
  } catch {
    return 'Request failed';
  }
}

async function ensureSpotifyToken() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on Render.');
  }
  if (spotifyApi.getAccessToken()) return;
  if (!spotifyTokenPromise) {
    spotifyTokenPromise = spotifyApi.clientCredentialsGrant()
      .then(data => {
        spotifyApi.setAccessToken(data.body.access_token);
        setTimeout(refreshSpotifyToken, (data.body.expires_in - 60) * 1000);
      })
      .catch(err => {
        console.error('Spotify token generation failed:', formatError(err));
        throw new Error(`Spotify authentication failed: ${formatError(err)}`);
      })
      .finally(() => { spotifyTokenPromise = null; });
  }
  await spotifyTokenPromise;
}

async function refreshSpotifyToken() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return;
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    setTimeout(refreshSpotifyToken, (data.body['expires_in'] - 60) * 1000);
  } catch (e) {
    console.error('Spotify token error:', formatError(e));
    setTimeout(refreshSpotifyToken, 60000);
  }
}
refreshSpotifyToken();

function normalizeSpotifyUrl(url) {
  return url
    .replace(/open\.spotify\.com\/intl-[a-z]{2}\//i, 'open.spotify.com/')
    .split('?')[0];
}

function formatMs(ms) {
  if (!ms || ms < 0) return '?:??';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function trackFromLavalink(data, requester, meta = {}) {
  const info = data.info;
  return {
    title: meta.title || info.title,
    url: info.uri || meta.url || '',
    duration: formatMs(info.length),
    thumbnail: meta.thumbnail || info.artworkUrl || '',
    requester,
    encoded: data.encoded,
  };
}

function parseLavalinkResult(result, requester, meta = {}) {
  if (result.loadType === 'error') {
    throw new Error(result.data?.message || 'Failed to load track.');
  }
  if (result.loadType === 'empty') {
    throw new Error('No results found.');
  }

  const tracks = [];
  if (result.loadType === 'track') {
    tracks.push(trackFromLavalink(result.data, requester, meta));
  } else if (result.loadType === 'search') {
    const list = Array.isArray(result.data) ? result.data : result.data?.tracks || [];
    for (const t of list) tracks.push(trackFromLavalink(t, requester, meta));
  } else if (result.loadType === 'playlist') {
    const list = result.data.tracks || result.data;
    for (const t of list) tracks.push(trackFromLavalink(t, requester, meta));
  }
  if (!tracks.length) throw new Error('No results found.');
  return tracks;
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

class MusicQueue {
  constructor(guildId, textChannel, voiceChannel, shoukaku) {
    this.guildId = guildId;
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;
    this.shoukaku = shoukaku;
    this.tracks = [];
    this.currentIndex = 0;
    this.volume = 50;
    this.loopMode = 'none';
    this.paused = false;
    this.lavalinkPlayer = null;
    this.idleTimeout = null;
    this._eventsBound = false;
    this.panelMessage = null;
    this.panelView = 'player';
    this.queuePage = 1;
    this.stay247 = false;
    this.autoplay = false;
    this._lastTrack = null;
  }

  _getNode() {
    if (!this.shoukaku) {
      throw new Error('Music server (Lavalink) is offline. Check LAVALINK_* env vars on Render.');
    }
    const node = this.shoukaku.getIdealNode();
    if (!node) throw new Error('Music server (Lavalink) is offline. Check LAVALINK_* env vars on Render.');
    return node;
  }

  async _resolveYoutubeSearch(artist, title, requester, thumbnail = '') {
    const node = this._getNode();
    const query = `ytsearch:${artist} - ${title}`;
    const result = await node.rest.resolve(query);
    const tracks = parseLavalinkResult(result, requester, { title: `${title} — ${artist}`, thumbnail });
    return tracks[0];
  }

  async connect() {
    this._getNode();

    const guild = this.voiceChannel.guild;
    try {
      await this.shoukaku.joinVoiceChannel({
        guildId: this.guildId,
        channelId: this.voiceChannel.id,
        shardId: guild.shard?.id ?? 0,
        deaf: true,
      });
    } catch (err) {
      console.error('Voice join failed:', err?.message || err);
      throw new Error(
        'Could not connect to voice channel. Check bot permissions (Connect, Speak) and that you are in a voice channel.'
      );
    }

    this.lavalinkPlayer = this.shoukaku.players.get(this.guildId);
    this._bindPlayerEvents();
  }

  _bindPlayerEvents() {
    if (!this.lavalinkPlayer || this._eventsBound) return;
    this._eventsBound = true;

    this.lavalinkPlayer.on('end', (data) => {
      if (data.reason === 'replaced' || data.reason === 'stopped') return;
      this._onIdle();
    });

    this.lavalinkPlayer.on('exception', (data) => {
      console.error('Playback error:', data.exception?.message || data);
      this.textChannel.send('⚠️ Playback error, skipping...').catch(() => {});
      this.currentIndex++;
      this.play().catch(() => {});
    });

    this.lavalinkPlayer.on('start', () => {
      this._updatePanel();
    });
  }

  async _updatePanel() {
    try {
      const { updatePlayerPanel } = require('./utils/playerUI');
      await updatePlayerPanel(this, this.textChannel?.client);
    } catch {}
  }

  async resolveQuery(query, requester) {
    const node = this._getNode();

    if (/spotify\.com/i.test(query)) {
      return this._resolveSpotify(query, requester);
    }

    const identifier = /^https?:\/\//i.test(query) ? query : `ytsearch:${query}`;
    const result = await node.rest.resolve(identifier);
    return parseLavalinkResult(result, requester);
  }

  async _resolveSpotify(url, requester) {
    // Free Spotify scraping - no API or Premium required!
    const normalized = normalizeSpotifyUrl(url);
    const tracks = [];

    try {
      if (normalized.includes('/track/')) {
        const id = normalized.split('/track/')[1].split('/')[0];
        const trackInfo = await this._scrapeSpotifyTrack(id);
        const track = await this._resolveYoutubeSearch(trackInfo.artist, trackInfo.title, requester, trackInfo.thumbnail);
        if (track) tracks.push(track);
      } else if (normalized.includes('/playlist/') || normalized.includes('/album/')) {
        throw new Error('Spotify playlists and albums are not supported without Premium. Please use individual track links or YouTube playlists.');
      } else {
        throw new Error('Unsupported Spotify link. Use a track URL.');
      }
    } catch (e) {
      if (e.message?.includes('not supported') || e.message?.includes('Unsupported')) throw e;
      throw new Error(`Spotify error: ${formatError(e)}`);
    }

    if (!tracks.length) {
      throw new Error('Could not find YouTube matches for that Spotify link. Try a direct YouTube URL or song name.');
    }
    return tracks;
  }

  async _scrapeSpotifyTrack(trackId) {
    // Scrape Spotify's public embed page (no auth required)
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'open.spotify.com',
        path: `/embed/track/${trackId}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            // Extract track info from HTML
            const titleMatch = data.match(/<title>([^<]+)<\/title>/);
            if (!titleMatch) {
              reject(new Error('Could not extract track info from Spotify'));
              return;
            }

            const fullTitle = titleMatch[1].replace(' - song and lyrics by ', '|').replace(' | Spotify', '');
            const parts = fullTitle.split('|');
            
            if (parts.length < 2) {
              reject(new Error('Could not parse Spotify track info'));
              return;
            }

            const title = parts[0].trim();
            const artist = parts[1].trim();

            // Try to extract thumbnail
            const thumbnailMatch = data.match(/<meta property="og:image" content="([^"]+)"/);
            const thumbnail = thumbnailMatch ? thumbnailMatch[1] : '';

            resolve({ title, artist, thumbnail });
          } catch (err) {
            reject(new Error('Failed to parse Spotify page'));
          }
        });
      }).on('error', (err) => {
        reject(new Error('Failed to fetch Spotify track info'));
      });
    });
  }

  async addTracks(newTracks, insertNext = false) {
    if (insertNext && this.tracks.length > 0) {
      this.tracks.splice(this.currentIndex + 1, 0, ...newTracks);
    } else {
      this.tracks.push(...newTracks);
    }

    const playing = this.lavalinkPlayer?.playing;
    if (!playing && !this.paused) {
      await this.play();
    } else {
      await this._updatePanel();
    }
  }

  async play(index = null) {
    if (index !== null) this.currentIndex = index;
    if (!this.tracks.length) return;

    if (this.currentIndex >= this.tracks.length) {
      if (this.loopMode === 'queue') {
        this.currentIndex = 0;
      } else {
        await this._handleQueueFinished();
        return;
      }
    }

    const track = this.tracks[this.currentIndex];
    if (!track.encoded) {
      const result = await this._getNode().rest.resolve(track.url || `ytsearch:${track.title}`);
      const parsed = parseLavalinkResult(result, track.requester);
      track.encoded = parsed[0].encoded;
      if (!track.url) track.url = parsed[0].url;
    }

    if (!this.lavalinkPlayer) {
      this.lavalinkPlayer = this.shoukaku.players.get(this.guildId);
      this._bindPlayerEvents();
    }
    if (!this.lavalinkPlayer) throw new Error('Not connected to a voice channel.');

    try {
      this._lastTrack = track;
      await this.lavalinkPlayer.playTrack({
        track: { encoded: track.encoded },
        options: { volume: this.volume },
      });
      this.paused = false;
      this._clearIdleTimeout();
      this.panelView = 'player';
      await this._updatePanel();
    } catch (e) {
      console.error(`Error playing ${track.title}:`, e.message);
      await this.textChannel.send(`⚠️ Could not play **${track.title}**, skipping...`).catch(() => {});
      this.currentIndex++;
      await this.play();
    }
  }

  async _onIdle() {
    if (this.loopMode === 'track') {
      await this.play();
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.tracks.length) {
        if (this.loopMode === 'queue') {
          this.currentIndex = 0;
          await this.play();
        } else {
          await this._handleQueueFinished();
        }
      } else {
        await this.play();
      }
    }
  }

  async _handleQueueFinished() {
    this._clearIdleTimeout();
    const last = this._lastTrack || this.tracks[this.currentIndex];

    if (this.autoplay && last) {
      try {
        const result = await this._getNode().rest.resolve(`ytsearch:${last.title}`);
        const parsed = parseLavalinkResult(result, last.requester);
        if (parsed[0]) {
          this.tracks = [parsed[0]];
          this.currentIndex = 0;
          await this.play();
          return;
        }
      } catch (e) {
        console.error('AutoPlay failed:', e.message);
      }
    }

    if (this.stay247) {
      this.tracks = [];
      this.currentIndex = 0;
      if (this.lavalinkPlayer) {
        try { this.lavalinkPlayer.stopTrack(); } catch {}
      }
      this.paused = false;
      await this._updatePanel();
      return;
    }
    this._startIdleTimeout();
    await this._updatePanel();
  }

  async stopPlayback() {
    this.tracks = [];
    this.currentIndex = 0;
    if (this.lavalinkPlayer) {
      try { this.lavalinkPlayer.stopTrack(); } catch {}
    }
    this.paused = false;
    await this._updatePanel();
  }

  skip(count = 1) {
    this.currentIndex += count;
    if (this.currentIndex >= this.tracks.length) this.currentIndex = this.tracks.length - 1;
    return this.play(this.currentIndex);
  }

  previous() {
    if (this.currentIndex > 0) this.currentIndex--;
    return this.play(this.currentIndex);
  }

  pause() {
    if (this.lavalinkPlayer) this.lavalinkPlayer.setPaused(true);
    this.paused = true;
  }

  resume() {
    if (this.lavalinkPlayer) this.lavalinkPlayer.setPaused(false);
    this.paused = false;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(200, vol));
    if (this.lavalinkPlayer) this.lavalinkPlayer.setGlobalVolume(this.volume);
  }

  shuffle() {
    const current = this.tracks[this.currentIndex];
    const rest = this.tracks.filter((_, i) => i !== this.currentIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.tracks = [current, ...rest];
    this.currentIndex = 0;
  }

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return null;
    const removed = this.tracks.splice(index, 1)[0];
    if (index < this.currentIndex) this.currentIndex--;
    else if (index === this.currentIndex) this.play(this.currentIndex);
    return removed;
  }

  clear() {
    const current = this.tracks[this.currentIndex];
    this.tracks = current ? [current] : [];
    this.currentIndex = 0;
  }

  setLoopMode(mode) {
    this.loopMode = mode;
  }

  getCurrentTrack() {
    return this.tracks[this.currentIndex] || null;
  }

  _startIdleTimeout() {
    if (this.stay247) return;
    this._clearIdleTimeout();
    this.idleTimeout = setTimeout(async () => {
      await this.textChannel.send('👋 Left the voice channel due to inactivity. Use `/join` for 24/7 mode.').catch(() => {});
      await this.destroy();
    }, 5 * 60 * 1000);
  }

  _clearIdleTimeout() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
  }

  async destroy() {
    this._clearIdleTimeout();
    if (this.lavalinkPlayer) {
      try {
        this.lavalinkPlayer.stopTrack();
      } catch {}
    }
    try {
      this.shoukaku.leaveVoiceChannel(this.guildId);
    } catch {}
    this.lavalinkPlayer = null;
    this._eventsBound = false;
    try {
      const { destroyPlayerPanel } = require('./utils/playerUI');
      await destroyPlayerPanel(this);
    } catch {}
  }
}

/** Resolve tracks without joining voice (playlists, addurl). */
async function resolveTracks(shoukaku, query, requester) {
  if (!shoukaku) {
    throw new Error('Lavalink is not configured. Set LAVALINK_HOST and LAVALINK_PASSWORD on Render.');
  }
  const temp = new MusicQueue('resolve', null, null, shoukaku);
  return temp.resolveQuery(query, requester);
}

module.exports = MusicQueue;
module.exports.resolveTracks = resolveTracks;
module.exports.formatError = formatError;
