const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { queueEmbed } = require('./helpers');

const PREFIX = 'music';
const PANEL_COLOR = 0x3b82f6;

function btn(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function formatDuration(d) {
  if (!d || d === '?:??' || d === 'Live') return 'Live';
  const parts = d.split(':').map(n => parseInt(n, 10));
  if (parts.length === 3 && !parts.some(isNaN)) {
    return `${parts[0]}h ${parts[1]}m`;
  }
  if (parts.length === 2 && !parts.some(isNaN)) {
    if (parts[0] >= 60) return `${Math.floor(parts[0] / 60)}h ${parts[0] % 60}m`;
    return `${parts[0]}m ${parts[1]}s`;
  }
  return d;
}

function parseAuthor(title) {
  if (!title) return 'Unknown';
  if (title.includes(' — ')) return title.split(' — ').pop().trim();
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) return parts[parts.length - 1].trim();
  }
  return 'YouTube';
}

function musicPanelEmbed(track, queue, client) {
  const icon = client?.user?.displayAvatarURL({ size: 64 });
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setAuthor({ name: 'MUSIC PANEL', iconURL: icon })
    .setDescription(`💿 \`${track.title}\``)
    .addFields(
      { name: '👤 Requested By', value: track.requester || 'Unknown', inline: true },
      { name: '⏱ Music Duration', value: formatDuration(track.duration), inline: true },
      { name: '🎤 Music Author', value: parseAuthor(track.title), inline: true },
    )
    .setThumbnail(track.thumbnail || null)
    .setFooter({
      text: `Vol ${queue.volume}% • ${queue.loopMode === 'none' ? 'Loop off' : queue.loopMode === 'track' ? 'Loop track' : 'Loop queue'} • ${queue.autoplay ? 'AutoPlay on' : 'AutoPlay off'} • ${queue.tracks.length} in queue`,
    });
  return embed;
}

function idlePanelEmbed(queue, client) {
  const icon = client?.user?.displayAvatarURL({ size: 64 });
  const mode = queue.stay247 ? '📡 24/7 — staying in voice channel' : 'Use `/join` for 24/7 mode';
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setAuthor({ name: 'MUSIC PANEL', iconURL: icon })
    .setDescription(`💿 \`No track playing\`\n\n${mode}\nUse \`/play\` or \`/search\` to start music.`)
    .addFields(
      { name: '👤 Requested By', value: '—', inline: true },
      { name: '⏱ Music Duration', value: '—', inline: true },
      { name: '🎤 Music Author', value: '—', inline: true },
    )
    .setFooter({ text: `Vol ${queue.volume}% • Queue empty` });
}

/** Layout matches reference: row1 Down Back Pause Skip | row2 Up | row3 Shuffle Loop Stop | row4 AutoPlay Playlist */
function buildPlayerRows(queue) {
  const g = queue.guildId;
  const pauseLabel = queue.paused ? '▶️ Pause' : '⏸️ Pause';
  const loopStyle = queue.loopMode !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary;
  const autoplayStyle = queue.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary;

  return [
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_down`, '🔉 Down'),
      btn(`${PREFIX}_${g}_back`, '⏮️ Back'),
      btn(`${PREFIX}_${g}_pause`, pauseLabel, ButtonStyle.Primary),
      btn(`${PREFIX}_${g}_skip`, '⏭️ Skip'),
    ),
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_up`, '🔊 Up'),
    ),
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_shuffle`, '🔀 Shuffle'),
      btn(`${PREFIX}_${g}_loop`, '🔁 Loop', loopStyle),
      btn(`${PREFIX}_${g}_stop`, '⏹️ Stop', ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_autoplay`, '🔂 AutoPlay', autoplayStyle),
      btn(`${PREFIX}_${g}_playlist`, '📋 Playlist'),
    ),
  ];
}

function buildQueueRows(queue) {
  const g = queue.guildId;
  const totalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));
  const page = Math.min(queue.queuePage, totalPages);

  return [
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}_${g}_qprev`, '◀️ Prev', ButtonStyle.Secondary, page <= 1),
      btn(`${PREFIX}_${g}_qnext`, 'Next ▶️', ButtonStyle.Secondary, page >= totalPages),
      btn(`${PREFIX}_${g}_panel`, '🎵 Music Panel', ButtonStyle.Primary),
    ),
  ];
}

function buildPlayerPayload(queue, client) {
  if (queue.panelView === 'queue') {
    const totalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));
    return {
      embeds: [queueEmbed(queue, queue.queuePage).setColor(PANEL_COLOR)],
      components: buildQueueRows(queue),
      content: null,
    };
  }

  const track = queue.getCurrentTrack();
  const embed = track
    ? musicPanelEmbed(track, queue, client)
    : idlePanelEmbed(queue, client);

  return {
    embeds: [embed],
    components: buildPlayerRows(queue),
    content: null,
  };
}

async function updatePlayerPanel(queue, client) {
  const c = client || queue.textChannel?.client;
  const payload = buildPlayerPayload(queue, c);
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
      content: '⏹️ Session ended.',
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
      case 'back':
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
      case 'down':
        queue.setVolume(queue.volume - 10);
        break;
      case 'up':
        queue.setVolume(queue.volume + 10);
        break;
      case 'shuffle':
        await queue.shuffle();
        break;
      case 'loop': {
        const modes = ['none', 'track', 'queue'];
        const i = modes.indexOf(queue.loopMode);
        queue.setLoopMode(modes[(i + 1) % modes.length]);
        break;
      }
      case 'stop':
        await queue.stopPlayback();
        queue.panelView = 'player';
        break;
      case 'autoplay':
        queue.autoplay = !queue.autoplay;
        break;
      case 'playlist':
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
      case 'panel':
        queue.panelView = 'player';
        break;
      // legacy ids
      case 'prev':
        await queue.previous();
        queue.panelView = 'player';
        break;
      case 'voldown':
        queue.setVolume(queue.volume - 10);
        break;
      case 'volup':
        queue.setVolume(queue.volume + 10);
        break;
      case 'queue':
      case 'np':
        queue.panelView = action === 'queue' ? 'queue' : 'player';
        if (action === 'queue') queue.queuePage = 1;
        break;
      default:
        break;
    }

    if (client.queues.has(guildId)) {
      await interaction.update(buildPlayerPayload(queue, client));
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
  musicPanelEmbed,
};
