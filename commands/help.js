const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎵 Music Bot Commands')
      .setDescription('Use **slash commands** or the **🎛️ control panel** (buttons) after `/join` or `/play`.')
      .addFields(
        {
          name: '🎛️ Control panel buttons',
          value: [
            '⏮️ Previous · ⏸️ Pause/Resume · ⏭️ Skip · ⏹️ Stop · 🔀 Shuffle',
            '🔁 Loop · 🔉/🔊 Volume · 📋 Queue · 🧹 Clear · 👋 Leave VC',
          ].join('\n'),
        },
        {
          name: '▶️ Playback',
          value: [
            '`/play <query>` — YouTube URL, **Spotify URL**, or search term',
            '`/play <url> next:True` — Insert next in queue',
            '`/search <term>` — Search YouTube, pick from 5 results',
            '`/skip [count]` — Skip 1 or more songs',
            '`/previous` — Go to previous song',
            '`/pause` / `/resume` — Pause or resume',
            '`/stop` — Stop and clear everything',
            '`/nowplaying` — Show current song',
          ].join('\n'),
        },
        {
          name: '🎚️ Controls',
          value: [
            '`/volume <0-200>` — Set volume (100 = normal)',
            '`/loop <mode>` — Loop: off / track / queue',
            '`/shuffle` — Shuffle the queue',
          ].join('\n'),
        },
        {
          name: '📋 Queue',
          value: [
            '`/queue [page]` — View the song queue',
            '`/remove <position>` — Remove a song from queue',
            '`/clear` — Clear queue (keep current song)',
          ].join('\n'),
        },
        {
          name: '🎼 Custom Playlists',
          value: [
            '`/playlist create <name>` — Create a new playlist',
            '`/playlist add <name>` — Add currently playing song',
            '`/playlist addurl <name> <url>` — Add by URL (YT/Spotify)',
            '`/playlist remove-song <name> <pos>` — Remove a song',
            '`/playlist play <name>` — Queue your playlist',
            '`/playlist list` — See all your playlists',
            '`/playlist view <name>` — See songs in playlist',
            '`/playlist rename <name> <new>` — Rename a playlist',
            '`/playlist delete <name>` — Delete a playlist',
          ].join('\n'),
        },
        {
          name: '🤖 Bot',
          value: [
            '`/join` — Join your voice channel (24/7 stay)',
            '`/leave` — Leave voice channel',
            '`/help` — Show this menu',
          ].join('\n'),
        },
        {
          name: '🎧 Supported Sources',
          value: '✅ YouTube URLs & search\n✅ Spotify tracks\n✅ Spotify playlists\n✅ Spotify albums',
        }
      )
      .setFooter({ text: 'Bot stays in VC for 5 min of inactivity, then leaves to save resources.' });

    await interaction.reply({ embeds: [embed] });
  },
};
