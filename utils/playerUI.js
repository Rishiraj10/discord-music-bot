const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { nowPlayingEmbed, queueEmbed } = require('./helpers');

const PREFIX = 'music';

function btn(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function buildPlayerRows(queue) {
  const g = queue.guildId;
  const pauseLabel = queue.paused ? '▶️ Resume' : '⏸️ Pause';
  const loopLabel = queue.loopMode === 'none' ? '🔁 Loop: Off'
    : queue.loopMode === 'track' ? '🔂 Loop: Track' : '🔁 Loop: Queue';

  return [
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_prev`, '⏮️ Previous'),
      btn(`${PREFIX}_${g}_pause`, pauseLabel, ButtonStyle.Primary),
      btn(`${PREFIX}_${g}_skip`, '⏭️ Skip'),
      btn(`${PREFIX}_${g}_stop`, '⏹️ Stop', ButtonStyle.Danger),
      btn(`${PREFIX}_${g}_shuffle`, '🔀 Shuffle'),
    ),
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_loop`, loopLabel),
      btn(`${PREFIX}_${g}_voldown`, '🔉 -10%'),
      btn(`${PREFIX}_${g}_volup`, '🔊 +10%'),
      btn(`${PREFIX}_${g}_queue`, '📋 Queue'),
      btn(`${PREFIX}_${g}_refresh`, '🔄 Refresh', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_clear`, '🧹 Clear Queue', ButtonStyle.Secondary),
      btn(`${PREFIX}_${g}_leave`, '👋 Leave VC', ButtonStyle.Danger),
      btn(`${PREFIX}_${g}_np`, '🎵 Now Playing', ButtonStyle.Success),
    ),
  ];
}

function buildQueueRows(queue) {
  const g = queue.guildId;
  const totalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));
  const page = Math.min(queue.queuePage, totalPages);

  return [
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_qprev`, '◀️ Prev Page', ButtonStyle.Secondary, page <= 1),
      btn(`${PREFIX}_${g}_qnext`, 'Next Page ▶️', ButtonStyle.Secondary, page >= totalPages),
      btn(`${PREFIX}_${g}_np`, '🔙 Back to Player', ButtonStyle.Primary),
      btn(`${PREFIX}_${g}_refresh`, '🔄 Refresh'),
    ),
  ];
}

function buildPlayerPayload(queue) {
  const track = queue.getCurrentTrack();
  if (queue.panelView === 'queue') {
    const totalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));
    return {
      embeds: [queueEmbed(queue, queue.queuePage)],
      components: buildQueueRows(queue),
      content: `📋 **Queue** — page ${queue.queuePage}/${totalPages} • Use buttons below`,
    };
  }

  if (!track) {
    return {
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎛️ Music Controls')
        .setDescription('Nothing playing. Use `/play` or `/search` to add music.')],
      components: buildPlayerRows(queue),
    };
  }

  return {
    embeds: [nowPlayingEmbed(track, queue)],
    components: buildPlayerRows(queue),
    content: null,
  };
}

async function updatePlayerPanel(queue) {
  const payload = buildPlayerPayload(queue);
  const channel = queue.textChannel;

  try {
    if (queue.panelMessage) {
      await queue.panelMessage.edit(payload);
      return queue.panelMessage;
    }
    queue.panelMessage = await channel.send(payload);
    return queue.panelMessage;
  } catch {
    try {
      queue.panelMessage = await channel.send(payload);
      return queue.panelMessage;
    } catch (e) {
      console.error('Panel update failed:', e.message);
      return null;
    }
  }
}

async function destroyPlayerPanel(queue) {
  if (!queue.panelMessage) return;
  try {
    await queue.panelMessage.edit({
      content: '⏹️ Playback ended.',
      embeds: [],
      components: [],
    });
  } catch {}
  queue.panelMessage = null;
}

function canControl(interaction, queue) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) return false;
  return channel.id === queue.voiceChannel.id;
}

async function handleMusicButton(interaction, client) {
  const parts = interaction.customId.split('_');
  if (parts[0] !== PREFIX || parts.length < 3) return false;

  const guildId = parts[1];
  const action = parts.slice(2).join('_');

  if (interaction.guildId !== guildId) return false;

  const queue = client.queues.get(guildId);
  if (!queue) {
    await interaction.reply({ content: '❌ No active music session.', ephemeral: true });
    return true;
  }

  if (!canControl(interaction, queue)) {
    await interaction.reply({
      content: '❌ Join the same voice channel as the bot to use controls.',
      ephemeral: true,
    });
    return true;
  }

  queue.panelMessage = interaction.message;

  try {
    switch (action) {
      case 'prev':
        await queue.previous();
        queue.panelView = 'player';
        break;
      case 'pause':
        if (queue.paused) await queue.resume();
        else await queue.pause();
        break;
      case 'skip':
        await queue.skip(1);
        queue.panelView = 'player';
        break;
      case 'stop':
        queue.tracks = [];
        await queue.destroy();
        client.queues.delete(guildId);
        await interaction.update({ content: '⏹️ Stopped and cleared queue.', embeds: [], components: [] });
        return true;
      case 'shuffle':
        await queue.shuffle();
        break;
      case 'loop': {
        const modes = ['none', 'track', 'queue'];
        const i = modes.indexOf(queue.loopMode);
        await queue.setLoopMode(modes[(i + 1) % modes.length]);
        break;
      }
      case 'voldown':
        await queue.setVolume(queue.volume - 10);
        break;
      case 'volup':
        await queue.setVolume(queue.volume + 10);
        break;
      case 'queue':
        queue.panelView = 'queue';
        queue.queuePage = 1;
        break;
      case 'qprev':
        queue.queuePage = Math.max(1, queue.queuePage - 1);
        break;
      case 'qnext': {
        const max = Math.max(1, Math.ceil(queue.tracks.length / 10));
        queue.queuePage = Math.min(max, queue.queuePage + 1);
        break;
      }
      case 'np':
        queue.panelView = 'player';
        break;
      case 'refresh':
        break;
      case 'clear':
        await queue.clear();
        break;
      case 'leave':
        await queue.destroy();
        client.queues.delete(guildId);
        await interaction.update({ content: '👋 Left voice channel.', embeds: [], components: [] });
        return true;
      default:
        break;
    }

    if (client.queues.has(guildId)) {
      await interaction.update(buildPlayerPayload(queue));
    }
  } catch (e) {
    console.error('Music button error:', e);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: `❌ ${e.message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    } catch {}
  }

  return true;
}

module.exports = {
  updatePlayerPanel,
  destroyPlayerPanel,
  handleMusicButton,
  buildPlayerPayload,
};
