const ytSearch = require('yt-search');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    setTimeout(refreshSpotifyToken, (data.body['expires_in'] - 60) * 1000);
  } catch (e) {
    console.error('Spotify token error:', e.message);
    setTimeout(refreshSpotifyToken, 60000);
  }
}
refreshSpotifyToken();

function formatMs(ms) {
  if (!ms || ms < 0) return '?:??';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function trackFromLavalink(data, requester) {
  const info = data.info;
  return {
    title: info.title,
    url: info.uri || info.sourceName || '',
    duration: formatMs(info.length),
    thumbnail: info.artworkUrl || '',
    requester,
    encoded: data.encoded,
  };
}

function parseLavalinkResult(result, requester) {
  if (result.loadType === 'error') {
    throw new Error(result.data?.message || 'Failed to load track.');
  }
  if (result.loadType === 'empty') {
    throw new Error('No results found.');
  }

  const tracks = [];
  if (result.loadType === 'track') {
    tracks.push(trackFromLavalink(result.data, requester));
  } else if (result.loadType === 'search') {
    for (const t of result.data) tracks.push(trackFromLavalink(t, requester));
  } else if (result.loadType === 'playlist') {
    for (const t of result.data.tracks) tracks.push(trackFromLavalink(t, requester));
  }
  if (!tracks.length) throw new Error('No results found.');
  return tracks;
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
  }

  _getNode() {
    const node = this.shoukaku.getIdealNode();
    if (!node) throw new Error('Music server (Lavalink) is offline. Check LAVALINK_* env vars on Render.');
    return node;
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
  }

  async resolveQuery(query, requester) {
    const node = this._getNode();

    if (query.includes('spotify.com')) {
      return this._resolveSpotify(query, requester);
    }

    const identifier = /^https?:\/\//i.test(query) ? query : `ytsearch:${query}`;
    const result = await node.rest.resolve(identifier);
    return parseLavalinkResult(result, requester);
  }

  async _resolveSpotify(url, requester) {
    const tracks = [];
    try {
      if (url.includes('/track/')) {
        const id = url.split('/track/')[1].split('?')[0];
        const data = await spotifyApi.getTrack(id);
        const t = data.body;
        const search = await ytSearch(`${t.name} ${t.artists[0].name} official audio`);
        const video = search.videos[0];
        if (video) {
          const resolved = await this._getNode().rest.resolve(video.url);
          tracks.push(...parseLavalinkResult(resolved, requester));
        }
      } else if (url.includes('/playlist/')) {
        const id = url.split('/playlist/')[1].split('?')[0];
        const data = await spotifyApi.getPlaylistTracks(id, { limit: 50 });
        for (const item of data.body.items) {
          if (!item.track) continue;
          const t = item.track;
          const search = await ytSearch(`${t.name} ${t.artists[0].name} audio`);
          const video = search.videos[0];
          if (video) {
            const resolved = await this._getNode().rest.resolve(video.url);
            tracks.push(...parseLavalinkResult(resolved, requester).slice(0, 1));
          }
        }
      } else if (url.includes('/album/')) {
        const id = url.split('/album/')[1].split('?')[0];
        const data = await spotifyApi.getAlbumTracks(id, { limit: 50 });
        const albumInfo = await spotifyApi.getAlbum(id);
        const artist = albumInfo.body.artists[0].name;
        for (const t of data.body.items) {
          const search = await ytSearch(`${t.name} ${artist} audio`);
          const video = search.videos[0];
          if (video) {
            const resolved = await this._getNode().rest.resolve(video.url);
            tracks.push(...parseLavalinkResult(resolved, requester).slice(0, 1));
          }
        }
      }
    } catch (e) {
      const message = e?.message || e?.body || JSON.stringify(e);
      throw new Error(`Spotify error: ${message}`);
    }
    if (!tracks.length) throw new Error('No Spotify tracks resolved.');
    return tracks;
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
    }
  }

  async play(index = null) {
    if (index !== null) this.currentIndex = index;
    if (!this.tracks.length) return;

    if (this.currentIndex >= this.tracks.length) {
      if (this.loopMode === 'queue') {
        this.currentIndex = 0;
      } else {
        this._startIdleTimeout();
        return;
      }
    }

    const track = this.tracks[this.currentIndex];
    if (!track.encoded) {
      const result = await this._getNode().rest.resolve(track.url);
      const parsed = parseLavalinkResult(result, track.requester);
      track.encoded = parsed[0].encoded;
    }

    if (!this.lavalinkPlayer) {
      this.lavalinkPlayer = this.shoukaku.players.get(this.guildId);
      this._bindPlayerEvents();
    }
    if (!this.lavalinkPlayer) throw new Error('Not connected to a voice channel.');

    try {
      await this.lavalinkPlayer.playTrack({
        track: { encoded: track.encoded },
        options: { volume: this.volume },
      });
      this.paused = false;
      this._clearIdleTimeout();
    } catch (e) {
      console.error(`Error playing ${track.title}:`, e.message);
      await this.textChannel.send(`⚠️ Could not play **${track.title}**, skipping...`).catch(() => {});
      this.currentIndex++;
      await this.play();
    }
  }

  _onIdle() {
    if (this.loopMode === 'track') {
      this.play();
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.tracks.length) {
        if (this.loopMode === 'queue') {
          this.currentIndex = 0;
          this.play();
        } else {
          this._startIdleTimeout();
        }
      } else {
        this.play();
      }
    }
  }

  skip(count = 1) {
    this.currentIndex += count;
    if (this.currentIndex >= this.tracks.length) this.currentIndex = this.tracks.length - 1;
    this.play(this.currentIndex);
  }

  previous() {
    if (this.currentIndex > 0) this.currentIndex--;
    this.play(this.currentIndex);
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
    this._clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      this.textChannel.send('👋 Left the voice channel due to inactivity.').catch(() => {});
      this.destroy();
    }, 5 * 60 * 1000);
  }

  _clearIdleTimeout() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
  }

  destroy() {
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
  }
}

module.exports = MusicQueue;
