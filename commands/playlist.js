const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { savePlaylists, getOrCreateQueue } = require('../utils/helpers');
const { resolveTracks } = require('../MusicQueue');
const { updatePlayerPanel } = require('../utils/playerUI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage your custom playlists')
    .addSubcommand(sub =>
      sub.setName('create').setDescription('Create a new playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Add current song to a playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('addurl').setDescription('Add a song URL to a playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
        .addStringOption(o => o.setName('url').setDescription('YouTube or Spotify URL').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove-song').setDescription('Remove a song from a playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
        .addIntegerOption(o => o.setName('position').setDescription('Song position (1-based)').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('delete').setDescription('Delete an entire playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List all your playlists')
    )
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View songs in a playlist')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('play').setDescription('Play one of your playlists')
        .addStringOption(o => o.setName('name').setDescription('Playlist name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rename').setDescription('Rename a playlist')
        .addStringOption(o => o.setName('name').setDescription('Current playlist name').setRequired(true))
        .addStringOption(o => o.setName('newname').setDescription('New playlist name').setRequired(true))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (!client.playlists.has(userId)) client.playlists.set(userId, {});
    const userPlaylists = client.playlists.get(userId);

    const playlistName = interaction.options.getString('name');

    // ── CREATE ──
    if (sub === 'create') {
      if (userPlaylists[playlistName]) {
        return interaction.reply({ content: `❌ Playlist **${playlistName}** already exists!`, ephemeral: true });
      }
      userPlaylists[playlistName] = [];
      savePlaylists(client);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x1DB954)
          .setTitle('✅ Playlist Created')
          .setDescription(`Created playlist **${playlistName}**! Use \`/playlist add\` to add songs.`)],
      });
    }

    // ── ADD CURRENT SONG ──
    if (sub === 'add') {
      if (!userPlaylists[playlistName]) return interaction.reply({ content: `❌ Playlist **${playlistName}** not found!`, ephemeral: true });
      const queue = client.queues.get(interaction.guild.id);
      const track = queue?.getCurrentTrack();
      if (!track) return interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
      userPlaylists[playlistName].push({ title: track.title, url: track.url, duration: track.duration, thumbnail: track.thumbnail });
      savePlaylists(client);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x1DB954)
          .setDescription(`✅ Added **${track.title}** to **${playlistName}**`)],
      });
    }

    // ── ADD URL ──
    if (sub === 'addurl') {
      await interaction.deferReply();
      if (!userPlaylists[playlistName]) return interaction.editReply(`❌ Playlist **${playlistName}** not found!`);
      if (!client.shoukaku) {
        return interaction.editReply('❌ Lavalink is not configured. Set LAVALINK_* variables on Render.');
      }

      const url = interaction.options.getString('url');
      try {
        const tracks = await resolveTracks(client.shoukaku, url, interaction.user.toString());
        for (const t of tracks) {
          userPlaylists[playlistName].push({
            title: t.title,
            url: t.url,
            duration: t.duration,
            thumbnail: t.thumbnail,
            encoded: t.encoded,
          });
        }
        savePlaylists(client);
        const preview = tracks.slice(0, 3).map(t => `• ${t.title}`).join('\n');
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle('✅ Added to Playlist')
            .setDescription(`Added **${tracks.length}** song(s) to **${playlistName}**${tracks.length <= 3 ? '' : `\n\n${preview}\n…`}`)],
        });
      } catch (e) {
        return interaction.editReply(`❌ Error: ${e.message}`);
      }
    }

    // ── REMOVE SONG ──
    if (sub === 'remove-song') {
      if (!userPlaylists[playlistName]) return interaction.reply({ content: `❌ Playlist not found!`, ephemeral: true });
      const pos = interaction.options.getInteger('position') - 1;
      if (pos < 0 || pos >= userPlaylists[playlistName].length) {
        return interaction.reply({ content: '❌ Invalid position!', ephemeral: true });
      }
      const removed = userPlaylists[playlistName].splice(pos, 1)[0];
      savePlaylists(client);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF5733).setDescription(`🗑 Removed **${removed.title}** from **${playlistName}**`)],
      });
    }

    // ── DELETE PLAYLIST ──
    if (sub === 'delete') {
      if (!userPlaylists[playlistName]) return interaction.reply({ content: `❌ Playlist not found!`, ephemeral: true });
      delete userPlaylists[playlistName];
      savePlaylists(client);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`🗑 Deleted playlist **${playlistName}**`)],
      });
    }

    // ── LIST PLAYLISTS ──
    if (sub === 'list') {
      const names = Object.keys(userPlaylists);
      if (!names.length) return interaction.reply({ content: '📭 You have no playlists. Use `/playlist create <name>` to start!', ephemeral: true });
      const lines = names.map((n, i) => `\`${i + 1}.\` **${n}** — ${userPlaylists[n].length} songs`);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🎵 ${interaction.user.username}'s Playlists`)
          .setDescription(lines.join('\n'))],
      });
    }

    // ── VIEW PLAYLIST ──
    if (sub === 'view') {
      if (!userPlaylists[playlistName]) return interaction.reply({ content: `❌ Playlist not found!`, ephemeral: true });
      const songs = userPlaylists[playlistName];
      if (!songs.length) return interaction.reply({ content: `📭 **${playlistName}** is empty!`, ephemeral: true });
      const lines = songs.map((s, i) => `\`${i + 1}.\` [${s.title}](${s.url}) — ${s.duration}`);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📋 Playlist: ${playlistName}`)
          .setDescription(lines.slice(0, 20).join('\n') + (lines.length > 20 ? `\n...and ${lines.length - 20} more` : ''))
          .setFooter({ text: `${songs.length} songs total` })],
      });
    }

    // ── PLAY PLAYLIST ──
    if (sub === 'play') {
      await interaction.deferReply();
      if (!userPlaylists[playlistName]) return interaction.editReply(`❌ Playlist **${playlistName}** not found!`);
      const songs = userPlaylists[playlistName];
      if (!songs.length) return interaction.editReply(`❌ Playlist **${playlistName}** is empty!`);

      const { queue } = await getOrCreateQueue(interaction);
      if (!queue) return;

      const tracks = songs.map(s => ({ ...s, requester: interaction.user.toString() }));
      await queue.addTracks(tracks);
      await updatePlayerPanel(queue, client);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('▶️ Playing Playlist')
          .setDescription(`Loaded **${tracks.length}** songs from **${playlistName}** into the queue!`)],
      });
    }

    // ── RENAME ──
    if (sub === 'rename') {
      const newName = interaction.options.getString('newname');
      if (!userPlaylists[playlistName]) return interaction.reply({ content: `❌ Playlist not found!`, ephemeral: true });
      if (userPlaylists[newName]) return interaction.reply({ content: `❌ A playlist named **${newName}** already exists!`, ephemeral: true });
      userPlaylists[newName] = userPlaylists[playlistName];
      delete userPlaylists[playlistName];
      savePlaylists(client);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`✏️ Renamed **${playlistName}** → **${newName}**`)],
      });
    }
  },
};
