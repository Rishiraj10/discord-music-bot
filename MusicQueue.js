const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
  getVoiceConnection,
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Refresh Spotify token
async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    // Refresh before expiry
    setTimeout(refreshSpotifyToken, (data.body['expires_in'] - 60) * 1000);
  } catch (e) {
    console.error('Spotify token error:', e.message);
    setTimeout(refreshSpotifyToken, 60000);
  }
}
refreshSpotifyToken();

class MusicQueue {
  constructor(guildId, textChannel, voiceChannel) {
    this.guildId = guildId;
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;
    this.tracks = [];       // array of { title, url, duration, requester, thumbnail }
    this.currentIndex = 0;
    this.volume = 0.5;
    this.loop = false;      // 'none' | 'track' | 'queue'
    this.loopMode = 'none';
    this.paused = false;
    this.player = createAudioPlayer();
    this.connection = null;
    this.idleTimeout = null;

    this.player.on(AudioPlayerStatus.Idle, () => this._onIdle());
    this.player.on('error', err => {
      console.error('Player error:', err.message);
      this._onIdle();
    });
  }

  async connect() {
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
      this.connection.subscribe(this.player);
    } catch {
      this.connection.destroy();
      throw new Error('Could not connect to voice channel.');
    }

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
  }

  async resolveQuery(query, requester) {
    // YouTube URL
    if (ytdl.validateURL(query)) {
      const info = await ytdl.getInfo(query);
      const details = info.videoDetails;
      return [{
        title: details.title,
        url: details.video_url,
        duration: this._formatDuration(parseInt(details.lengthSeconds)),
        thumbnail: details.thumbnails.slice(-1)[0]?.url || '',
        requester,
      }];
    }

    // Spotify URL
    if (query.includes('spotify.com')) {
      return await this._resolveSpotify(query, requester);
    }

    // Plain text search → YouTube
    const result = await ytSearch(query);
    const video = result.videos[0];
    if (!video) throw new Error('No results found.');
    return [{
      title: video.title,
      url: video.url,
      duration: video.timestamp || '?:??',
      thumbnail: video.thumbnail || '',
      requester,
    }];
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
        if (video) tracks.push({ title: `${t.name} — ${t.artists[0].name}`, url: video.url, duration: video.timestamp, thumbnail: t.album.images[0]?.url || '', requester });
      } else if (url.includes('/playlist/')) {
        const id = url.split('/playlist/')[1].split('?')[0];
        const data = await spotifyApi.getPlaylistTracks(id, { limit: 50 });
        for (const item of data.body.items) {
          if (!item.track) continue;
          const t = item.track;
          const search = await ytSearch(`${t.name} ${t.artists[0].name} audio`);
          const video = search.videos[0];
          if (video) tracks.push({ title: `${t.name} — ${t.artists[0].name}`, url: video.url, duration: video.timestamp, thumbnail: t.album.images[0]?.url || '', requester });
        }
      } else if (url.includes('/album/')) {
        const id = url.split('/album/')[1].split('?')[0];
        const data = await spotifyApi.getAlbumTracks(id, { limit: 50 });
        const albumInfo = await spotifyApi.getAlbum(id);
        const albumName = albumInfo.body.name;
        const artist = albumInfo.body.artists[0].name;
        for (const t of data.body.items) {
          const search = await ytSearch(`${t.name} ${artist} audio`);
          const video = search.videos[0];
          if (video) tracks.push({ title: `${t.name} — ${artist}`, url: video.url, duration: video.timestamp, thumbnail: albumInfo.body.images[0]?.url || '', requester });
        }
      }
    } catch (e) {
      throw new Error(`Spotify error: ${e.message}`);
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

    if (this.player.state.status === AudioPlayerStatus.Idle && !this.paused) {
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
    try {
      const stream = ytdl(track.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
      });
      const resource = createAudioResource(stream, { inlineVolume: true });
      resource.volume.setVolume(this.volume);
      this.currentResource = resource;
      this.player.play(resource);
      this.paused = false;
      this._clearIdleTimeout();
    } catch (e) {
      console.error(`Error playing ${track.title}:`, e.message);
      await this.textChannel.send(`⚠️ Could not play **${track.title}**, skipping...`);
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
    this.player.pause();
    this.paused = true;
  }

  resume() {
    this.player.unpause();
    this.paused = false;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(2, vol / 100));
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(this.volume);
    }
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
    this.loopMode = mode; // 'none', 'track', 'queue'
  }

  getCurrentTrack() {
    return this.tracks[this.currentIndex] || null;
  }

  _startIdleTimeout() {
    this._clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      this.textChannel.send('👋 Left the voice channel due to inactivity.');
      this.destroy();
    }, 5 * 60 * 1000); // 5 min idle
  }

  _clearIdleTimeout() {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
  }

  destroy() {
    this._clearIdleTimeout();
    this.player.stop(true);
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }

  _formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

module.exports = MusicQueue;
