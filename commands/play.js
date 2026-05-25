const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getOrCreateQueue } = require('../utils/helpers');
const { updatePlayerPanel } = require('../utils/playerUI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist from YouTube or Spotify')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Song name, YouTube URL, or Spotify URL')
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt.setName('next')
        .setDescription('Insert this song next in queue instead of at the end')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query');
    const insertNext = interaction.options.getBoolean('next') ?? false;

    await interaction.deferReply();

    const { queue } = await getOrCreateQueue(interaction);
    if (!queue) return;

    try {
      const tracks = await queue.resolveQuery(query, interaction.user.toString());

      await queue.addTracks(tracks, insertNext);

      if (tracks.length === 1) {
        const embed = new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle(insertNext ? '⏭ Playing Next' : '✅ Added to Queue')
          .setDescription(`**[${tracks[0].title}](${tracks[0].url})**`)
          .setThumbnail(tracks[0].thumbnail || null)
          .addFields(
            { name: '⏱ Duration', value: tracks[0].duration || 'Live', inline: true },
            { name: '📋 Position', value: insertNext ? '#2' : `#${queue.tracks.length}`, inline: true },
          );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('✅ Playlist Added to Queue')
          .setDescription(`Added **${tracks.length} tracks** to the queue.`)
          .addFields({ name: 'First Track', value: tracks[0].title });
        await interaction.editReply({ embeds: [embed] });
      }

      await updatePlayerPanel(queue, client);
    } catch (e) {
      await interaction.editReply(`❌ Error: ${e.message}`);
    }
  },
};
