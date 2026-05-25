const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const ytSearch = require('yt-search');
const { getOrCreateQueue } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search YouTube and pick a song to play')
    .addStringOption(opt =>
      opt.setName('query').setDescription('Search term').setRequired(true)
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query');
    await interaction.deferReply();

    let results;
    try {
      const res = await ytSearch(query);
      results = res.videos.slice(0, 5);
    } catch (e) {
      return interaction.editReply('❌ Search failed. Try again.');
    }

    if (!results.length) return interaction.editReply('❌ No results found.');

    const desc = results.map((v, i) => `**${i + 1}.** [${v.title}](${v.url})\n⏱ ${v.timestamp} • 👁 ${v.views?.toLocaleString() || '?'} views`).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🔍 YouTube Search Results')
      .setDescription(desc)
      .setFooter({ text: 'Select a song below — expires in 30s' });

    const row = new ActionRowBuilder().addComponents(
      results.map((_, i) =>
        new ButtonBuilder()
          .setCustomId(`search_${i}`)
          .setLabel(`${i + 1}`)
          .setStyle(ButtonStyle.Secondary)
      )
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: btn => btn.user.id === interaction.user.id,
    });

    collector.on('collect', async btn => {
      collector.stop();
      const idx = parseInt(btn.customId.split('_')[1]);
      const chosen = results[idx];
      await btn.deferUpdate();

      const { queue } = await getOrCreateQueue(btn);
      if (!queue) return;

      const track = {
        title: chosen.title,
        url: chosen.url,
        duration: chosen.timestamp,
        thumbnail: chosen.thumbnail,
        requester: interaction.user.toString(),
      };

      await queue.addTracks([track]);

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('✅ Added to Queue')
          .setDescription(`**[${track.title}](${track.url})**\n⏱ ${track.duration}`)
          .setThumbnail(track.thumbnail)],
        components: [],
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
