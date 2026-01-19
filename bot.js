const { ReadableStream } = require('web-streams-polyfill');
global.ReadableStream = ReadableStream;

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ApplicationCommandOptionType, MessageFlags, StringSelectMenuBuilder } = require('discord.js');
const config = require('./config.json');
const fs = require('fs');
const redis = require('redis');

// Function to increment version automatically
function incrementVersion(currentVersion) {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3) return '1.0.0';
  
  let [major, minor, patch] = parts;
  
  if (patch < 9) {
    patch++;
  } else {
    patch = 0;
    if (minor < 9) {
      minor++;
    } else {
      minor = 0;
      major++;
    }
  }
  
  return `${major}.${minor}.${patch}`;
}

// Function to update version file
function updateVersionFile(category, newVersion) {
  try {
    const versionFile = require('./version.json');
    versionFile[category] = newVersion;
    versionFile.lastUpdated = new Date().toISOString();
    fs.writeFileSync('./version.json', JSON.stringify(versionFile, null, 2));
    return true;
  } catch (error) {
    console.error('Error updating version file:', error);
    return false;
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Redis client
const redisClient = redis.createClient({
  url: 'redis://default:GXpaeZBLEimkAjhcFwHsXfbyFbkpdMab@switchback.proxy.rlwy.net:39315'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// Error logging system
const ERROR_LOG_CHANNEL = '1462804742366298112';
const ERROR_CODES = {
  // Permission errors (01-05)
  'E01': 'You do not have permission to use this command',
  'E02': 'Only the auction host can perform this action',
  'E03': 'Only the trade host can perform this action',
  'E04': 'You cannot make offers on your own trade',
  'E05': 'Only administrators can use this command',
  
  // Trade errors (06-20)
  'E06': 'You cannot create a trade with more than 100 items',
  'E07': 'No trade found with that ID',
  'E08': 'Trade already accepted by another user',
  'E09': 'Invalid trade offer',
  'E10': 'Trade has expired',
  'E11': 'You must select at least one item',
  'E12': 'Maximum quantity exceeded for this item',
  'E13': 'Insufficient diamonds',
  'E14': 'Cannot add more items to this trade',
  'E15': 'Invalid offer amount',
  'E16': 'Maximum number of simultaneous trades reached',
  'E17': 'You must wait before creating another trade',
  'E18': 'Trade setup cancelled',
  'E19': 'Items list cannot exceed 100 items',
  'E20': 'Invalid diamonds amount',
  
  // Auction errors (21-35)
  'E21': 'No auction running in this channel',
  'E22': 'Auction has already started',
  'E23': 'Auction has expired',
  'E24': 'Bid must be higher than current bid',
  'E25': 'Invalid bid amount',
  'E26': 'Cannot bid on your own auction',
  'E27': 'Auction already has a winner',
  'E28': 'No bids placed on this auction',
  'E29': 'Cannot accept an offer without bids',
  'E30': 'Auction setup requires valid parameters',
  'E31': 'Auction already running in this channel',
  'E32': 'Invalid auction duration',
  'E33': 'Cannot end auction that is not running',
  'E34': 'Auction items list is empty',
  'E35': 'Auction cancelled by admin',
  
  // Inventory errors (36-50)
  'E36': 'Inventory not found',
  'E37': 'Item not found in inventory',
  'E38': 'Cannot remove item from inventory',
  'E39': 'Inventory is empty',
  'E40': 'Invalid inventory data',
  'E41': 'Cannot edit another user\'s inventory',
  'E42': 'Item quantity must be at least 1',
  'E43': 'Maximum items reached (100)',
  'E44': 'Inventory update failed',
  'E45': 'Cannot transfer items',
  'E46': 'Invalid Roblox username',
  'E47': 'Failed to fetch Roblox profile',
  'E48': 'Inventory save failed',
  'E49': 'Duplicate item in inventory',
  'E50': 'Inventory size exceeds limit',
  
  // Giveaway errors (51-65)
  'E51': 'No giveaway found',
  'E52': 'Giveaway has expired',
  'E53': 'You already entered this giveaway',
  'E54': 'Giveaway setup requires valid parameters',
  'E55': 'Cannot end giveaway that hasn\'t started',
  'E56': 'No entries in this giveaway',
  'E57': 'Giveaway already ended',
  'E58': 'Invalid giveaway configuration',
  'E59': 'Cannot join your own giveaway',
  'E60': 'Giveaway item limit exceeded',
  'E61': 'You lack permission to create giveaways',
  'E62': 'Maximum giveaways reached',
  'E63': 'Invalid giveaway duration',
  'E64': 'Giveaway cancelled',
  'E65': 'Failed to select winner',
  
  // System errors (66-80)
  'E66': 'Failed to save data to Redis',
  'E67': 'Failed to load data from Redis',
  'E68': 'Database connection error',
  'E69': 'Invalid command parameters',
  'E70': 'An unexpected error occurred. Please try again later',
  'E71': 'Message not found',
  'E72': 'Channel not found',
  'E73': 'User not found',
  'E74': 'Operation timed out',
  'E75': 'Rate limit exceeded - try again in a moment',
  'E76': 'Command execution failed',
  'E77': 'Missing required permissions',
  'E78': 'Invalid user input',
  'E79': 'Discord API error',
  'E80': 'Bot status check failed'
};

// Function to log errors to Discord channel with detailed embed
async function logError(interaction, errorCode, errorMessage, context = {}) {
  try {
    const channel = await client.channels.fetch(ERROR_LOG_CHANNEL).catch(() => null);
    if (!channel) return;
    
    // Determine embed color based on error code
    let embedColor = '#FF0000'; // Red by default
    const code = parseInt(errorCode.replace('E', ''));
    if (code <= 5) embedColor = '#FF6B6B'; // Permission errors - lighter red
    else if (code <= 20) embedColor = '#FF8C00'; // Trade errors - orange
    else if (code <= 35) embedColor = '#FFD700'; // Auction errors - gold
    else if (code <= 50) embedColor = '#00CED1'; // Inventory errors - cyan
    else if (code <= 65) embedColor = '#FF69B4'; // Giveaway errors - pink
    else embedColor = '#696969'; // System errors - dark gray
    
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle('⚠️ Error Report') //embed thumbnail
      .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917')
      .addFields(
        { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Error Code', value: `\`${errorCode}\``, inline: true },
        { name: 'Category', value: getCategoryFromErrorCode(errorCode), inline: true },
        { name: 'Description', value: ERROR_CODES[errorCode] || 'Unknown error', inline: false },
        { name: 'Message', value: errorMessage || 'No additional info', inline: false },
        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      );
    
    if (context.commandName) embed.addFields({ name: '📋 Command', value: `\`/${context.commandName}\``, inline: true });
    if (context.channelId) embed.addFields({ name: '💬 Channel', value: `<#${context.channelId}>`, inline: true });
    if (context.guildId) embed.addFields({ name: '🏢 Guild', value: `${context.guildId}`, inline: true });
    if (Object.keys(context).length > 0 && !context.commandName && !context.channelId && !context.guildId) {
      const contextStr = JSON.stringify(context).substring(0, 1024);
      embed.addFields({ name: '📝 Context', value: contextStr, inline: false });
    }
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to log error to Discord:', error);
  }
}

// Helper function to get category from error code
function getCategoryFromErrorCode(errorCode) {
  const code = parseInt(errorCode.replace('E', ''));
  if (code <= 5) return '🔒 Permission';
  else if (code <= 20) return '🔄 Trade';
  else if (code <= 35) return '🎪 Auction';
  else if (code <= 50) return '📦 Inventory';
  else if (code <= 65) return '🎁 Giveaway';
  else return '⚙️ System';
}

// Function to send user-friendly error message with full logging
async function sendErrorReply(interaction, errorCode, customMessage = null) {
  const message = customMessage || ERROR_CODES[errorCode] || 'An error occurred';
  const formattedMessage = `**${message}** | Error (\`${errorCode}\`)`;
  
  try {
    if (interaction.deferred) {
      await interaction.editReply({ content: `⚠️ ${formattedMessage}`, flags: MessageFlags.Ephemeral });
    } else if (interaction.replied) {
      await interaction.followUp({ content: `⚠️ ${formattedMessage}`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `⚠️ ${formattedMessage}`, flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('Failed to send error reply:', error);
  }
  
  // Log error to Discord channel with context
  await logError(interaction, errorCode, formattedMessage, {
    commandName: interaction.commandName || 'unknown',
    channelId: interaction.channelId,
    guildId: interaction.guildId
  });
}

let redirectChannelId = config.defaultAuctionChannelId || null;
let redirectTradeChannelId = config.defaultTradeChannelId || null;
let redirectInventoryChannelId = null;
let redirectGiveawayChannelId = '1462190801198252226';

const auctions = new Map(); // channelId -> { host, title, description, model, time, startingPrice, bids: [{user, diamonds, items}], timer, started, channelId, messageId, updateInterval }
const finishedAuctions = new Map(); // messageId -> { host, title, winner, diamonds, items, channelId, auctionMessageId }
const finishedGiveaways = new Map(); // messageId -> { host, winner, items, channelId }
const trades = new Map(); // messageId -> { host, hostDiamonds, hostItems, offers: [{user, diamonds, items, timestamp}], channelId, messageId, accepted: false, acceptedUser: null }
const inventories = new Map(); // userId -> { messageId, channelId, items, diamonds, lookingFor, robloxUsername, lastEdited }
const userTradeCount = new Map(); // userId -> count of active trades
const userGiveawayCount = new Map(); // userId -> count of active giveaways
const giveaways = new Map(); // messageId -> { host, items: [{name, quantity}], channelId, messageId, entries: [{user, items}], duration, expiresAt }

// Item categories for trades
const itemCategories = {
  huges: {
    'Black Hole Huges': ['HugeBlackHoleAngelus', 'HugeRainbowBlackHoleAngelus'],
    'Snow Globe Huges': ['HugeSnowGlobeHamster', 'HugeRainbowSnowGlobeHamster', 'HugeSnowGlobeCat', 'HugeRainbowSnowGlobeCat'],
    'Ice Cube Huges': ['HugeIceCubeGingerbreadCorgi', 'HugeRainbowIceCubeGingerbreadCorgi', 'HugeIceCubeCookieCutCat', 'HugeRainbowIceCubeCookieCutCat'],
    'Jelly Huges': ['HugeJellyDragon', 'HugeRainbowJellyDragon', 'HugeJellyKitsune', 'HugeRainbowJellyKitsune'],
    'Blazing Huges': ['HugeBlazingShark', 'HugeRainbowBlazingShark', 'HugeBlazingBat', 'HugeRainbowBlazingBat'],
    'Unicorn Huges': ['HugeElectricUnicorn', 'HugeRainbowElectricUnicorn'],
    'Event Huges': ['HugePartyCat', 'HugeGoldenPartyCat', 'HugeRainbowPartyCat', 'HugePartyDragon', 'HugeGoldenPartyDragon', 'HugeRainbowPartyDragon', 'HugeHellRock', 'HugeGoldenHellRock', 'HugeRainbowHellRock'],
    'Christmas.1 Huges': ['HugePresentChestMimic', 'HugeRainbowPresentChestMimic', 'HugeGingerbreadAngelus', 'HugeGoldenGingerbreadAngelus', 'HugeRainbowGingerbreadAngelus', 'HugeNorthPoleWolf', 'HugeGoldenNorthPoleWolf', 'HugeRainbowNorthPoleWolf'],
    'Christmas.2 Huges': ['HugeIcyPhoenix', 'HugeGoldenIcyPhoenix', 'HugeRainbowIcyPhoenix'],
    'Map Huges': ['HugeChestMimic', 'HugeGoldenChestMimic', 'HugeRainbowChestMimic', 'HugeSorcererCat', 'HugeGoldenSorcererCat', 'HugeRainbowSorcererCat', 'HugeDominusAzureus', 'HugeGoldenDominusAzureus', 'HugeRainbowDominusAzureus','HugePropellerCat', 'HugeGoldenPropellerCat', 'HugeRainbowPropellerCat', 'HugePropellerDog', 'HugeGoldenPropellerDog', 'HugeRainbowPropellerDog', 'HugeNinjaCat', 'HugeGoldenNinjaCat', 'HugeRainbowNinjaCat', 'HugeFantasyChestMimic', 'HugeGoldenFantasyChestMimic', 'HugeStormAgony', 'HugeGoldenStormAgony', 'HugeRainbowStormAgony']
  },
  exclusives: ['BlazingShark', 'BlazingGoldenShark', 'BlazingRainbowShark', 'BlazingBat', 'BlazingGoldenBat', 'BlazingRainbowBat', 'BlazingCorgi', 'BlazingGoldenCorgi', 'BlazingRainbowCorgi', 'IceCubeGingerbreadCat', 'IceCubeGoldenGingerbreadCat', 'IceCubeRainbowGingerbreadCat', 'IceCubeGingerbreadCorgi', 'IceCubeGoldenGingerbreadCorgi', 'IceCubeRainbowGingerbreadCorgi', 'IceCubeCookieCuteCat', 'IceCubeGoldenCookieCuteCat', 'IceCubeRainbowCookieCuteCat', 'SnowGlobeCat', 'SnowGlobeGoldenCat', 'SnowGlobeRainbowCat', 'SnowGlobeAxolotl', 'SnowGlobeGoldenAxolotl', 'SnowGlobeRainbowAxolotl', 'SnowGlobeHamster', 'SnowGlobeGoldenHamster', 'SnowGlobeRainbowHamster', 'JellyCat', 'JellyGoldenCat', 'JellyRainbowCat', 'JellyBunny', 'JellyGoldenBunny', 'JellyRainbowBunny', 'JellyCorgi', 'JellyGoldenCorgi', 'JellyRainbowCorgi', 'BlackHoleAxolotl', 'BlackHoleGoldenAxolotl', 'BlackHoleRainbowAxolotl', 'BlackHoleImmortuus', 'BlackHoleGoldenImmortuus', 'BlackHoleRainbowImmortuus', 'BlackHoleKitsune', 'BlackHoleGoldenKitsune', 'BlackHoleRainbowKitsune', 'MajesticUnicorn', 'StuntUnicorn', 'AnimeUnicorn'],
  eggs: ['HypeEgg', 'BlazingEgg', 'IceCubeEgg', 'SnowGlobeEgg', 'JellyEgg', 'BlackHoleEgg', 'UnicornEgg'],
  gifts: ['LikeGoalLootbox', '2026LootBox', 'CastleLootbox']
};

// Giveaway item categories (for /setupgiveaway)
const giveawayItemCategories = {
  diamonds: [],
  huges: {
    'Black Hole Huges': ['HugeBlackHoleAngelus', 'HugeRainbowBlackHoleAngelus'],
    'Snow Globe Huges': ['HugeSnowGlobeHamster', 'HugeRainbowSnowGlobeHamster', 'HugeSnowGlobeCat', 'HugeRainbowSnowGlobeCat'],
    'Ice Cube Huges': ['HugeIceCubeGingerbreadCorgi', 'HugeRainbowIceCubeGingerbreadCorgi', 'HugeIceCubeCookieCutCat', 'HugeRainbowIceCubeCookieCutCat'],
    'Jelly Huges': ['HugeJellyDragon', 'HugeRainbowJellyDragon', 'HugeJellyKitsune', 'HugeRainbowJellyKitsune'],
    'Blazing Huges': ['HugeBlazingShark', 'HugeRainbowBlazingShark', 'HugeBlazingBat', 'HugeRainbowBlazingBat'],
    'Unicorn Huges': ['HugeElectricUnicorn', 'HugeRainbowElectricUnicorn'],
    'Event Huges': ['HugePartyCat', 'HugeGoldenPartyCat', 'HugeRainbowPartyCat', 'HugePartyDragon', 'HugeGoldenPartyDragon', 'HugeRainbowPartyDragon', 'HugeHellRock', 'HugeGoldenHellRock', 'HugeRainbowHellRock'],
    'Christmas.1 Huges': ['HugePresentChestMimic', 'HugeRainbowPresentChestMimic', 'HugeGingerbreadAngelus', 'HugeGoldenGingerbreadAngelus', 'HugeRainbowGingerbreadAngelus', 'HugeNorthPoleWolf', 'HugeGoldenNorthPoleWolf', 'HugeRainbowNorthPoleWolf'],
    'Christmas.2 Huges': ['HugeIcyPhoenix', 'HugeGoldenIcyPhoenix', 'HugeRainbowIcyPhoenix'],
    'Map Huges': ['HugeChestMimic', 'HugeGoldenChestMimic', 'HugeRainbowChestMimic', 'HugeSorcererCat', 'HugeGoldenSorcererCat', 'HugeRainbowSorcererCat', 'HugeDominusAzureus', 'HugeGoldenDominusAzureus', 'HugeRainbowDominusAzureus','HugePropellerCat', 'HugeGoldenPropellerCat', 'HugeRainbowPropellerCat', 'HugePropellerDog', 'HugeGoldenPropellerDog', 'HugeRainbowPropellerDog', 'HugeNinjaCat', 'HugeGoldenNinjaCat', 'HugeRainbowNinjaCat', 'HugeFantasyChestMimic', 'HugeGoldenFantasyChestMimic', 'HugeStormAgony', 'HugeGoldenStormAgony', 'HugeRainbowStormAgony']
  },
  exclusives: ['BlazingShark', 'BlazingGoldenShark', 'BlazingRainbowShark', 'BlazingBat', 'BlazingGoldenBat', 'BlazingRainbowBat', 'BlazingCorgi', 'BlazingGoldenCorgi', 'BlazingRainbowCorgi', 'IceCubeGingerbreadCat', 'IceCubeGoldenGingerbreadCat', 'IceCubeRainbowGingerbreadCat', 'IceCubeGingerbreadCorgi', 'IceCubeGoldenGingerbreadCorgi', 'IceCubeRainbowGingerbreadCorgi', 'IceCubeCookieCuteCat', 'IceCubeGoldenCookieCuteCat', 'IceCubeRainbowCookieCuteCat', 'SnowGlobeCat', 'SnowGlobeGoldenCat', 'SnowGlobeRainbowCat', 'SnowGlobeAxolotl', 'SnowGlobeGoldenAxolotl', 'SnowGlobeRainbowAxolotl', 'SnowGlobeHamster', 'SnowGlobeGoldenHamster', 'SnowGlobeRainbowHamster', 'JellyCat', 'JellyGoldenCat', 'JellyRainbowCat', 'JellyBunny', 'JellyGoldenBunny', 'JellyRainbowBunny', 'JellyCorgi', 'JellyGoldenCorgi', 'JellyRainbowCorgi', 'BlackHoleAxolotl', 'BlackHoleGoldenAxolotl', 'BlackHoleRainbowAxolotl', 'BlackHoleImmortuus', 'BlackHoleGoldenImmortuus', 'BlackHoleRainbowImmortuus', 'BlackHoleKitsune', 'BlackHoleGoldenKitsune', 'BlackHoleRainbowKitsune', 'MajesticUnicorn', 'StuntUnicorn', 'AnimeUnicorn'],
  eggs: ['HypeEgg', 'BlazingEgg', 'IceCubeEgg', 'SnowGlobeEgg', 'JellyEgg', 'BlackHoleEgg', 'UnicornEgg'],
  gifts: ['LikeGoalLootbox', '2026LootBox', 'CastleLootbox']
};

// Item emojis mapping - customize with your server emojis
const itemEmojis = {
  //Huges
  'HugeBlackHoleAngelus': '<:HugeBlackHoleAngelus:1462562528440615114>',
  'HugeRainbowBlackHoleAngelus': '<:HugeBlackHoleAngelus:1462579047421841460>',
  'HugeSnowGlobeHamster': '<:HugeSnowGlobeHamster:1462562491753038110>',
  'HugeRainbowSnowGlobeHamster': '<:HugeRainbowSnowGlobeHamster:1462579018422292637>',
  'HugeSnowGlobeCat': '<:HugeSnowGlobeCat:1462562512405921884>',
  'HugeRainbowSnowGlobeCat': '<:HugeRainbowSnowGlobeCat:1462579034708902104>',
  'HugeIceCubeGingerbreadCorgi': '<:HugeIceCubeGingerbreadCorgi:1462562531741794629>',
  'HugeRainbowIceCubeGingerbreadCorgi': '<:HugeRainbowIceCubeGingerbreadCor:1462579051117150421>',
  'HugeIceCubeCookieCutCat': '<:HugeIceCubeCookieCutCat:1462562497755086880>',
  'HugeRainbowIceCubeCookieCutCat': '<:HugeRainbowIceCubeCookieCat:1462579024957280442>',
  'HugeJellyDragon': '<:HugeJellyDragon:1462562533406670869>',
  'HugeRainbowJellyDragon': '<:HugeRainbowJellyDragon:1462579052488687893>',
  'HugeJellyKitsune': '<:HugeJellyKitsune:1462562518911156346>',
  'HugeRainbowJellyKitsune': '<:HugeRainbowJellyKitsune:1462579039750586585>',
  'HugeBlazingShark': '<:HugeBlazingShark:1462562515753111583>',
  'HugeRainbowBlazingShark': '<:HugeRainbowBlazingShark:1462579037950967942>',
  'HugeBlazingBat': '<:HugeBlazingBat:1462562523302727777>',
  'HugeRainbowBlazingBat': '<:HugeRainbowBlazingBat:1462579043990769705>',
  'HugePartyCat': '<:HugePartyCat:1462562489957879939>',
  'HugeGoldenPartyCat': '<:HugeGoldenPartyCat:1462562103993958643>',
  'HugeRainbowPartyCat': '<:HugeRainbowPartyCat:1462582059863117844>',
  'HugePartyDragon': '<:HugePartyDragon:1462562495871975487>',
  'HugeGoldenPartyDragon': '<:HugeGoldenPartyDragon:1462562493745332427>',
  'HugeRainbowPartyDragon': '<:HugeRainbowPartyDragon:1462579022327451731>',
  'HugeHellRock': '<:HugeHellRock:1462562487923642389>',
  'HugeGoldenHellRock': '<:HugeGoldenHellRock:1462562520429625649>',
  'HugeRainbowHellRock': '<:HugeRainbowHellRock:1462579020079300751>',
  'HugeNinjaCat': '<:HugeNinjaCat:1462562521784385618>',
  'HugeGoldenNinjaCat': '<:HugeGoldenNinjaCat:1462562517334360229>',
  'HugeRainbowNinjaCat': '<:HugeRainbowNinjaCat:1462579041734361130>',
  'HugePresentChestMimic': '<:HugePresentChestMimic:1462562510468157636>',
  'HugeRainbowPresentChestMimic': '<:HugeRainbowPresentChestMimic:1462579032984912025>',
  'HugeGingerbreadAngelus': '<:HugeGingerbreadAngelus:1462562501156667553>',
  'HugeGoldenGingerbreadAngelus': '<:HugeGoldenGingerbreadAngelus:1462562499739254946>',
  'HugeRainbowGingerbreadAngelus': '<:HugeRainbowGingerbreadAngelus:1462579026458837014>',
  'HugeNorthPoleWolf': '<:HugeNorthPoleWolf:1462562502767411312>',
  'HugeGoldenNorthPoleWolf': '<:HugeGoldenNorthPoleWolf:1462562504315244829>',
  'HugeRainbowNorthPoleWolf': '<:HugeRainbowNorthPoleWolf:1462579029025493084>',
  'HugeIcyPhoenix': '<:HugeIcyPhoenix:1462562507599118530>',
  'HugeGoldenIcyPhoenix': '<:HugeGoldenIcyPhoenix:1462562506106081312>',
  'HugeRainbowIcyPhoenix': '<:HugeRainbowIcyPhoenix:1462579031047409810>',
  'HugeChestMimic': '<:HugeChestMimic:1462562530265399469>',
  'HugeGoldenChestMimic': '<:HugeGoldenChestMimic:1462562105617285233>',
  'HugeRainbowChestMimic': '<:HugeRainbowChestMimic:1462579049149759649>',
  'HugeSorcererCat': '<:HugeSorcererCat:1462562514150883432>',
  'HugeGoldenSorcererCat': '<:HugeGoldenSorcererCat:1462562107307589652>',
  'HugeRainbowSorcererCat': '<:HugeRainbowSorcererCat:1462579036562784256>',
  'HugePropellerCat': '<:HugePropellerCat:1462562526704177328>',
  'HugeGoldenPropellerCat': '<:HugeGoldenPropellerCat:1462562094305247316>',
  'HugeRainbowPropellerCat': '<:HugeRainbowPropellerCat:1462579226975670405>',
  'HugePropellerDog': '<:HugePropellerDog:1462562122428055594>',
  'HugeGoldenPropellerDog': '<:HugeGoldenPropellerDog:1462562124239994890>',
  'HugeRainbowPropellerDog': '<:HugeRainbowPropellerDog:1462579055986737346>',
  'HugeDominusAzureus': '<:HugeDominusAzureus:1462562525382967420>',
  'HugeGoldenDominusAzureus': '<:HugeGoldenDominusAzureus:1462562109702279218>',
  'HugeRainbowDominusAzureus': '<:HugeRainbowDominusAzureus:1462579045844914289>',
  'HugeFantasyChestMimic': '<:HugeFantasyChestMimic:1462562120842477748>',
  'HugeGoldenFantasyChestMimic': '<:HugeGoldenFantasyChestMimic:1462562119483527209>',
  'HugeRainbowFantasyChestMimic': '<:HugeRainbowFantasyChestMimic:1462579054115946609>',

  'HugeStormAgony': '<:HugeStormAgony:1462561984598769865>',
  'HugeGoldenStormAgony': '<:HugeGoldenStormAgony:1462561986511372378>',
  'HugeRainbowStormAgony': '<:HugeRainbowStormAgony:1462579059329466610>',
  'HugeElectricUnicorn': '<:HugeElectricUnicorn:1462561982904537199>',
  'HugeRainbowElectricUnicorn': '<:HugeRainbowElectricUnicorn:1462579057353822314>',

  // Exclusives
  'BlazingShark': '<:BlazingShark:1462562761018970122>',
  'BlazingBat': '<:BlazingBat:1462562765741752524>',
  'BlazingCorgi': '<:BlazingCorgi:1462562763909107906>',
  'IceCubeGingerbreadCat': '<:IceCubeGingerbreadCat:1462562784851005525>',
  'IceCubeCookieCuteCat': '<:IceCubeCookieCuteCat:1462562786755215555>',
  'IceCubeGingerbreadCorgi': '<:IceCubeGingerbreadCorgi:1462562783655759882>',
  'SnowGlobeCat': '<:SnowGlobeCat:1462562782305189970>',
  'SnowGlobeAxolotl': '<:SnowGlobeAxolotl:1462562767126139055>',
  'SnowGlobeHamster': '<:SnowGlobeHamster:1462562769223024742>',
  'JellyCat': '<:JellyCat:1462562780535066655>',
  'JellyBunny': '<:JellyBunny:1462562778224001215>',
  'JellyCorgi': '<:JellyCorgi:1462562771135758480>',
  'BlackHoleAxolotl': '<:BlackHoleAxolotl:1462562758338941092>',
  'BlackHoleImmortuus': '<:BlackHoleImmortuus:1462562756728193298>',
  'BlackHoleKitsune': '<:BlackHoleKitsune:1462562755050733648>',
  'MajesticUnicorn': '<:MajesticUnicorn:1462579522238025868>',
  'StuntUnicorn': '<:StuntUnicorn:1462579525090279514>',
  'AnimeUnicorn': '<:AnimeUnicorn:1462579526801555456>',

  // Eggs
  'HypeEgg': '<:HypeEgg:1462562750076157952>',
  'BlazingEgg': '<:BlazingEgg:1462562117097099385>',
  'IceCubeEgg': '<:IceCubeEgg:1462562536762380482>',
  'SnowGlobeEgg': '<:SnowGlobeEgg:1462562538792161300>',
  'JellyEgg': '<:JellyEgg:1462562751963463772>',
  'BlackHoleEgg': '<:BlackHoleEgg:1462562753431736474>',
  'UnicornEgg': '<:UnicornEgg:1462563572180713585>',

  // Gifts
  'LikeGoalLootbox': '<:LikeGoalLootbox:1462562535105495213>',
  '2026LootBox': '<:2026LootBox:1462562111711350865>',
  'CastleLootbox': '<:CastleLootbox:1462562114878046361>',
};

// Helper functions
function getItemEmoji(itemName) {
  return itemEmojis[itemName] || undefined;
}

function formatItemName(itemName) {
  // Convert "HugeBlackHoleAngelus" to "Huge Black Hole Angelus"
  return itemName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Insert space between lowercase and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // Insert space between multiple capitals
    .trim();
}

function formatItemsText(items) {
  // Format items with emoji and name
  if (!items || items.length === 0) return 'None';
  
  const text = items.map(item => {
    if (typeof item === 'object') {
      // Special handling for Diamonds - use formatBid for abbreviations
      if (item.name === '💎 Diamonds') {
        const abbreviatedValue = formatBid(item.quantity);
        return `💎 **Diamonds** (**${abbreviatedValue} 💎**)`;
      }
      
      const emoji = getItemEmoji(item.name) || '';
      const formattedName = formatItemName(item.name);
      return `${emoji} **${formattedName}** (**x${item.quantity}**)`;
    } else {
      const emoji = getItemEmoji(item) || '';
      const formattedName = formatItemName(item);
      return `${emoji} **${formattedName}**`;
    }
  }).join('\n');

  // Truncate if too long for Discord embed field (4096 limit)
  if (text.length > 4000) {
    return text.substring(0, 4000) + '...';
  }
  return text;
}

// Helper function to format items list with emoji and abbreviations
function formatItemsList(items) {
  if (!items || items.length === 0) return 'None';
  
  return items.map(item => {
    // Special handling for Diamonds - use formatBid for abbreviations
    if (item.name === '💎 Diamonds') {
      const abbreviatedValue = formatBid(item.quantity);
      return `💎 **Diamonds** (${abbreviatedValue} 💎)`;
    }
    
    const emoji = getItemEmoji(item.name) || '';
    const formattedName = formatItemName(item.name);
    return `${emoji} **${formattedName}** (x${item.quantity})`;
  }).join('\n');
}

// Save data every 5 minutes and reload without losing active embeds
setInterval(async () => {
  await saveAndReloadData();
}, 5 * 60 * 1000);

async function saveAndReloadData() {
  try {
    console.log('Starting auto save and reload...');
    
    // First, save current data
    await saveData();
    
    // Store current active data before loading
    const currentTrades = new Map(trades);
    const currentAuctions = new Map(auctions);
    const currentGiveaways = new Map(giveaways);
    const currentInventories = new Map(inventories);
    const currentUserTradeCount = new Map(userTradeCount);
    const currentUserGiveawayCount = new Map(userGiveawayCount);
    const currentFinishedAuctions = new Map(finishedAuctions);
    const currentFinishedGiveaways = new Map(finishedGiveaways);
    
    // Load data from Redis
    await loadData();
    
    // Merge data - keep current active data, only add missing data
    // For trades, auctions, giveaways - keep current active ones, add any missing from Redis
    for (const [key, value] of currentTrades) {
      if (!trades.has(key)) {
        trades.set(key, value);
      }
    }
    
    for (const [key, value] of currentAuctions) {
      if (!auctions.has(key)) {
        auctions.set(key, value);
      }
    }
    
    for (const [key, value] of currentGiveaways) {
      if (!giveaways.has(key)) {
        giveaways.set(key, value);
      }
    }
    
    // For inventories, user counts, and finished items - merge both ways
    for (const [key, value] of currentInventories) {
      if (!inventories.has(key)) {
        inventories.set(key, value);
      }
    }
    
    for (const [key, value] of currentUserTradeCount) {
      if (!userTradeCount.has(key)) {
        userTradeCount.set(key, value);
      }
    }
    
    for (const [key, value] of currentUserGiveawayCount) {
      if (!userGiveawayCount.has(key)) {
        userGiveawayCount.set(key, value);
      }
    }
    
    for (const [key, value] of currentFinishedAuctions) {
      if (!finishedAuctions.has(key)) {
        finishedAuctions.set(key, value);
      }
    }
    
    for (const [key, value] of currentFinishedGiveaways) {
      if (!finishedGiveaways.has(key)) {
        finishedGiveaways.set(key, value);
      }
    }
    
    console.log('Auto save and reload completed successfully - active embeds preserved');
    
  } catch (error) {
    console.error('Error in auto save and reload:', error);
  }
}

async function saveData() {
  try {
    // Save inventories
    const inventoriesData = JSON.stringify(Array.from(inventories.entries()));
    redisClient.set('INVENTORYSAVES', inventoriesData);

    // Save trades
    const tradesData = JSON.stringify(Array.from(trades.entries()));
    redisClient.set('TRADESAVES', tradesData);

    // Save giveaways
    const giveawaysData = JSON.stringify(Array.from(giveaways.entries()));
    redisClient.set('GIVEAWAYSAVES', giveawaysData);

    // Save auctions
    const auctionsData = JSON.stringify(Array.from(auctions.entries()));
    redisClient.set('AUCTIONSAVES', auctionsData);

    // Save finished auctions
    const finishedAuctionsData = JSON.stringify(Array.from(finishedAuctions.entries()));
    redisClient.set('FINISHEDAUCTIONSAVES', finishedAuctionsData);

    // Save finished giveaways
    const finishedGiveawaysData = JSON.stringify(Array.from(finishedGiveaways.entries()));
    redisClient.set('FINISHEDGIVEAWAYSAVES', finishedGiveawaysData);

    // Save user counts
    const userTradeCountData = JSON.stringify(Array.from(userTradeCount.entries()));
    redisClient.set('USERTRADECOUNTSAVES', userTradeCountData);

    const userGiveawayCountData = JSON.stringify(Array.from(userGiveawayCount.entries()));
    redisClient.set('USERGIVEAWAYCOUNTSAVES', userGiveawayCountData);

    // Save redirects
    const redirectsData = JSON.stringify({
      redirectChannelId,
      redirectTradeChannelId,
      redirectInventoryChannelId,
      redirectGiveawayChannelId
    });
    redisClient.set('REDIRECTSAVES', redirectsData);

    console.log('Data saved to Redis successfully');

    // Send detailed save report to admin channel
    try {
      const adminChannelId = '1461719381619904524';
      const channel = client.channels.cache.get(adminChannelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle('💾 Save System - Report')
          .setColor('#00FF00')
          .setTimestamp()
          .setDescription('**Data successfully saved to Railway Redis**')
          .addFields(
            { name: '📦 Inventories', value: `${inventories.size} inventories saved`, inline: true },
            { name: '🔄 Trades', value: `${trades.size} active trades saved`, inline: true },
            { name: '🎉 Giveaways', value: `${giveaways.size} active giveaways saved`, inline: true },
            { name: '🏆 Auctions', value: `${auctions.size} active auctions saved`, inline: true },
            { name: '✅ Finished Auctions', value: `${finishedAuctions.size} finished auctions saved`, inline: true },
            { name: '🎁 Finished Giveaways', value: `${finishedGiveaways.size} finished giveaways saved`, inline: true },
            { name: '👥 Trade Counters', value: `${userTradeCount.size} users with trade counters`, inline: true },
            { name: '🎊 Giveaway Counters', value: `${userGiveawayCount.size} users with giveaway counters`, inline: true },
            { name: '🔧 Settings', value: `Redirects saved`, inline: true }
          )
          .setFooter({ text: 'Next automatic save in 5 minutes' });

        await channel.send({ embeds: [embed] });
      }
    } catch (embedError) {
      console.error('Error sending save report embed:', embedError);
    }
  } catch (error) {
    console.error('Error saving data to Redis:', error);
  }
}

async function loadData() {
  try {
    // Load inventories
    const inventoriesData = await redisClient.get('INVENTORYSAVES');
    if (inventoriesData) {
      const parsed = JSON.parse(inventoriesData);
      parsed.forEach(([key, value]) => {
        inventories.set(key, value);
      });
    }

    // Load trades
    const tradesData = await redisClient.get('TRADESAVES');
    if (tradesData) {
      const parsed = JSON.parse(tradesData);
      parsed.forEach(([key, value]) => {
        trades.set(key, value);
      });
    }

    // Load giveaways
    const giveawaysData = await redisClient.get('GIVEAWAYSAVES');
    if (giveawaysData) {
      const parsed = JSON.parse(giveawaysData);
      parsed.forEach(([key, value]) => {
        giveaways.set(key, value);
      });
    }

    // Load auctions
    const auctionsData = await redisClient.get('AUCTIONSAVES');
    if (auctionsData) {
      const parsed = JSON.parse(auctionsData);
      parsed.forEach(([key, value]) => {
        auctions.set(key, value);
      });
    }

    // Load finished auctions
    const finishedAuctionsData = await redisClient.get('FINISHEDAUCTIONSAVES');
    if (finishedAuctionsData) {
      const parsed = JSON.parse(finishedAuctionsData);
      parsed.forEach(([key, value]) => {
        finishedAuctions.set(key, value);
      });
    }

    // Load finished giveaways
    const finishedGiveawaysData = await redisClient.get('FINISHEDGIVEAWAYSAVES');
    if (finishedGiveawaysData) {
      const parsed = JSON.parse(finishedGiveawaysData);
      parsed.forEach(([key, value]) => {
        finishedGiveaways.set(key, value);
      });
    }

    // Load user counts
    const userTradeCountData = await redisClient.get('USERTRADECOUNTSAVES');
    if (userTradeCountData) {
      const parsed = JSON.parse(userTradeCountData);
      parsed.forEach(([key, value]) => {
        userTradeCount.set(key, value);
      });
    }

    const userGiveawayCountData = await redisClient.get('USERGIVEAWAYCOUNTSAVES');
    if (userGiveawayCountData) {
      const parsed = JSON.parse(userGiveawayCountData);
      parsed.forEach(([key, value]) => {
        userGiveawayCount.set(key, value);
      });
    }

    // Load redirects
    const redirectsData = await redisClient.get('REDIRECTSAVES');
    if (redirectsData) {
      const parsed = JSON.parse(redirectsData);
      if (parsed.redirectChannelId) redirectChannelId = parsed.redirectChannelId;
      if (parsed.redirectTradeChannelId) redirectTradeChannelId = parsed.redirectTradeChannelId;
      if (parsed.redirectInventoryChannelId) redirectInventoryChannelId = parsed.redirectInventoryChannelId;
      if (parsed.redirectGiveawayChannelId) redirectGiveawayChannelId = parsed.redirectGiveawayChannelId;
    }

    console.log('Data loaded from Redis successfully');
  } catch (e) {
    console.error('Error loading data from Redis:', e);
  }
}

client.once('clientReady', async () => {
  console.log('Auction Bot is ready!');
  await loadData();

  // Register slash commands
  const commands = [
    {
      name: 'setupauction',
      description: 'Show auction setup information'
    },
    {
      name: 'update',
      description: 'Update auction, trade, and inventory embeds'
    },
    {
      name: 'bid',
      description: 'Place a bid'
    },
    {
      name: 'endauction',
      description: 'End the current auction (host only)'
    },
    {
      name: 'auctionstatus',
      description: 'View current auction status'
    },
    {
      name: 'deleteauction',
      description: 'Delete an auction (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the auction',
          required: true
        }
      ]
    },
    {
      name: 'endauctionadmin',
      description: 'End an auction timer (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the auction',
          required: true
        }
      ]
    },
    {
      name: 'redirectauctions',
      description: 'Redirect all future auctions to a specific channel (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel to redirect auctions to',
          required: true
        }
      ]
    },
    {
      name: 'setuptrade',
      description: 'Show trade setup information'
    },
    {
      name: 'redirecttrade',
      description: 'Redirect all future trades to a specific channel (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel to redirect trades to',
          required: true
        }
      ]
    },
    {
      name: 'deletetrade',
      description: 'Delete a trade by message ID (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the trade',
          required: true
        }
      ]
    },
    {
      name: 'accepttrade',
      description: 'Accept a trade by message ID (admin only)',
      options: [
        {
          name: 'messageid',
          type: ApplicationCommandOptionType.String,
          description: 'The message ID of the trade',
          required: true
        }
      ]
    },
    {
      name: 'setupinventory',
      description: 'Create or view your inventory'
    },
    {
      name: 'redirectinventory',
      description: 'Set the channel for inventories (admin only)',
      options: [
        {
          name: 'channel',
          type: ApplicationCommandOptionType.Channel,
          description: 'The channel for inventories',
          required: true
        }
      ]
    },
    {
      name: 'setupgiveaway',
      description: 'Show giveaway setup information (admin only)'
    },
    {
      name: 'savedata',
      description: 'Manually save all bot data to Redis (admin only)'
    },
    {
      name: 'clearbotmessages',
      description: 'Delete bot messages in this channel (admin only)',
      options: [
        {
          name: 'amount',
          type: ApplicationCommandOptionType.Integer,
          description: 'Number of bot messages to delete (1-100)',
          required: true,
          min_value: 1,
          max_value: 100
        }
      ]
    },
    {
      name: 'botcmds',
      description: 'View all available bot commands'
    },
  ];

  await client.application.commands.set(commands);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if user is waiting to upload proof
  if (message.author.waitingForProof && message.attachments.size > 0) {
    const proofData = message.author.waitingForProof;
    const attachment = message.attachments.first();

    // Verify it's an image
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      return message.reply('❌ Please upload an image file.');
    }

    const guild = message.guild;
    let proofChannel = null;
    let proofEmbed = null;

    if (proofData.type === 'trade') {
      const tradeProofChannelId = '1461849745566990487';
      proofChannel = guild.channels.cache.get(tradeProofChannelId);

      if (!proofChannel) {
        delete message.author.waitingForProof;
        return message.reply('❌ Trade proof channel not found.');
      }

      // Get trade info
      const trade = trades.get(proofData.tradeMessageId);
      if (!trade) {
        delete message.author.waitingForProof;
        return message.reply('❌ Trade no longer exists.');
      }

      // Create proof embed
      proofEmbed = new EmbedBuilder()
        .setTitle('🔄 Trade Proof')
        .setDescription(`**Trade ID:** ${proofData.tradeMessageId}\n**Host:** <@${trade.host.id}>\n**Guest:** <@${trade.acceptedUser.id}>\n\n**Note:** ${proofData.description || 'No description provided'}`)
        .setColor(0x0099ff)
        .setImage(attachment.url)
        .setFooter({ text: `Submitted by <@${message.author.id}>` })
        .setTimestamp();
    } else if (proofData.type === 'auction') {
      const auctionProofChannelId = '1461849894615646309';
      proofChannel = guild.channels.cache.get(auctionProofChannelId);

      if (!proofChannel) {
        delete message.author.waitingForProof;
        return message.reply('❌ Auction proof channel not found.');
      }

      // Get auction info from finishedAuctions Map
      const auctionData = finishedAuctions.get(proofData.auctionProofMessageId);
      
      if (!auctionData) {
        delete message.author.waitingForProof;
        return message.reply('❌ Auction no longer exists.');
      }

      // Create proof embed for auction
      proofEmbed = new EmbedBuilder()
        .setTitle('🎪 Auction Proof')
        .setDescription(`**Title:** ${auctionData.title}\n**Host:** ${auctionData.host}\n**Winner:** ${auctionData.winner}\n**Bid:** ${formatBid(auctionData.diamonds)} 💎\n\n**Note:** ${proofData.description || 'No description provided'}`)
        .setColor(0x00ff00)
        .setImage(attachment.url)
        .setFooter({ text: `Submitted by ${message.author.username}` })
        .setTimestamp();
    } else if (proofData.type === 'giveaway') {
      const giveawayProofChannelId = '1462197194646880368';
      proofChannel = guild.channels.cache.get(giveawayProofChannelId);

      if (!proofChannel) {
        delete message.author.waitingForProof;
        return message.reply('❌ Giveaway proof channel not found.');
      }

      // Get giveaway info from finishedGiveaways Map
      const giveawayData = finishedGiveaways.get(proofData.giveawayProofMessageId);
      
      if (!giveawayData) {
        delete message.author.waitingForProof;
        return message.reply('❌ Giveaway no longer exists.');
      }

      // Create proof embed for giveaway
      proofEmbed = new EmbedBuilder()
        .setTitle('🎁 Giveaway Proof')
        .setDescription(`**Host:** ${giveawayData.host}\n**Winner:** ${giveawayData.winner}\n\n**Note:** ${proofData.description || 'No description provided'}`)
        .setColor(0xFF1493)
        .setImage(attachment.url)
        .setFooter({ text: `Submitted by ${message.author.username}` })
        .setTimestamp();
    } else {
      delete message.author.waitingForProof;
      return message.reply('❌ Invalid proof type.');
    }

    // Send to proof channel
    await proofChannel.send({ embeds: [proofEmbed] });
    
    message.reply('✅ Proof image has been submitted and recorded!');
    delete message.author.waitingForProof;
    return;
  }

  const auction = Array.from(auctions.values()).find(a => a.channelId === message.channel.id);
  if (!auction) return;

  // Parse bid messages
  const bidRegex = /bid (\d+(?:,\d{3})*|\d+K?)(?:\s+and (.+))?/i;
  const match = message.content.match(bidRegex);
  if (match) {
    const diamondsStr = match[1];
    const items = match[2] || '';
    const diamonds = parseBid(diamondsStr);

    if (auction.model === 'items' && diamonds > 0) return message.reply('This auction is offers only.');
    if (auction.model === 'diamonds' && items) return message.reply('This auction is diamonds only.');

    // Additional check for 'both' model: if there's a previous bid with only diamonds, don't allow adding diamonds
    if (auction.model === 'both' && diamonds > 0 && auction.bids.some(bid => bid.diamonds > 0 && !bid.items)) {
      return message.reply('Since there\'s already a bid with only diamonds, you can only add items to your bid.');
    }

    // Add bid
    auction.bids.push({ user: message.author, diamonds, items });
    message.reply(`Bid placed: ${formatBid(diamonds)} 💎${items ? ` and ${items}` : ''}`);
  }
});

function parseBid(str) {
  str = str.replace(/,/g, '').toLowerCase();
  const multipliers = { 'k': 1000, 'm': 1000000, 'b': 1000000000, 't': 1000000000000 };
  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (str.includes(suffix)) {
      const num = parseFloat(str.replace(suffix, ''));
      return Math.floor(num * multiplier);
    }
  }
  return parseInt(str);
}

function formatBid(num) {
  const suffixes = [
    { suffix: 'T', value: 1000000000000 },
    { suffix: 'B', value: 1000000000 },
    { suffix: 'M', value: 1000000 },
    { suffix: 'K', value: 1000 }
  ];

  for (const { suffix, value } of suffixes) {
    if (num >= value) {
      const formatted = (num / value).toFixed(1);
      // Remove trailing .0
      return formatted.endsWith('.0') ? formatted.slice(0, -2) + suffix : formatted + suffix;
    }
  }
  return num.toString();
}

function parseDuration(str) {
  str = str.toString().trim().toLowerCase();
  
  // Check for time units
  const secondsMatch = str.match(/^(\d+(?:\.\d+)?)\s*s$/);
  const minutesMatch = str.match(/^(\d+(?:\.\d+)?)\s*m$/);
  const hoursMatch = str.match(/^(\d+(?:\.\d+)?)\s*h$/);
  
  let minutes = 0;
  
  if (secondsMatch) {
    const seconds = parseFloat(secondsMatch[1]);
    minutes = Math.ceil(seconds / 60);
  } else if (minutesMatch) {
    minutes = Math.ceil(parseFloat(minutesMatch[1]));
  } else if (hoursMatch) {
    minutes = Math.ceil(parseFloat(hoursMatch[1]) * 60);
  } else {
    // If no unit, assume it's minutes
    minutes = parseInt(str);
  }
  
  return minutes;
}

async function logAdminCommand(interaction, commandName) {
  const logChannel = interaction.guild.channels.cache.get('1462502375607632126');
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('Admin Command Executed')
    .setDescription(`**Command:** /${commandName}\n**User:** ${interaction.user}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`)
    .setColor(0xF1C40F)
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setupauction') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const versionFile = require('./version.json');
      const version = versionFile.auction || '1.0.0';

      const embed = new EmbedBuilder()
        .setTitle('Auction System Setup')
        .setDescription('Welcome to the live auction system!\n\n**How it works:**\n- Auctions are held per channel to avoid conflicts.\n- Bidding can be done via text (e.g., "bid 10000") or slash commands.\n- The auction ends automatically after the set time, or can be ended early.\n- Winner is the highest bidder (diamonds first, then first bid if tie).\n\nClick the button below to create a new auction.')
        .setColor(0x00ff00)
        .setFooter({ text: `Version ${version} | Made By Atlas` })
        .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_auction')
            .setLabel('Create Auction')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'update') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const versionFile = require('./version.json');

        // Increment versions automatically for all categories
        const categoriesToUpdate = [
          { key: 'auction', name: 'Auction' },
          { key: 'trade', name: 'Trade' },
          { key: 'inventory', name: 'Inventory' },
          { key: 'giveaway', name: 'Giveaway' }
        ];

        let versionChanges = [];

        for (const category of categoriesToUpdate) {
          const currentVersion = versionFile[category.key] || '1.0.0';
          const newVersion = incrementVersion(currentVersion);
          
          if (updateVersionFile(category.key, newVersion)) {
            versionChanges.push(`${category.name}: ${currentVersion} → ${newVersion}`);
          } else {
            versionChanges.push(`${category.name}: Failed to update version`);
          }
        }

        // Reload version file after updates
        delete require.cache[require.resolve('./version.json')];
        const updatedVersionFile = require('./version.json');

        // Define embeds to update with their respective version keys
        const categoriesToUpdateEmbeds = [
          {
            title: 'Auction System Setup',
            color: 0x00ff00,
            description: 'Welcome to the live auction system!\n\n**How it works:**\n- Auctions are held per channel to avoid conflicts.\n- Bidding can be done via text (e.g., "bid 10000") or slash commands.\n- The auction ends automatically after the set time, or can be ended early.\n- Winner is the highest bidder (diamonds first, then first bid if tie).\n\nClick the button below to create a new auction.',
            customId: 'create_auction',
            buttonLabel: 'Create Auction',
            versionKey: 'auction'
          },
          {
            title: 'Trade System Setup',
            color: 0x0099ff,
            description: 'Welcome to the live trade system!\n\n**How it works:**\n- Create a trade offer with items or diamonds.\n- Other users can place their offers in response.\n- Host can accept or decline offers.\n- Once accepted, both users are notified.\n\nClick the button below to create a new trade.',
            customId: 'create_trade',
            buttonLabel: 'Create Trade',
            versionKey: 'trade'
          },
          {
            title: '📦 Inventory System Setup',
            color: 0x00a8ff,
            description: 'Welcome to the inventory system!\n\n**How it works:**\n- Create your personal inventory with items you have in stock.\n- Set your diamond amount and describe what you\'re looking for.\n- Optionally add your Roblox username to display your avatar.\n- Other users can see your inventory and make offers!\n- Update anytime - your previous items stay saved if you don\'t remove them.\n\nClick the button below to create or edit your inventory.',
            customId: 'create_inventory',
            buttonLabel: 'Create Inventory',
            versionKey: 'inventory'
          },
          {
            title: '🎁 Giveaway System Setup',
            color: 0xFF1493,
            description: 'Welcome to the giveaway system!\n\n**How it works:**\n- Create a giveaway with items you want to give away.\n- Users can enter the giveaway by clicking the button.\n- Winners are selected randomly from all entries.\n- The role <@&1462168024151883836> will be mentioned when the giveaway starts!\n\nClick the button below to create a new giveaway.',
            customId: 'create_giveaway',
            buttonLabel: 'Create Giveaway',
            versionKey: 'giveaway'
          }
        ];

        let updatedCount = 0;
        let failedCount = 0;

        for (const category of categoriesToUpdateEmbeds) {
          try {
            // Get updated version from version.json for this category
            const version = updatedVersionFile[category.versionKey] || '1.0.0';

            // Search for messages with this embed title in all channels
            const channels = interaction.guild.channels.cache.filter(c => c.isTextBased());
            
            for (const [, channel] of channels) {
              try {
                const messages = await channel.messages.fetch({ limit: 100 });
                
                for (const [, message] of messages) {
                  if (message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title === category.title) {
                      // Found the embed, update it
                      const newEmbed = new EmbedBuilder()
                        .setTitle(category.title)
                        .setDescription(category.description)
                        .setColor(category.color)
                        .setFooter({ text: `Version ${version} | Made By Atlas` })
                        .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');

                      const row = new ActionRowBuilder()
                        .addComponents(
                          new ButtonBuilder()
                            .setCustomId(category.customId)
                            .setLabel(category.buttonLabel)
                            .setStyle(ButtonStyle.Primary)
                        );

                      await message.edit({ embeds: [newEmbed], components: [row] });
                      updatedCount++;
                      break; // Found and updated, move to next category
                    }
                  }
                }
              } catch (e) {
                // Continue to next channel
              }
            }
          } catch (e) {
            failedCount++;
            console.error(`Error updating ${category.title}:`, e);
          }
        }

        const updateEmbed = new EmbedBuilder()
          .setTitle('✅ Embeds Updated with New Versions')
          .setDescription(`**Update Summary:**\n- ✅ Successfully updated: ${updatedCount} embed(s)\n- ❌ Failed: ${failedCount} embed(s)\n\n**Version Changes:**\n${versionChanges.map(change => `- ${change}`).join('\n')}\n\n**Current Versions:**\n- 🎪 Auction: v${updatedVersionFile.auction || '1.0.0'}\n- 🔄 Trade: v${updatedVersionFile.trade || '1.0.0'}\n- 📦 Inventory: v${updatedVersionFile.inventory || '1.0.0'}\n- 🎁 Giveaway: v${updatedVersionFile.giveaway || '1.0.0'}`)
          .setColor(0x00ff00)
          .setFooter({ text: `Last Updated: ${updatedVersionFile.lastUpdated || new Date().toISOString()} | Made By Atlas` });

        await interaction.editReply({ embeds: [updateEmbed] });
      } catch (error) {
        console.error('Error updating embeds:', error);
        await interaction.editReply({ content: 'An error occurred while updating the embeds.' });
      }
    }

    if (commandName === 'bid') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E21');

      // Show modal
      const modal = new ModalBuilder()
        .setCustomId('bid_modal')
        .setTitle('Place Your Bid');

      const diamondsInput = new TextInputBuilder()
        .setCustomId('diamonds')
        .setLabel('Diamonds (💎)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10000')
        .setRequired(auction.model !== 'items');

      const itemsInput = new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Additional Items (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe items')
        .setRequired(auction.model === 'items');

      const row1 = new ActionRowBuilder().addComponents(diamondsInput);
      const row2 = new ActionRowBuilder().addComponents(itemsInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (commandName === 'endauction') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E21');
      if (auction.host.id !== interaction.user.id) return sendErrorReply(interaction, 'E02');

      clearTimeout(auction.timer);
      await endAuction(interaction.channel);
      interaction.reply('Auction ended by host.');
    }

    if (commandName === 'auctionstatus') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E21');

      const embed = new EmbedBuilder()
        .setTitle('Auction Status')
        .setDescription(`Title: ${auction.title}\nDescription: ${auction.description}\nModel: ${auction.model}\nStarting Price: ${formatBid(auction.startingPrice)} 💎\nTime Left: ${Math.max(0, auction.time - Math.floor((Date.now() - auction.started) / 1000))} seconds\nBids: ${auction.bids.length}`)
        .setColor(0x0000ff);

      interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
    const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));

    if (commandName === 'deleteauction') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return sendErrorReply(interaction, 'E33', 'Auction not found');

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      
      try {
        const channel = interaction.guild.channels.cache.get(auction.channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (e) {
        // ignore if message not found
      }
      auctions.delete(auction.channelId);
      interaction.reply({ content: `Auction "${auction.title}" (from ${auction.host}) deleted by admin.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'endauctionadmin') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return sendErrorReply(interaction, 'E33', 'Auction not found');

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      const channel = interaction.guild.channels.cache.get(auction.channelId);
      await endAuction(channel);
      interaction.reply({ content: `Auction "${auction.title}" (from ${auction.host}) ended by admin.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'restartauction') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const messageId = interaction.options.getString('messageid');
      const auction = Array.from(auctions.values()).find(a => a.messageId === messageId);
      if (!auction) return sendErrorReply(interaction, 'E33', 'Auction not found');

      clearTimeout(auction.timer);
      clearInterval(auction.updateInterval);
      auction.started = new Date();
      auction.timer = setTimeout(async () => {
        clearInterval(auction.updateInterval);
        await endAuction(interaction.guild.channels.cache.get(auction.channelId));
      }, auction.time * 1000);
      // Restart update interval
      auction.updateInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.ceil((auction.started.getTime() + auction.time * 1000 - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(auction.updateInterval);
          return;
        }
        const currentBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
        const updatedEmbed = new EmbedBuilder()
          .setTitle(auction.title)
          .setDescription(`${auction.description}\n\n**Looking For:** ${auction.model}\n**Starting Price:** ${formatBid(auction.startingPrice)} 💎\n**Current Bid:** ${formatBid(currentBid)} 💎\n**Time Remaining:** ${remaining}s\n**Hosted by:** ${auction.host}`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
        try {
          const channel = interaction.guild.channels.cache.get(auction.channelId);
          const message = await channel.messages.fetch(auction.messageId);
          await message.edit({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bid_button').setLabel('Bid').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('view_bids_button').setLabel('View Bids').setStyle(ButtonStyle.Secondary)
          )] });
        } catch (e) {
          // ignore
        }
      }, 1000);
      interaction.reply({ content: 'Auction restarted.', flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'redirectauctions') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return sendErrorReply(interaction, 'E72', 'Please select a text channel');
      redirectChannelId = channel.id;
      interaction.reply({ content: `All future auctions will be redirected to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'redirecttrade') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return sendErrorReply(interaction, 'E72', 'Please select a text channel');
      redirectTradeChannelId = channel.id;
      interaction.reply({ content: `All future trades will be redirected to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'redirectinventory') {
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const channel = interaction.options.getChannel('channel');
      if (channel.type !== 0) return sendErrorReply(interaction, 'E72', 'Please select a text channel');
      redirectInventoryChannelId = channel.id;
      interaction.reply({ content: `All inventories will be posted to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'setuptrade') {
      // Check admin permission first
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      // Check trade limit
      const isAdmin = true; // Already checked admin above
      const userTradeLimit = isAdmin ? 10 : 2;
      const currentTradeCount = userTradeCount.get(interaction.user.id) || 0;

      if (currentTradeCount >= userTradeLimit) {
        return interaction.reply({ 
          content: `You have reached your trade creation limit (${userTradeLimit}). ${isAdmin ? 'As an admin, you can have up to 10 active trades.' : 'Regular users can have up to 2 active trades.'}`,
          flags: MessageFlags.Ephemeral 
        });
      }

      const versionFile = require('./version.json');
      const version = versionFile.trade || '1.0.0';

      const embed = new EmbedBuilder()
        .setTitle('Trade System Setup')
        .setDescription('Welcome to the live trade system!\n\n**How it works:**\n- Create a trade offer with items or diamonds.\n- Other users can place their offers in response.\n- Host can accept or decline offers.\n- Once accepted, both users are notified.\n\nClick the button below to create a new trade.')
        .setColor(0x0099ff)
        .setFooter({ text: `Version ${version} | Made By Atlas` })
        .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_trade')
            .setLabel('Create Trade')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'deletetrade') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const messageId = interaction.options.getString('messageid');
      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      // Decrement trade count for host
      const hostId = trade.host.id;
      const currentCount = userTradeCount.get(hostId) || 0;
      if (currentCount > 0) {
        userTradeCount.set(hostId, currentCount - 1);
      }

      // Delete the trade message
      try {
        const channel = interaction.guild.channels.cache.get(trade.channelId);
        const message = await channel.messages.fetch(messageId);
        await message.delete();
      } catch (e) {
        // ignore if message not found
      }

      trades.delete(messageId);
      interaction.reply({ content: `Trade from ${trade.host.displayName || trade.host.username} has been deleted.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'accepttrade') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const messageId = interaction.options.getString('messageid');
      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      if (trade.offers.length > 0) {
        return sendErrorReply(interaction, 'E08');
      }

      // Mark trade as cancelled
      trade.accepted = true;
      trade.acceptedUser = null;
      trade.adminCancelled = true;

      // Update embed
      await updateTradeEmbed(interaction.guild, trade, messageId);

      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`❌ This trade has been cancelled by an admin.`);

      interaction.reply({ content: `Trade has been cancelled.`, flags: MessageFlags.Ephemeral });
    }

    if (commandName === 'setupinventory') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const versionFile = require('./version.json');
      const version = versionFile.inventory || '1.0.0';

      const embed = new EmbedBuilder()
        .setTitle('📦 Inventory System Setup')
        .setDescription('Welcome to the inventory system!\n\n**How it works:**\n- Create your personal inventory with items you have in stock.\n- Set your diamond amount and describe what you\'re looking for.\n- Optionally add your Roblox username to display your avatar.\n- Other users can see your inventory and make offers!\n- Update anytime - your previous items stay saved if you don\'t remove them.\n\nClick the button below to create or edit your inventory.')
        .setColor(0x00a8ff)
        .setFooter({ text: `Version ${version} | Made By Atlas` })
        .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_inventory')
            .setLabel('Create Inventory')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'setupgiveaway') {
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const versionFile = require('./version.json');
      const version = versionFile.giveaway || '1.0.0';

      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway System Setup')
        .setDescription('Welcome to the giveaway system!\n\n**How it works:**\n- Create a giveaway with items you want to give away.\n- Users can enter the giveaway by clicking the button.\n- Winners are selected randomly from all entries.\n- The role <@&1462168024151883836> will be mentioned when the giveaway starts!\n\nClick the button below to create a new giveaway.')
        .setColor(0xFF1493)
        .setFooter({ text: `Version ${version} | Made By Atlas` })
        .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_giveaway')
            .setLabel('Create Giveaway')
            .setStyle(ButtonStyle.Primary)
        );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'savedata') {
      // Check if user has admin role (same as other admin commands)
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      try {
        await saveData();
        await interaction.reply({ content: '✅ All bot data has been successfully saved to Redis!', flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error('Error saving data:', error);
        await sendErrorReply(interaction, 'E46');
      }
    }

    if (commandName === 'clearbotmessages') {
      // Check if user has admin role
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      if (!hasAdminRole) return sendErrorReply(interaction, 'E01');

      await logAdminCommand(interaction, commandName);

      const amount = interaction.options.getInteger('amount');
      
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // Fetch messages from the channel
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        
        // Filter bot messages
        const botMessages = messages.filter(msg => msg.author.id === client.user.id);
        
        // Get the specified amount of bot messages
        const messagesToDelete = botMessages.first(amount);
        
        if (messagesToDelete.length === 0) {
          return interaction.editReply({ content: '❌ No bot messages found in this channel.' });
        }
        
        // Delete the messages
        let deletedCount = 0;
        for (const message of messagesToDelete) {
          try {
            await message.delete();
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete message ${message.id}:`, error);
          }
        }
        
        await interaction.editReply({ 
          content: `✅ Successfully deleted ${deletedCount} bot message(s) out of ${amount} requested.` 
        });
        
      } catch (error) {
        console.error('Error clearing bot messages:', error);
        await interaction.editReply({ content: '❌ An error occurred while clearing bot messages.' });
      }
    }

    if (commandName === 'botcmds') {
      const pages = [
        {
          title: '🎪 Auction Commands',
          color: 0x00ff00,
          fields: [
            { name: '/setupauction', value: 'Show auction setup information and create new auction (admin only)', inline: false },
            { name: '/bid', value: 'Place a bid on the current auction', inline: false },
            { name: '/endauction', value: 'End the current auction (host only)', inline: false },
            { name: '/auctionstatus', value: 'View current auction status', inline: false },
            { name: '/deleteauction [messageid]', value: 'Delete an auction (admin only)', inline: false },
            { name: '/endauctionadmin [messageid]', value: 'End an auction timer (admin only)', inline: false },
            { name: '/redirectauctions [channel]', value: 'Redirect all future auctions to a specific channel (admin only)', inline: false }
          ]
        },
        {
          title: '🔄 Trade Commands',
          color: 0x0099ff,
          fields: [
            { name: '/setuptrade', value: 'Show trade setup information and create new trade (admin only)', inline: false },
            { name: '/redirecttrade [channel]', value: 'Redirect all future trades to a specific channel (admin only)', inline: false },
            { name: '/deletetrade [messageid]', value: 'Delete a trade by message ID (admin only)', inline: false },
            { name: '/accepttrade [messageid]', value: 'Accept a trade by message ID (admin only)', inline: false }
          ]
        },
        {
          title: '📦 Inventory & 🎁 Giveaway Commands',
          color: 0x00a8ff,
          fields: [
            { name: '/setupinventory', value: 'Create or view your inventory (admin only)', inline: false },
            { name: '/redirectinventory [channel]', value: 'Set the channel for inventories (admin only)', inline: false },
            { name: '/setupgiveaway', value: 'Show giveaway setup and create new giveaway (admin only)', inline: false }
          ]
        },
        {
          title: '⚙️ Utility Commands',
          color: 0xffa500,
          fields: [
            { name: '/update', value: 'Update auction, trade, and inventory embeds (admin only)', inline: false },
            { name: '/savedata', value: 'Manually save all bot data to Redis (admin only)', inline: false },
            { name: '/clearbotmessages [amount]', value: 'Delete bot messages in this channel (admin only)', inline: false },
            { name: '/botcmds', value: 'View all available bot commands', inline: false }
          ]
        }
      ];

      let currentPage = 0;

      const createEmbed = (pageIndex) => {
        const page = pages[pageIndex];
        return new EmbedBuilder()
          .setTitle(page.title)
          .setColor(page.color)
          .setDescription(`Commands List (Page ${pageIndex + 1}/${pages.length})`)
          .addFields(page.fields)
          .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} | Made By Atlas` })
          .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');
      };

      const createButtons = (pageIndex) => {
        const row = new ActionRowBuilder();
        
        if (pageIndex > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_prev_${pageIndex}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Primary)
          );
        }

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`botcmds_page`)
            .setLabel(`${pageIndex + 1}/${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        if (pageIndex < pages.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_next_${pageIndex}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return row;
      };

      const embed = createEmbed(currentPage);
      const buttons = createButtons(currentPage);

      await interaction.reply({ embeds: [embed], components: [buttons] });
    }
  }

  if (interaction.isButton()) {
    // Handle botcmds pagination
    if (interaction.customId.startsWith('botcmds_')) {
      const pages = [
        {
          title: '🎪 Auction Commands',
          color: 0x00ff00,
          fields: [
            { name: '/setupauction', value: 'Show auction setup information and create new auction (admin only)', inline: false },
            { name: '/bid', value: 'Place a bid on the current auction', inline: false },
            { name: '/endauction', value: 'End the current auction (host only)', inline: false },
            { name: '/auctionstatus', value: 'View current auction status', inline: false },
            { name: '/deleteauction [messageid]', value: 'Delete an auction (admin only)', inline: false },
            { name: '/endauctionadmin [messageid]', value: 'End an auction timer (admin only)', inline: false },
            { name: '/redirectauctions [channel]', value: 'Redirect all future auctions to a specific channel (admin only)', inline: false }
          ]
        },
        {
          title: '🔄 Trade Commands',
          color: 0x0099ff,
          fields: [
            { name: '/setuptrade', value: 'Show trade setup information and create new trade (admin only)', inline: false },
            { name: '/redirecttrade [channel]', value: 'Redirect all future trades to a specific channel (admin only)', inline: false },
            { name: '/deletetrade [messageid]', value: 'Delete a trade by message ID (admin only)', inline: false },
            { name: '/accepttrade [messageid]', value: 'Accept a trade by message ID (admin only)', inline: false }
          ]
        },
        {
          title: '📦 Inventory & 🎁 Giveaway Commands',
          color: 0x00a8ff,
          fields: [
            { name: '/setupinventory', value: 'Create or view your inventory (admin only)', inline: false },
            { name: '/redirectinventory [channel]', value: 'Set the channel for inventories (admin only)', inline: false },
            { name: '/setupgiveaway', value: 'Show giveaway setup and create new giveaway (admin only)', inline: false }
          ]
        },
        {
          title: '⚙️ Utility Commands',
          color: 0xffa500,
          fields: [
            { name: '/update', value: 'Update auction, trade, and inventory embeds (admin only)', inline: false },
            { name: '/savedata', value: 'Manually save all bot data to Redis (admin only)', inline: false },
            { name: '/clearbotmessages [amount]', value: 'Delete bot messages in this channel (admin only)', inline: false },
            { name: '/botcmds', value: 'View all available bot commands', inline: false }
          ]
        }
      ];

      let currentPage = 0;
      if (interaction.customId.includes('_prev_')) {
        currentPage = parseInt(interaction.customId.split('_prev_')[1]) - 1;
      } else if (interaction.customId.includes('_next_')) {
        currentPage = parseInt(interaction.customId.split('_next_')[1]) + 1;
      }

      const createEmbed = (pageIndex) => {
        const page = pages[pageIndex];
        return new EmbedBuilder()
          .setTitle(page.title)
          .setColor(page.color)
          .setDescription(`Commands List (Page ${pageIndex + 1}/${pages.length})`)
          .addFields(page.fields)
          .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} | Made By Atlas` })
          .setThumbnail('https://media.discordapp.net/attachments/1461506733833846958/1462497977888280819/AuctionGif_1.gif?ex=696e68e1&is=696d1761&hm=cfc43df2b6ffe3b1bcaf20feb70b5e4ce5b85c2d061aa129ffdb55f8cf3e3e6c&=&width=1593&height=902');
      };

      const createButtons = (pageIndex) => {
        const row = new ActionRowBuilder();
        
        if (pageIndex > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_prev_${pageIndex}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Primary)
          );
        }

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`botcmds_page`)
            .setLabel(`${pageIndex + 1}/${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        if (pageIndex < pages.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`botcmds_next_${pageIndex}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return row;
      };

      const embed = createEmbed(currentPage);
      const buttons = createButtons(currentPage);

      await interaction.update({ embeds: [embed], components: [buttons] });
      return;
    }

    if (interaction.customId === 'bid_button') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E16');

      const modal = new ModalBuilder()
        .setCustomId('bid_modal')
        .setTitle('Place Your Bid');

      const diamondsInput = new TextInputBuilder()
        .setCustomId('diamonds')
        .setLabel('Diamonds (💎)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10000')
        .setRequired(auction.model !== 'items');

      const itemsInput = new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Additional Items (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe items')
        .setRequired(auction.model === 'items');

      const row1 = new ActionRowBuilder().addComponents(diamondsInput);
      const row2 = new ActionRowBuilder().addComponents(itemsInput);

      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'view_bids_button') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E21');

      if (auction.bids.length === 0) return sendErrorReply(interaction, 'E28');

      // Sort bids by diamonds descending
      const sortedBids = auction.bids.sort((a, b) => b.diamonds - a.diamonds);

      const bidList = sortedBids.map(bid => {
        const secondsAgo = Math.floor((Date.now() - bid.timestamp) / 1000);
        let timeAgo;
        if (secondsAgo < 60) timeAgo = `${secondsAgo} seconds ago`;
        else if (secondsAgo < 3600) timeAgo = `${Math.floor(secondsAgo / 60)} minutes ago`;
        else timeAgo = `${Math.floor(secondsAgo / 3600)} hours ago`;
        return `${bid.user.username}: ${formatBid(bid.diamonds)} 💎 - ${timeAgo}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('Bid List')
        .setDescription(bidList)
        .setColor(0x00ff00)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('giveaway_enter_')) {
      const messageId = interaction.message.id;
      const giveaway = giveaways.get(messageId);
      if (!giveaway) return sendErrorReply(interaction, 'E36', 'Giveaway not found');

      // Check if user is the giveaway host
      if (giveaway.host.id === interaction.user.id) {
        return interaction.reply({ content: '❌ You can\'t enter your own raffle!', flags: MessageFlags.Ephemeral });
      }

      // Check if user already entered
      const alreadyEntered = giveaway.entries.some(entry => entry.user.id === interaction.user.id);
      if (alreadyEntered) {
        return interaction.reply({ content: 'You are already entered in this giveaway!', flags: MessageFlags.Ephemeral });
      }

      // Check if user has special role for x2 entries
      const specialRoleId = '1461534174589485197';
      const hasSpecialRole = interaction.member.roles.cache.has(specialRoleId);
      const entryCount = hasSpecialRole ? 2 : 1;

      // Add entry(ies)
      for (let i = 0; i < entryCount; i++) {
        giveaway.entries.push({
          user: interaction.user,
          enteredAt: Date.now(),
          multiplier: hasSpecialRole ? 2 : 1
        });
      }

      const message = hasSpecialRole 
        ? `✅ You have entered the giveaway with **x2 entries** due to your special role! Total entries: ${giveaway.entries.length}`
        : `✅ You have entered the giveaway! Total entries: ${giveaway.entries.length}`;

      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('giveaway_entries_')) {
      const messageId = interaction.customId.replace('giveaway_entries_', '');
      const giveaway = giveaways.get(messageId);
      if (!giveaway) return sendErrorReply(interaction, 'E36', 'Giveaway not found');

      // Create entries list
      let entriesList = 'No entries yet.';
      if (giveaway.entries.length > 0) {
        // Group entries by user to show multipliers
        const userEntries = {};
        giveaway.entries.forEach((entry) => {
          if (!userEntries[entry.user.id]) {
            userEntries[entry.user.id] = {
              user: entry.user,
              count: 0,
              multiplier: entry.multiplier || 1
            };
          }
          userEntries[entry.user.id].count++;
        });
        
        entriesList = Object.values(userEntries)
          .map((data, idx) => {
            const userDisplay = data.user.displayName || data.user.username;
            const multiplierText = data.multiplier === 2 ? ' (x2)' : '';
            return `${idx + 1}. ${userDisplay}${multiplierText}`;
          })
          .join('\n');
      }

      const entriesEmbed = new EmbedBuilder()
        .setTitle('🎁 Giveaway Entries')
        .setDescription(entriesList)
        .setColor(0xFF1493)
        .setFooter({ text: `Total: ${giveaway.entries.length} ${giveaway.entries.length === 1 ? 'entry' : 'entries'}` });

      await interaction.reply({ embeds: [entriesEmbed], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('giveaway_end_')) {
      const messageId = interaction.customId.replace('giveaway_end_', '');
      const giveaway = giveaways.get(messageId);
      if (!giveaway) return sendErrorReply(interaction, 'E36', 'Giveaway not found');

      if (giveaway.host.id !== interaction.user.id) {
        const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
        const hasAdminRole = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
        if (!hasAdminRole) return interaction.reply({ content: 'Only the host or admin can end the giveaway.', flags: MessageFlags.Ephemeral });
      }

      // Clear update interval
      if (giveaway.updateInterval) {
        clearInterval(giveaway.updateInterval);
      }

      // Update the original giveaway embed to show "Ended by host"
      try {
        const channel = interaction.guild.channels.cache.get(giveaway.channelId);
        if (channel) {
          const message = await channel.messages.fetch(messageId);
          if (message) {
            const endedEmbed = new EmbedBuilder()
              .setTitle('🎁 Giveaway')
              .setDescription(giveaway.description ? `**${giveaway.description}**\n\n**Ended by host**` : '**Ended by host**')
              .setColor(0xFF0000) // Red color
              .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
              .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

            const giveawayItemsText = formatItemsText(giveaway.items);

            endedEmbed.addFields({
              name: 'Giveaway Items',
              value: giveawayItemsText,
              inline: false
            });

            endedEmbed.addFields({
              name: 'Hosted by',
              value: giveaway.host.toString(),
              inline: false
            });

            endedEmbed.addFields({
              name: 'Status',
              value: 'Ended by host',
              inline: false
            });

            // Disable all buttons
            const disabledRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('disabled_enter')
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('disabled_entries')
                .setLabel(`${giveaway.entries.length} ${giveaway.entries.length === 1 ? 'Entry' : 'Entries'}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('disabled_end')
                .setLabel('End Giveaway')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            );

            await message.edit({ embeds: [endedEmbed], components: [disabledRow] });
          }
        }
      } catch (error) {
        console.error('Error updating giveaway embed:', error);
      }

      if (giveaway.entries.length === 0) {
        giveaways.delete(messageId);
        // Decrement giveaway count for host
        const hostId = giveaway.host.id;
        userGiveawayCount.set(hostId, Math.max(0, (userGiveawayCount.get(hostId) || 1) - 1));
        return sendErrorReply(interaction, 'E41');
      }

      // Select random winner
      const randomIndex = Math.floor(Math.random() * giveaway.entries.length);
      const winner = giveaway.entries[randomIndex];

      // Create winner embed
      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway Ended!')
        .setColor(0xFF1493)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' });

      // Winner field
      embed.addFields({ name: 'Winner', value: `**${winner.user}**`, inline: false });

      // List items with proper formatting (bold + abbrev for diamonds)
      const itemsText = giveaway.items && giveaway.items.length > 0 ? formatItemsText(giveaway.items) : 'None';
      embed.addFields({
        name: 'Giveaway Items',
        value: itemsText,
        inline: false
      });

      embed.addFields({
        name: 'Total Entries',
        value: giveaway.entries.length.toString(),
        inline: true
      });

      // Add Upload Proof Image button
      const proofButton = new ButtonBuilder()
        .setCustomId(`upload_proof_giveaway_${Date.now()}`)
        .setLabel('Upload Proof Image')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(proofButton);

      const channel = interaction.guild.channels.cache.get(giveaway.channelId);
      const proofMessage = await channel.send({ embeds: [embed], components: [row] });

      // Store finished giveaway data for proof handler
      finishedGiveaways.set(proofMessage.id, {
        host: giveaway.host,
        winner: winner.user,
        items: giveaway.items,
        channelId: giveaway.channelId,
        giveawayChannelId: '1462197194646880368'
      });

      // Notify winner
      await channel.send(`🎉 Congratulations ${winner.user}! You won the giveaway!`);

      // Decrement giveaway count for host
      const hostId = giveaway.host.id;
      userGiveawayCount.set(hostId, Math.max(0, (userGiveawayCount.get(hostId) || 1) - 1));
      
      // Delete giveaway
      giveaways.delete(messageId);
      
      await interaction.reply({ content: 'Giveaway ended!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'trade_page_prev' || interaction.customId === 'trade_page_next') {
      const currentPage = interaction.user.currentTradePage || 1;
      const totalPages = Math.ceil(interaction.user.tradeItems.length / 15);
      let newPage = currentPage;
      if (interaction.customId === 'trade_page_prev' && currentPage > 1) newPage--;
      if (interaction.customId === 'trade_page_next' && currentPage < totalPages) newPage++;
      interaction.user.currentTradePage = newPage;

      const ITEMS_PER_PAGE = 15;
      const start = (newPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageItems = interaction.user.tradeItems.slice(start, end);
      const itemsList = formatItemsList(pageItems);                                         //\nWhat would you like to do?
      const description = `**Selected Items (Page ${newPage}/${totalPages}):**\n${itemsList}\n`;

      const embed = new EmbedBuilder().setDescription(description);

      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      const components = [row];
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('trade_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(newPage === 1),
          new ButtonBuilder().setCustomId('trade_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(newPage === totalPages)
        );
        components.push(paginationRow);
      }

      await interaction.update({ embeds: [embed], components });
      return;
    }

    if (interaction.customId === 'create_auction') {
      const modal = new ModalBuilder()
        .setCustomId('auction_modal')
        .setTitle('Create Auction');

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Auction Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const priceInput = new TextInputBuilder()
        .setCustomId('starting_price')
        .setLabel('Starting Price (💎)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const modelInput = new TextInputBuilder()
        .setCustomId('model')
        .setLabel('Model (diamonds/items/both)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(priceInput),
        new ActionRowBuilder().addComponents(modelInput)
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'create_trade') {
      // Check trade limit
      const specialRoleId = '1461534174589485197';
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      
      const hasSpecialRole = interaction.member.roles.cache.has(specialRoleId);
      const isAdmin = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      
      const userId = interaction.user.id;
      const currentTrades = userTradeCount.get(userId) || 0;
      const maxTrades = isAdmin ? Infinity : (hasSpecialRole ? 5 : 1);
      
      if (currentTrades >= maxTrades) {
        return interaction.reply({ 
          content: `You have reached the maximum number of simultaneous trades (${maxTrades}).`, 
          flags: MessageFlags.Ephemeral 
        });
      }

      // Show category selection
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('trade_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
	  { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your trade offer:', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'create_inventory') {
      // Load previous inventory items if editing
      const previousInventory = inventories.get(interaction.user.id);
      if (previousInventory) {
        interaction.user.inventoryItems = previousInventory.items;
      }

      // Show category selection
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('inventory_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your inventory:', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'create_giveaway') {
      // Check if user has the required role to create giveaway
      const giveawayCreatorRoleId = '1461798386201006324';
      const specialRoleId = '1461534174589485197';
      const adminRoles = ['1461505505401896972', '1461481291118678087', '1461484563183435817'];
      
      const hasGiveawayRole = interaction.member.roles.cache.has(giveawayCreatorRoleId);
      const hasSpecialRole = interaction.member.roles.cache.has(specialRoleId);
      const isAdmin = interaction.member.roles.cache.some(role => adminRoles.includes(role.id));
      
      if (!hasGiveawayRole && !hasSpecialRole && !isAdmin) {
        return sendErrorReply(interaction, 'E01');
      }

      // Check giveaway limit
      const userId = interaction.user.id;
      const currentGiveaways = userGiveawayCount.get(userId) || 0;
      const maxGiveaways = isAdmin ? Infinity : (hasSpecialRole ? 3 : 1);
      
      if (currentGiveaways >= maxGiveaways) {
        return interaction.reply({ 
          content: `You have reached the maximum number of simultaneous giveaways (${maxGiveaways}).`, 
          flags: MessageFlags.Ephemeral 
        });
      }

      // Initialize giveaway items for this user
      interaction.user.giveawayItems = [];

      // Show category selection for giveaway
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('giveaway_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your giveaway:', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'trade_offer_button') {
      const trade = trades.get(interaction.message.id);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      // Show category selection for offer
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_category_select_${interaction.message.id}`)
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      
      // Initialize offer items for this user
      interaction.user.offerTradeItems = [];
      interaction.user.offerMessageId = interaction.message.id;
      
      await interaction.reply({ content: 'Select an item category for your offer:', components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('trade_accept_')) {
      const messageId = interaction.customId.replace('trade_accept_', '');
      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');
      if (trade.host.id !== interaction.user.id) return sendErrorReply(interaction, 'E03');

      // Accept the last offer
      const lastOffer = trade.offers[trade.offers.length - 1];
      trade.accepted = true;
      trade.acceptedUser = lastOffer.user;

      // Update embed and ping both users
      await updateTradeEmbed(interaction.guild, trade, messageId);
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`✅ Trade accepted! <@${trade.host.id}> and <@${lastOffer.user.id}>, your trade has been accepted.`);

      await interaction.reply({ content: 'Trade accepted!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('trade_decline_')) {
      const messageId = interaction.customId.replace('trade_decline_', '');
      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');
      if (trade.host.id !== interaction.user.id) return sendErrorReply(interaction, 'E03');

      // Decline the last offer
      const lastOffer = trade.offers[trade.offers.length - 1];
      trade.offers.pop();

      // Update embed
      await updateTradeEmbed(interaction.guild, trade, messageId);
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      await channel.send(`❌ Trade offer from <@${lastOffer.user.id}> has been declined.`);

      await interaction.reply({ content: 'Offer declined!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('trade_delete_')) {
      // Find which trade this delete button belongs to
      let tradeMessageId = null;
      let trade = null;

      for (const [messageId, t] of trades) {
        if (t.messageId === interaction.message.id) {
          tradeMessageId = messageId;
          trade = t;
          break;
        }
      }

      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');
      if (trade.host.id !== interaction.user.id) return sendErrorReply(interaction, 'E03');

      // Delete the trade message
      try {
        await interaction.message.delete();
      } catch (e) {
        // ignore if message not found
      }

      // Decrement trade count for host
      const hostId = trade.host.id;
      const currentCount = userTradeCount.get(hostId) || 0;
      if (currentCount > 0) {
        userTradeCount.set(hostId, currentCount - 1);
      }

      trades.delete(tradeMessageId);
      await interaction.reply({ content: 'Trade deleted!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('upload_proof_trade_')) {
      const messageId = interaction.customId.replace('upload_proof_trade_', '');
      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      // Check if user is host or accepted user
      if (trade.host.id !== interaction.user.id && trade.acceptedUser.id !== interaction.user.id) {
        return sendErrorReply(interaction, 'E02');
      }

      // Show modal for image description
      const modal = new ModalBuilder()
        .setCustomId(`proof_image_modal_trade_${messageId}`)
        .setTitle('Upload Proof Image');

      const descriptionInput = new TextInputBuilder()
        .setCustomId('proof_description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add any notes about this trade...')
        .setRequired(false);

      const row = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('upload_proof_auction_')) {
      // Show modal for image description
      const modal = new ModalBuilder()
        .setCustomId('proof_image_modal_auction')
        .setTitle('Upload Proof Image');

      const descriptionInput = new TextInputBuilder()
        .setCustomId('proof_description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add any notes about this auction...')
        .setRequired(false);

      const row = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('upload_proof_giveaway_')) {
      // Get giveaway data
      const messageId = interaction.message.id;
      const giveawayData = finishedGiveaways.get(messageId);
      if (!giveawayData) return sendErrorReply(interaction, 'E36', 'Giveaway not found');

      // Check if user is host or winner
      if (giveawayData.host.id !== interaction.user.id && giveawayData.winner.id !== interaction.user.id) {
        return sendErrorReply(interaction, 'E02');
      }

      // Show modal for image URL
      const modal = new ModalBuilder()
        .setCustomId(`proof_image_modal_giveaway_${messageId}`)
        .setTitle('Upload Proof Image');

      const imageUrlInput = new TextInputBuilder()
        .setCustomId('proof_image_url')
        .setLabel('Image URL')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://imgur.com/...')
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('proof_description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add any notes about this giveaway...')
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(imageUrlInput);
      const row2 = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.customId === 'inventory_update_button') {
      // Load previous inventory items
      const previousInventory = inventories.get(interaction.user.id);
      if (previousInventory) {
        interaction.user.inventoryItems = previousInventory.items;
      }

      // Show category selection for inventory update
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('inventory_category_select')
        .setPlaceholder('Select an item category')
        .addOptions([
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      await interaction.reply({ content: 'Select an item category to add to your inventory:', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'inventory_delete_button') {
      const inventory = inventories.get(interaction.user.id);
      if (!inventory || !inventory.items || inventory.items.length === 0) {
        return sendErrorReply(interaction, 'E29');
      }

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const deleteSelect = new StringSelectMenuBuilder()
        .setCustomId('inventory_delete_select')
        .setPlaceholder('Select items to delete')
        .setMinValues(1)
        .setMaxValues(Math.min(100, inventory.items.length));

      inventory.items.forEach((item, index) => {
        const emoji = getItemEmoji(item.name);
        deleteSelect.addOptions({
          label: `${formatItemName(item.name)} (x${item.quantity})`,
          value: `${index}`
        });
      });

      const row = new ActionRowBuilder().addComponents(deleteSelect);
      await interaction.reply({ content: 'Select items to delete from your inventory:', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'inventory_delete_select') {
      const inventory = inventories.get(interaction.user.id);
      if (!inventory) {
        return sendErrorReply(interaction, 'E26', 'Inventory not found');
      }

      const indicesToDelete = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      
      indicesToDelete.forEach(index => {
        if (index >= 0 && index < inventory.items.length) {
          inventory.items.splice(index, 1);
        }
      });

      if (inventory.items.length === 0) {
        interaction.reply({ content: 'All items deleted from your inventory!', flags: MessageFlags.Ephemeral });
      } else {
        interaction.reply({ content: `${indicesToDelete.length} item(s) deleted from your inventory!`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'trade_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      let items = [];
      if (category === 'diamonds') {
        // Show modal for diamonds input
        const diamondsModal = new ModalBuilder()
          .setCustomId('trade_diamonds_modal')
          .setTitle('Add Diamonds');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        // Para huges, mostrar subcategorias
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('trade_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      } else {
        items = itemCategories[category];
      }
      
      // Para outras categorias
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`trade_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'trade_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`trade_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('trade_item_select_')) {
      const parts = interaction.customId.replace('trade_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      // Store items selection - no longer limited to 25
      interaction.user.selectedTradeItems = selectedItems;
      interaction.user.selectedTradeCategory = category;
      interaction.user.selectedTradeSubcategory = subcategory;

      // Show quantity selection modal
      const quantityModal = new ModalBuilder()
        .setCustomId(`trade_item_quantities_modal`)
        .setTitle('Select Quantities');

      const quantitiesInput = new TextInputBuilder()
        .setCustomId('quantities')
        .setLabel(`Quantities for ${interaction.user.selectedTradeItems.length} items (comma separated)`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1,2,3,... (one per item)')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(quantitiesInput);
      quantityModal.addComponents(row);

      await interaction.showModal(quantityModal);
    }

    if (interaction.customId.startsWith('offer_category_select_')) {
      const messageId = interaction.customId.replace('offer_category_select_', '');
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      if (category === 'diamonds') {
        const diamondsModal = new ModalBuilder()
          .setCustomId(`offer_diamonds_modal_${messageId}`)
          .setTitle('Add Diamonds to Offer');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('offer_diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        // Para huges, mostrar subcategorias
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_huge_subcategory_select_${messageId}`)
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = itemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_item_select_${messageId}_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ label: item, value: item })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('offer_huge_subcategory_select_')) {
      const messageId = interaction.customId.replace('offer_huge_subcategory_select_', '');
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_item_select_${messageId}_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ label: item, value: item })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('offer_item_select_')) {
      const parts = interaction.customId.replace('offer_item_select_', '').split('_');
      const messageId = parts[0];
      let category = parts[1];
      let subcategory = parts.length > 2 ? parts.slice(2).join('_') : null;
      const selectedItems = interaction.values;

      // Store items selection - no longer limited to 25
      interaction.user.selectedOfferItems = selectedItems;
      interaction.user.selectedOfferCategory = category;
      interaction.user.selectedOfferSubcategory = subcategory;
      interaction.user.selectedOfferMessageId = messageId;

      // Show quantity selection modal
      const quantityModal = new ModalBuilder()
        .setCustomId(`offer_item_quantities_modal_${messageId}`)
        .setTitle('Select Quantities');

      const quantitiesInput = new TextInputBuilder()
        .setCustomId('offer_quantities')
        .setLabel(`Quantities for ${selectedItems.length} items (comma separated)`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1,2,3,... (one per item)')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(quantitiesInput);
      quantityModal.addComponents(row);

      await interaction.showModal(quantityModal);
    }

    if (interaction.customId === 'trade_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('trade_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'remove_items') {
        // Show a modal to remove items
        const itemsList = interaction.user.tradeItems || [];
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const itemSelect = new StringSelectMenuBuilder()
          .setCustomId('trade_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMaxValues(Math.min(100, itemsList.length))
          .addOptions(itemsList.map((item, idx) => ({ 
            label: `${item.name} (x${item.quantity})`, 
            value: idx.toString()
          })));

        const row = new ActionRowBuilder().addComponents(itemSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      } else if (choice === 'confirm_items') {
        // Check if diamonds are already added as items
        const hasDiamonds = (interaction.user.tradeItems || []).some(item => item.name === '💎 Diamonds');
        
        // Move to diamonds and target user
        const diamondsModal = new ModalBuilder()
          .setCustomId('trade_setup_modal')
          .setTitle('Complete Your Trade Offer');

        // Only show diamonds input if not already added as items
        if (!hasDiamonds) {
          const diamondsInput = new TextInputBuilder()
            .setCustomId('trade_diamonds')
            .setLabel('Diamonds (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0')
            .setRequired(false);

          const row1 = new ActionRowBuilder().addComponents(diamondsInput);
          diamondsModal.addComponents(row1);
        }

        const userInput = new TextInputBuilder()
          .setCustomId('trade_target_user')
          .setLabel('Target User (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leave empty for open trade')
          .setRequired(false);

        const row2 = new ActionRowBuilder().addComponents(userInput);
        
        if (!hasDiamonds) {
          diamondsModal.addComponents(row2);
        } else {
          diamondsModal.addComponents(row2);
        }

        await interaction.showModal(diamondsModal);
      }
    }

    if (interaction.customId.startsWith('offer_continue_select_')) {
      const messageId = interaction.customId.replace('offer_continue_select_', '');
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_category_select_${messageId}`)
          .setPlaceholder('Select another item category')
          .addOptions([
          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
          { label: 'Huges', value: 'huges', emoji: '🔥' },
          { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
          { label: 'Eggs', value: 'eggs', emoji: '🥚' },
          { label: 'Gifts', value: 'gifts', emoji: '🎁' }
        ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'confirm_items') {
        // Check if diamonds are already added
        const offerItems = interaction.user.offerTradeItems || [];
        const hasDiamonds = offerItems.some(item => item.name === '💎 Diamonds');
        const onlyDiamonds = offerItems.length > 0 && offerItems.every(item => item.name === '💎 Diamonds');
        
        // If offer contains only diamonds, submit directly without modal
        if (onlyDiamonds) {
          const trade = trades.get(messageId);
          if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

          // Check if user is the trade host
          if (trade.host.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot make an offer on your own trade!', flags: 64 });
          }

          // Add offer to trade
          trade.offers.push({
            user: interaction.user,
            diamonds: offerItems.reduce((sum, item) => sum + item.quantity, 0),
            items: [],
            timestamp: Date.now()
          });

          // Update trade embed to show grid layout
          await updateTradeEmbed(interaction.guild, trade, messageId);

          // Notify host of new offer
          const channel = interaction.guild.channels.cache.get(trade.channelId);
          if (channel) {
            await channel.send(`📢 <@${trade.host.id}>, you received an offer from <@${interaction.user.id}>!`);
          }

          await interaction.reply({ content: `Offer submitted! Host will accept or decline.`, flags: 64 });
          return;
        }
        
        // Move to diamonds and submit
        const diamondsModal = new ModalBuilder()
          .setCustomId(`offer_submit_modal_${messageId}`)
          .setTitle('Complete Your Offer');

        // Only show diamonds input if not already added
        if (!hasDiamonds) {
          const diamondsInput = new TextInputBuilder()
            .setCustomId('offer_diamonds')
            .setLabel('Diamonds (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0')
            .setRequired(false);

          const row1 = new ActionRowBuilder().addComponents(diamondsInput);
          diamondsModal.addComponents(row1);
        }
        
        // Store items in interaction metadata
        interaction.user.offerItems = offerItems;
        interaction.user.messageId = messageId;
        delete interaction.user.offerTradeItems;
        delete interaction.user.selectedOfferItems;
        delete interaction.user.selectedOfferCategory;
        delete interaction.user.selectedOfferSubcategory;
        delete interaction.user.selectedOfferMessageId;

        await interaction.showModal(diamondsModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.offerTradeItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_remove_item_select_${messageId}`)
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(Math.min(100, items.length));

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId.startsWith('offer_remove_item_select_')) {
      const messageId = interaction.customId.replace('offer_remove_item_select_', '');
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.offerTradeItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.offerTradeItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`offer_continue_select_${messageId}`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Confirm and Proceed', value: 'confirm_items' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        const itemsList = formatItemsList(items);

        await interaction.reply({ 
          content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
          components: [row], 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'inventory_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
	          { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' },
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'continue_to_setup') {
        // Load previous inventory data to pre-fill modal
        const previousInventory = inventories.get(interaction.user.id);
        
        // Check if diamonds are already added as items
        const hasDiamonds = (interaction.user.inventoryItems || []).some(item => item.name === '💎 Diamonds');
        
        // Move to inventory setup modal
        const inventoryModal = new ModalBuilder()
          .setCustomId('inventory_setup_modal')
          .setTitle('Complete Your Inventory');

        // Only show diamonds input if not already added as items
        if (!hasDiamonds) {
          const diamondsInput = new TextInputBuilder()
            .setCustomId('inv_diamonds')
            .setLabel('Diamonds in stock (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0')
            .setValue(previousInventory ? previousInventory.diamonds.toString() : '0')
            .setRequired(false);

          const row1 = new ActionRowBuilder().addComponents(diamondsInput);
          inventoryModal.addComponents(row1);
        }

        const lookingForInput = new TextInputBuilder()
          .setCustomId('inv_looking_for')
          .setLabel('What are you looking for?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe what items/diamonds you\'re looking for')
          .setValue(previousInventory ? previousInventory.lookingFor : '')
          .setRequired(true);

        const robloxInput = new TextInputBuilder()
          .setCustomId('inv_roblox_username')
          .setLabel('Roblox username (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('YourRobloxUsername')
          .setValue(previousInventory ? previousInventory.robloxUsername : '')
          .setRequired(false);

        const row2 = new ActionRowBuilder().addComponents(lookingForInput);
        const row3 = new ActionRowBuilder().addComponents(robloxInput);

        if (!hasDiamonds) {
          inventoryModal.addComponents(row2, row3);
        } else {
          inventoryModal.addComponents(row2, row3);
        }
        
        delete interaction.user.selectedInventoryItems;
        delete interaction.user.selectedInventoryCategory;
        delete interaction.user.selectedInventorySubcategory;

        await interaction.showModal(inventoryModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.inventoryItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(1);

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId === 'inventory_remove_item_select') {
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.inventoryItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.inventoryItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`inventory_continue_select`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        const currentPage = interaction.user.currentInventoryPage || 1;
        const totalPages = Math.ceil(items.length / 15);
        const start = (currentPage - 1) * 15;
        const end = start + 15;
        const pageItems = items.slice(start, end);
        const itemsList = formatItemsList(pageItems);

        const embed = new EmbedBuilder()                                                        //\nWhat would you like to do
          .setDescription(`**Selected Items (Page ${currentPage}/${totalPages}):**\n${itemsList}\n`)
          .setColor(0x00a8ff);

        const components = [row];
        if (totalPages > 1) {
          const paginationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('inventory_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
            new ButtonBuilder().setCustomId('inventory_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
          );
          components.push(paginationRow);
        }

        await interaction.reply({ 
          embeds: [embed],
          components, 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'giveaway_continue_select') {
      const choice = interaction.values[0];

      if (choice === 'add_category') {
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_category_select')
          .setPlaceholder('Select another item category')
          .addOptions([
            { label: 'Diamonds', value: 'diamonds', emoji: '💎' },
            { label: 'Huges', value: 'huges', emoji: '🔥' },
            { label: 'Exclusives', value: 'exclusives', emoji: '✨' },
            { label: 'Eggs', value: 'eggs', emoji: '🥚' },
            { label: 'Gifts', value: 'gifts', emoji: '🎁' }
          ]);

        const row = new ActionRowBuilder().addComponents(categorySelect);
        await interaction.reply({ content: 'Select another item category:', components: [row], flags: 64 });
      } else if (choice === 'create_giveaway') {
        // Move to giveaway setup modal
        const giveawayModal = new ModalBuilder()
          .setCustomId('giveaway_setup_modal')
          .setTitle('Create Your Giveaway');

        const descriptionInput = new TextInputBuilder()
          .setCustomId('gwa_description')
          .setLabel('Giveaway Description (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe the giveaway...')
          .setRequired(false);

        const durationInput = new TextInputBuilder()
          .setCustomId('gwa_duration')
          .setLabel('Duration (max 24 hours / 86400 seconds)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 60m, 1h, 3600s, or 1440')
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(descriptionInput);
        const row2 = new ActionRowBuilder().addComponents(durationInput);

        giveawayModal.addComponents(row1, row2);
        
        delete interaction.user.selectedGiveawayItems;
        delete interaction.user.selectedGiveawayCategory;
        delete interaction.user.selectedGiveawaySubcategory;

        await interaction.showModal(giveawayModal);
      } else if (choice === 'remove_items') {
        // Show items to remove
        const items = interaction.user.giveawayItems || [];
        if (items.length === 0) {
          return await interaction.reply({ content: 'No items to remove.', flags: 64 });
        }

        const { StringSelectMenuBuilder } = require('discord.js');
        
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_remove_item_select')
          .setPlaceholder('Select items to remove')
          .setMinValues(1)
          .setMaxValues(Math.min(100, items.length));

        items.forEach((item, index) => {
          const emoji = getItemEmoji(item.name);
          removeSelect.addOptions({
            label: `${formatItemName(item.name)} (x${item.quantity})`,
            value: `${index}`
          });
        });

        const row = new ActionRowBuilder().addComponents(removeSelect);
        await interaction.reply({ content: 'Select items to remove:', components: [row], flags: 64 });
      }
    }

    if (interaction.customId === 'giveaway_remove_item_select') {
      const indices = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const items = interaction.user.giveawayItems || [];

      // Remove items in reverse order to maintain correct indices
      indices.forEach(index => {
        if (index >= 0 && index < items.length) {
          items.splice(index, 1);
        }
      });

      if (items.length === 0) {
        await interaction.reply({ content: 'All items removed. Please add items again.', flags: 64 });
        delete interaction.user.giveawayItems;
      } else {
        // Redisplay the continue select
        const { StringSelectMenuBuilder } = require('discord.js');
        
        const continueSelect = new StringSelectMenuBuilder()
          .setCustomId(`giveaway_continue_select`)
          .setPlaceholder('What would you like to do?')
          .addOptions([
            { label: '✅ Create Giveaway', value: 'create_giveaway' },
            { label: '➕ Add Another Category', value: 'add_category' },
            { label: '❌ Remove Items', value: 'remove_items' }
          ]);

        const row = new ActionRowBuilder().addComponents(continueSelect);
        
        const currentPage = interaction.user.currentGiveawayPage || 1;
        const totalPages = Math.ceil(items.length / 15);
        const start = (currentPage - 1) * 15;
        const end = start + 15;
        const pageItems = items.slice(start, end);
        const itemsList = formatItemsList(pageItems);

        const embed = new EmbedBuilder()                                                        //\nWhat would you like to do
          .setDescription(`**Selected Items (Page ${currentPage}/${totalPages}):**\n${itemsList}\n`)
          .setColor(0xFF1493);

        const components = [row];
        if (totalPages > 1) {
          const paginationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('giveaway_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
            new ButtonBuilder().setCustomId('giveaway_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
          );
          components.push(paginationRow);
        }

        await interaction.reply({ 
          embeds: [embed],
          components, 
          flags: 64 
        });
      }
    }

    if (interaction.customId === 'inventory_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      if (category === 'diamonds') {
        const diamondsModal = new ModalBuilder()
          .setCustomId('inventory_diamonds_modal')
          .setTitle('Add Diamonds');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('inv_diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      } else if (category === 'huges') {
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('inventory_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(itemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = itemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'inventory_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = itemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('inventory_item_select_')) {
      const parts = interaction.customId.replace('inventory_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      // Store items selection - no longer limited to 25
      interaction.user.selectedInventoryItems = selectedItems;
      interaction.user.selectedInventoryCategory = category;
      interaction.user.selectedInventorySubcategory = subcategory;

      const quantityModal = new ModalBuilder()
        .setCustomId(`inventory_item_quantities_modal`)
        .setTitle('Select Quantities');

      const quantitiesInput = new TextInputBuilder()
        .setCustomId('inv_quantities')
        .setLabel(`Quantities for ${selectedItems.length} items (comma separated)`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1,2,3,... (one per item)')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(quantitiesInput);
      quantityModal.addComponents(row);

      await interaction.showModal(quantityModal);
    }

    if (interaction.customId === 'giveaway_category_select') {
      const category = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      if (category === 'diamonds') {
        
        // Show modal for diamonds input
        const diamondsModal = new ModalBuilder()
          .setCustomId('giveaway_diamonds_modal')
          .setTitle('Add Diamonds to Giveaway');

        const diamondsInput = new TextInputBuilder()
          .setCustomId('giveaway_diamonds_amount')
          .setLabel('Amount of Diamonds')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., 5000, 10K, 1M')
          .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(diamondsInput);
        diamondsModal.addComponents(row1);

        await interaction.showModal(diamondsModal);
        return;
      }
      
      if (category === 'huges') {
        const subcategorySelect = new StringSelectMenuBuilder()
          .setCustomId('giveaway_huge_subcategory_select')
          .setPlaceholder('Select a Huge subcategory')
          .addOptions(Object.keys(giveawayItemCategories.huges).map(sub => ({
            label: sub,
            value: sub
          })));
        const row = new ActionRowBuilder().addComponents(subcategorySelect);
        await interaction.reply({ content: `Select a subcategory from **Huges**:`, components: [row], flags: 64 });
        return;
      }
      
      const items = giveawayItemCategories[category];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_item_select_${category}`)
        .setPlaceholder(`Select items from ${category}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${category}** category:`, components: [row], flags: 64 });
    }

    if (interaction.customId === 'giveaway_huge_subcategory_select') {
      const subcategory = interaction.values[0];
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const items = giveawayItemCategories.huges[subcategory];
      const itemSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_item_select_huges_${subcategory}`)
        .setPlaceholder(`Select items from ${subcategory}`)
        .setMaxValues(Math.min(items.length, 100))
        .addOptions(items.map(item => ({ 
          label: formatItemName(item), 
          value: item,
          emoji: getItemEmoji(item)
        })));

      const row = new ActionRowBuilder().addComponents(itemSelect);
      await interaction.reply({ content: `Select items from **${subcategory}**:`, components: [row], flags: 64 });
    }

    if (interaction.customId.startsWith('giveaway_item_select_')) {
      const parts = interaction.customId.replace('giveaway_item_select_', '').split('_');
      let category = parts[0];
      let subcategory = parts.length > 1 ? parts.slice(1).join('_') : null;
      
      const selectedItems = interaction.values;

      // Store items selection - no longer limited to 25
      interaction.user.selectedGiveawayItems = selectedItems;
      interaction.user.selectedGiveawayCategory = category;
      interaction.user.selectedGiveawaySubcategory = subcategory;

      const quantityModal = new ModalBuilder()
        .setCustomId(`giveaway_item_quantities_modal`)
        .setTitle('Select Quantities');

      const quantitiesInput = new TextInputBuilder()
        .setCustomId('gwa_quantities')
        .setLabel(`Quantities for ${selectedItems.length} items (comma separated)`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1,2,3,... (one per item)')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(quantitiesInput);
      quantityModal.addComponents(row);

      await interaction.showModal(quantityModal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'trade_diamonds_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.tradeItems) {
        interaction.user.tradeItems = [];
      }

      // Check if diamonds already exist, if so replace quantity instead of adding
      const existingDiamondsIndex = interaction.user.tradeItems.findIndex(item => item.name === '💎 Diamonds');
      if (existingDiamondsIndex !== -1) {
        interaction.user.tradeItems[existingDiamondsIndex].quantity = diamonds;
      } else {
        interaction.user.tradeItems.push({ name: `💎 Diamonds`, quantity: diamonds });
      }

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const currentPage = interaction.user.currentTradePage || 1;
      const totalPages = Math.ceil((interaction.user.tradeItems || []).length / 15);
      const start = (currentPage - 1) * 15;
      const end = start + 15;
      const pageItems = (interaction.user.tradeItems || []).slice(start, end);
      const itemsList = formatItemsList(pageItems);

      const embed = new EmbedBuilder()
        .setDescription(`**Selected Items (Page ${currentPage}/${totalPages}):**\n${itemsList}\n\nWhat would you like to do?`)
        .setColor(0x0099ff);

      const components = [row];
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('trade_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
          new ButtonBuilder().setCustomId('trade_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
        );
        components.push(paginationRow);
      }

      await interaction.reply({ 
        embeds: [embed],
        components, 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'trade_remove_item_select') {
      const indicesToRemove = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      
      indicesToRemove.forEach(idx => {
        if (interaction.user.tradeItems && interaction.user.tradeItems[idx]) {
          interaction.user.tradeItems.splice(idx, 1);
        }
      });

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const currentPage = interaction.user.currentTradePage || 1;
      const totalPages = Math.ceil((interaction.user.tradeItems || []).length / 15);
      const start = (currentPage - 1) * 15;
      const end = start + 15;
      const pageItems = (interaction.user.tradeItems || []).slice(start, end);
      const itemsList = pageItems.length > 0 ? formatItemsList(pageItems) : 'No items selected';

      const embed = new EmbedBuilder()
        .setDescription(`**Selected Items (Page ${currentPage}/${totalPages}):**\n${itemsList}\n\nWhat would you like to do?`)
        .setColor(0x0099ff);

      const components = [row];
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('trade_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
          new ButtonBuilder().setCustomId('trade_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
        );
        components.push(paginationRow);
      }

      await interaction.reply({ 
        embeds: [embed],
        components, 
        flags: 64 
      });
    }

    if (interaction.customId.startsWith('offer_diamonds_modal_')) {
      const messageId = interaction.customId.replace('offer_diamonds_modal_', '');
      const diamondsStr = interaction.fields.getTextInputValue('offer_diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.offerTradeItems) {
        interaction.user.offerTradeItems = [];
      }

      // Check if diamonds already exist, if so replace quantity instead of adding
      const existingDiamondsIndex = interaction.user.offerTradeItems.findIndex(item => item.name === '💎 Diamonds');
      if (existingDiamondsIndex !== -1) {
        interaction.user.offerTradeItems[existingDiamondsIndex].quantity = diamonds;
      } else {
        interaction.user.offerTradeItems.push({ name: `💎 Diamonds`, quantity: diamonds });
      }

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_continue_select_${messageId}`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.offerTradeItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'inventory_diamonds_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('inv_diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (!interaction.user.inventoryItems) {
        interaction.user.inventoryItems = [];
      }

      // Check if diamonds already exist, if so replace quantity instead of adding
      const existingDiamondsIndex = interaction.user.inventoryItems.findIndex(item => item.name === '💎 Diamonds');
      if (existingDiamondsIndex !== -1) {
        interaction.user.inventoryItems[existingDiamondsIndex].quantity = diamonds;
      } else {
        interaction.user.inventoryItems.push({ name: `💎 Diamonds`, quantity: diamonds });
      }

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.inventoryItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'trade_item_quantities_modal') {
      const selectedItems = interaction.user.selectedTradeItems || [];
      const category = interaction.user.selectedTradeCategory;
      const subcategory = interaction.user.selectedTradeSubcategory;

      // Process quantities
      const quantitiesStr = interaction.fields.getTextInputValue('quantities');
      const quantities = quantitiesStr.split(',').map(q => parseInt(q.trim()) || 1);
      if (quantities.length !== selectedItems.length) {
        return interaction.reply({ content: `Please provide exactly ${selectedItems.length} quantities separated by commas.`, flags: MessageFlags.Ephemeral });
      }
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = Math.max(1, quantities[index]);
        return { name: item, quantity: qty };
      });

      // Store in user's session
      if (!interaction.user.tradeItems) {
        interaction.user.tradeItems = [];
      }
      interaction.user.tradeItems = interaction.user.tradeItems.concat(itemsWithQty);

      // Show option to add more categories or proceed
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('trade_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const ITEMS_PER_PAGE = 15;
      const totalPages = Math.ceil(interaction.user.tradeItems.length / ITEMS_PER_PAGE);
      interaction.user.currentTradePage = 1;
      const currentPage = 1;
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageItems = interaction.user.tradeItems.slice(start, end);
      const itemsList = formatItemsList(pageItems);
      const description = `**Selected Items (Page ${currentPage}/${totalPages}):**\n${itemsList}\n\nWhat would you like to do?`;

      const embed = new EmbedBuilder().setDescription(description);
      const components = [row];
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('trade_page_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
          new ButtonBuilder().setCustomId('trade_page_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
        );
        components.push(paginationRow);
      }

      await interaction.reply({ 
        embeds: [embed],
        components, 
        flags: 64 
      });
      return;
    }

    if (interaction.customId.startsWith('offer_item_quantities_modal_')) {
      const messageId = interaction.customId.replace('offer_item_quantities_modal_', '');
      const selectedItems = interaction.user.selectedOfferItems || [];
      const category = interaction.user.selectedOfferCategory;
      const subcategory = interaction.user.selectedOfferSubcategory;

      // Process quantities
      const quantitiesStr = interaction.fields.getTextInputValue('offer_quantities');
      const quantities = quantitiesStr.split(',').map(q => parseInt(q.trim()) || 1);
      if (quantities.length !== selectedItems.length) {
        return interaction.reply({ content: `Please provide exactly ${selectedItems.length} quantities separated by commas.`, flags: MessageFlags.Ephemeral });
      }
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = Math.max(1, quantities[index]);
        return { name: item, quantity: qty };
      });

      // Store in user's session
      if (!interaction.user.offerTradeItems) {
        interaction.user.offerTradeItems = [];
      }
      interaction.user.offerTradeItems = interaction.user.offerTradeItems.concat(itemsWithQty);

      // Show option to add more categories or proceed
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`offer_continue_select_${messageId}`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Confirm and Proceed', value: 'confirm_items' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.offerTradeItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'inventory_item_quantities_modal') {
      const selectedItems = interaction.user.selectedInventoryItems || [];
      const category = interaction.user.selectedInventoryCategory;
      const subcategory = interaction.user.selectedInventorySubcategory;

      // Process quantities
      const quantitiesStr = interaction.fields.getTextInputValue('inv_quantities');
      const quantities = quantitiesStr.split(',').map(q => parseInt(q.trim()) || 1);
      if (quantities.length !== selectedItems.length) {
        return interaction.reply({ content: `Please provide exactly ${selectedItems.length} quantities separated by commas.`, flags: MessageFlags.Ephemeral });
      }
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = Math.max(1, quantities[index]);
        return { name: item, quantity: qty };
      });

      if (!interaction.user.inventoryItems) {
        interaction.user.inventoryItems = [];
      }
      interaction.user.inventoryItems = interaction.user.inventoryItems.concat(itemsWithQty);

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`inventory_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Continue to Next Step', value: 'continue_to_setup' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.inventoryItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'giveaway_item_quantities_modal') {
      const selectedItems = interaction.user.selectedGiveawayItems || [];
      const category = interaction.user.selectedGiveawayCategory;
      const subcategory = interaction.user.selectedGiveawaySubcategory;

      // Process quantities
      const quantitiesStr = interaction.fields.getTextInputValue('gwa_quantities');
      const quantities = quantitiesStr.split(',').map(q => parseInt(q.trim()) || 1);
      if (quantities.length !== selectedItems.length) {
        return interaction.reply({ content: `Please provide exactly ${selectedItems.length} quantities separated by commas.`, flags: MessageFlags.Ephemeral });
      }
      const itemsWithQty = selectedItems.map((item, index) => {
        const qty = Math.max(1, quantities[index]);
        return { name: item, quantity: qty };
      });

      if (!interaction.user.giveawayItems) {
        interaction.user.giveawayItems = [];
      }
      interaction.user.giveawayItems = interaction.user.giveawayItems.concat(itemsWithQty);

      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId(`giveaway_continue_select`)
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Create Giveaway', value: 'create_giveaway' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.giveawayItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
      return;
    }

    if (interaction.customId === 'inventory_setup_modal') {
  const diamondsStr = interaction.fields.fields.has('inv_diamonds') ? interaction.fields.getTextInputValue('inv_diamonds') : '0';
  const lookingFor = interaction.fields.getTextInputValue('inv_looking_for') || 'Not specified';
  const robloxInput = interaction.fields.getTextInputValue('inv_roblox_username') || '';

  let diamonds = 0;
  if (diamondsStr && diamondsStr !== '0') {
    diamonds = parseBid(diamondsStr);
  }

  // --- USERNAME TO ID CONVERSION LOGIC ---
  let robloxId = null;
  if (robloxInput) {
    // If input is only numbers, treat as ID. If not, search for ID by Name.
    if (!isNaN(robloxInput)) {
      robloxId = robloxInput;
    } else {
      // Helper function to get ID by name (see below)
      robloxId = await getRobloxId(robloxInput);
    }
  }

  const inventoryItems = interaction.user.inventoryItems || [];
  delete interaction.user.inventoryItems;
  // ... (rest of your deletes)

  // Logic to delete previous inventory...
  const previousInventory = inventories.get(interaction.user.id);
  if (previousInventory) {
    try {
      const channel = interaction.guild.channels.cache.get(previousInventory.channelId);
      const message = await channel.messages.fetch(previousInventory.messageId);
      await message.delete();
    } catch (e) {}
  }

  // Criar o embed
  const embed = new EmbedBuilder()
    .setTitle('📦 Inventory')
    .setColor(0x00a8ff)
    .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
    .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

  // AUTHOR CONFIGURATION (Roblox Avatar)
  if (robloxId && robloxId !== 'null' && robloxId !== '' && !isNaN(robloxId)) {
    // Fetch user's Roblox avatar
    const avatarUrl = await getRobloxAvatarUrl(robloxId);
    
    if (avatarUrl) {
      console.log(`Loading Roblox avatar for user ${interaction.user.username} with ID ${robloxId}: ${avatarUrl}`);
      
      embed.setAuthor({ 
        name: interaction.member.displayName, 
        iconURL: avatarUrl 
      });
    } else {
      // If failed to get Roblox avatar, use Discord avatar
      console.log(`Failed to fetch Roblox avatar for ID ${robloxId}, using Discord avatar`);
      embed.setAuthor({ 
        name: interaction.member.displayName, 
        iconURL: interaction.user.displayAvatarURL() 
      });
    }
  } else {
    if (robloxInput) {
      console.log(`Failed to load Roblox avatar for username: ${robloxInput} (resolved ID: ${robloxId})`);
    }
    embed.setAuthor({ 
      name: interaction.member.displayName, 
      iconURL: interaction.user.displayAvatarURL() 
    });
  }

  // Rest of embed filling...
  const itemsText = formatItemsText(inventoryItems);
  embed.addFields({ 
    name: `Items${diamonds > 0 ? ` + ${formatBid(diamonds)} 💎` : 'None'}`,
    value: itemsText,
    inline: true
  });

  embed.addFields({ name: 'Looking For', value: lookingFor, inline: true });

  const now = new Date();
  // Adjust to GMT-5 (UTC-5)
  const gmt5Time = new Date(now.getTime() - (5 * 60 * 60 * 1000));
  const timeStr = `${gmt5Time.getDate()}/${gmt5Time.getMonth() + 1}/${gmt5Time.getFullYear()} at ${gmt5Time.getHours().toString().padStart(2, '0')}:${gmt5Time.getMinutes().toString().padStart(2, '0')}`;
  embed.addFields({ name: 'Last Edited', value: timeStr, inline: false });

  // Buttons and sending...
  const updateButton = new ButtonBuilder()
    .setCustomId('inventory_update_button')
    .setLabel('Update Inventory')
    .setStyle(ButtonStyle.Primary);

  const deleteButton = new ButtonBuilder()
    .setCustomId('inventory_delete_button')
    .setLabel('Delete Items')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(updateButton, deleteButton);
  const targetChannel = redirectInventoryChannelId ? interaction.guild.channels.cache.get(redirectInventoryChannelId) : interaction.channel;
  const message = await targetChannel.send({ embeds: [embed], components: [row] });

  // Salvar dados
  const inventoryData = {
    messageId: message.id,
    channelId: targetChannel.id,
    items: inventoryItems,
    diamonds: diamonds,
    lookingFor: lookingFor,
    robloxUsername: robloxInput, // guarda o que o user digitou
    lastEdited: gmt5Time
  };
  inventories.set(interaction.user.id, inventoryData);
}

// HELPER FUNCTION (Place outside interaction event)
async function getRobloxId(username) {
  try {
    if (!username || username.trim() === '') return null;
    
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: true })
    });
    
    if (!response.ok) {
      console.error(`Roblox API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    if (data.data && data.data.length > 0 && data.data[0].id) {
      return data.data[0].id;
    }
    return null;
  } catch (e) {
    console.error('Error fetching Roblox ID:', e);
    return null;
  }
}

// Function to get Roblox avatar using official API
async function getRobloxAvatarUrl(userId) {
  try {
    if (!userId || isNaN(userId)) return null;
    
    const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`;
    console.log(`Fetching Roblox avatar from API: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`Roblox API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Check if API returned data
    if (data.data && data.data.length > 0) {
      const avatarData = data.data[0];
      
      // Check if state is "Completed" and if there's imageUrl
      if (avatarData.state === 'Completed' && avatarData.imageUrl) {
        console.log(`✅ Avatar URL successfully obtained for user ${userId}`);
        return avatarData.imageUrl;
      } else {
        console.log(`⚠️ Avatar state: ${avatarData.state}`);
        return null;
      }
    }
    
    console.log(`⚠️ No avatar data returned by API`);
    return null;
  } catch (e) {
    console.error('Error fetching Roblox avatar URL:', e.message);
    return null;
  }
}
  
    if (interaction.customId === 'giveaway_setup_modal') {
      const giveawayItems = interaction.user.giveawayItems || [];
      const description = interaction.fields.getTextInputValue('gwa_description') || '';
      const durationStr = interaction.fields.getTextInputValue('gwa_duration');
      
      // Validate duration
      let duration = parseDuration(durationStr);
      const MAX_DURATION_MINUTES = 1440; // 24 hours = 1440 minutes = 86400 seconds
      
      if (isNaN(duration) || duration < 1 || duration > MAX_DURATION_MINUTES) {
        return interaction.reply({ 
          content: `Invalid duration. Please enter a time between 1 second and 24 hours (1440 minutes or 86400 seconds). Examples: 60s, 30m, 1h, 1440, etc.`, 
          flags: MessageFlags.Ephemeral 
        });
      }
      
      delete interaction.user.giveawayItems;
      delete interaction.user.selectedGiveawayItems;
      delete interaction.user.selectedGiveawayCategory;
      delete interaction.user.selectedGiveawaySubcategory;

      // Create giveaway embed
      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway')
        .setDescription(description ? `**${description}**\n\n**Click the button below to enter the giveaway!**` : '**Click the button below to enter the giveaway!**')
        .setColor(0xFF1493)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      // Format giveaway items
      const giveawayItemsText = formatItemsText(giveawayItems);

      embed.addFields({
        name: 'Giveaway Items',
        value: giveawayItemsText,
        inline: false
      });

      embed.addFields({
        name: 'Hosted by',
        value: interaction.user.toString(),
        inline: false
      });

      // Add creator description if provided
      if (description) {
        embed.addFields({
          name: 'Description',
          value: description,
          inline: false
        });
      }

      // Add duration field
      embed.addFields({
        name: 'Time Remaining',
        value: 'Calculating...',
        inline: false
      });

      // Calculate duration text for the reply message
      const durationHours = Math.floor(duration / 60);
      const durationMins = duration % 60;
      let durationText = '';
      if (durationHours > 0) durationText += `${durationHours}h `;
      if (durationMins > 0) durationText += `${durationMins}m`;
      if (!durationText) durationText = duration + 'm';

      // Store durationText in user object temporarily for use after setInterval
      const replyMessage = `Giveaway created! Posted to the channel with role mention! Duration: ${durationText}`;

      const enterButton = new ButtonBuilder()
        .setCustomId(`giveaway_enter_${Date.now()}`)
        .setLabel('Enter Giveaway')
        .setStyle(ButtonStyle.Success);

      const entriesButton = new ButtonBuilder()
        .setCustomId(`giveaway_entries_${Date.now()}`)
        .setLabel('0 Entries')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false);

      const endButton = new ButtonBuilder()
        .setCustomId(`giveaway_end_${Date.now()}`)
        .setLabel('End Giveaway')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(enterButton, entriesButton, endButton);

      const targetChannel = redirectGiveawayChannelId ? interaction.guild.channels.cache.get(redirectGiveawayChannelId) : interaction.channel;
      
      // Send ping message with role mention
      await targetChannel.send(`<@&${config.giveawayRoleId}> **New Giveaway Started!**`);
      
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const expiresAt = Date.now() + (duration * 60 * 1000);
      const giveawayData = {
        host: interaction.user,
        items: giveawayItems,
        channelId: targetChannel.id,
        messageId: message.id,
        entries: [],
        duration: duration,
        expiresAt: expiresAt,
        updateInterval: null
      };

      giveaways.set(message.id, giveawayData);
      
      // Increment giveaway count for user
      const userId = interaction.user.id;
      userGiveawayCount.set(userId, (userGiveawayCount.get(userId) || 0) + 1);
      
      // Function to format remaining time
      const formatTimeRemaining = (expiresAt) => {
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        if (remaining <= 0) return 'Ending...';
        
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        
        let timeStr = '';
        if (hours > 0) timeStr += `${hours}h `;
        if (minutes > 0) timeStr += `${minutes}m `;
        timeStr += `${seconds}s`;
        return timeStr;
      };
      
      // Update embed every second
      const updateInterval = setInterval(async () => {
        try {
          const currentGiveaway = giveaways.get(message.id);
          if (!currentGiveaway) {
            clearInterval(updateInterval);
            return;
          }
          
          const remaining = Math.max(0, Math.ceil((currentGiveaway.expiresAt - Date.now()) / 1000));
          
          // Check if giveaway should end
          if (remaining <= 0) {
            clearInterval(updateInterval);
            giveaways.delete(message.id);
            userGiveawayCount.set(userId, Math.max(0, (userGiveawayCount.get(userId) || 1) - 1));
            
            // Auto-end the giveaway
            if (currentGiveaway.entries.length > 0) {
              const randomIndex = Math.floor(Math.random() * currentGiveaway.entries.length);
              const winner = currentGiveaway.entries[randomIndex];
              
              const endEmbed = new EmbedBuilder()
                .setTitle('🎁 Giveaway Ended!')
                .setColor(0xFF1493)
                .setFooter({ text: 'Version 1.0.9 | Made By Atlas' });
              
              // Winner field
              endEmbed.addFields({ name: 'Winner', value: `**${winner.user}**`, inline: false });
              
              const itemsText = currentGiveaway.items && currentGiveaway.items.length > 0 ? formatItemsText(currentGiveaway.items) : 'None';
              endEmbed.addFields({
                name: 'Giveaway Items',
                value: itemsText,
                inline: false
              });
              
              endEmbed.addFields({
                name: 'Total Entries',
                value: currentGiveaway.entries.length.toString(),
                inline: true
              });
              
              const channel = interaction.guild.channels.cache.get(currentGiveaway.channelId);
              if (channel) {
                await channel.send({ embeds: [endEmbed] });
                await channel.send(`🎉 Congratulations ${winner.user}! You won the giveaway!`);
              }
            }
            return;
          }
          
          // Update the embed with new time remaining
          const updatedEmbed = new EmbedBuilder()
            .setTitle('🎁 Giveaway')
            .setDescription(currentGiveaway.description ? `**${currentGiveaway.description}**\n\n**Click the button below to enter the giveaway!**` : '**Click the button below to enter the giveaway!**')
            .setColor(0xFF1493)
            .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
            .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
          
          const giveawayItemsText = formatItemsText(currentGiveaway.items);
          
          updatedEmbed.addFields({
            name: 'Giveaway Items',
            value: giveawayItemsText,
            inline: false
          });
          
          updatedEmbed.addFields({
            name: 'Hosted by',
            value: currentGiveaway.host.toString(),
            inline: false
          });
          
          updatedEmbed.addFields({
            name: 'Time Remaining',
            value: formatTimeRemaining(currentGiveaway.expiresAt),
            inline: false
          });
          
          // Update components with new entries count
          const entriesCount = currentGiveaway.entries.length;
          const enterBtn = new ButtonBuilder()
            .setCustomId(`giveaway_enter_${currentGiveaway.messageId}`)
            .setLabel('Enter Giveaway')
            .setStyle(ButtonStyle.Success);
          
          const entriesBtn = new ButtonBuilder()
            .setCustomId(`giveaway_entries_${currentGiveaway.messageId}`)
            .setLabel(`${entriesCount} ${entriesCount === 1 ? 'Entry' : 'Entries'}`)
            .setStyle(ButtonStyle.Secondary);
          
          const endBtn = new ButtonBuilder()
            .setCustomId(`giveaway_end_${currentGiveaway.messageId}`)
            .setLabel('End Giveaway')
            .setStyle(ButtonStyle.Danger);
          
          const row = new ActionRowBuilder().addComponents(enterBtn, entriesBtn, endBtn);
          
          await message.edit({ embeds: [updatedEmbed], components: [row] });
        } catch (error) {
          clearInterval(updateInterval);
          console.error('Error updating giveaway embed:', error);
        }
      }, 1000);
      
      giveawayData.updateInterval = updateInterval;

      await interaction.reply({ content: replyMessage, flags: 64 });
      return;
    }

    if (interaction.customId === 'trade_setup_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('trade_diamonds') || '0';
      const targetUsername = interaction.fields.getTextInputValue('trade_target_user') || '';

      let diamonds = 0;
      if (diamondsStr && diamondsStr !== '0') {
        diamonds = parseBid(diamondsStr);
      }

      const hostItems = interaction.user.tradeItems || [];
      delete interaction.user.tradeItems;
      delete interaction.user.selectedTradeItems;
      delete interaction.user.selectedTradeCategory;
      delete interaction.user.selectedTradeSubcategory;

      // Create trade embed
      const embed = new EmbedBuilder()
        .setTitle('Trade Offer')
        .setDescription(`**Host:** <@${interaction.user.id}>\n**Status:** Waiting for offers`)
        .setColor(0x0099ff)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      // Format host items with quantities
      const hostItemsText = formatItemsText(hostItems);
      
      embed.addFields({
        name: `Host Items${diamonds > 0 ? ` + ${formatBid(diamonds)} 💎` : ''}`,
        value: hostItemsText,
        inline: false
      });

      const offerButton = new ButtonBuilder()
        .setCustomId('trade_offer_button')
        .setLabel('Make Offer')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(offerButton, deleteButton);

      const targetChannel = redirectTradeChannelId ? interaction.guild.channels.cache.get(redirectTradeChannelId) : interaction.channel;
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      const trade = {
        host: interaction.user,
        hostDiamonds: diamonds,
        hostItems: hostItems,
        offers: [],
        channelId: targetChannel.id,
        messageId: message.id,
        accepted: false,
        acceptedUser: null,
        targetUsername: targetUsername
      };

      trades.set(message.id, trade);

      // Increment trade count for user
      const currentCount = userTradeCount.get(interaction.user.id) || 0;
      userTradeCount.set(interaction.user.id, currentCount + 1);

      await interaction.reply({ content: `Trade offer created in ${targetChannel}! ${targetUsername ? `Awaiting response from ${targetUsername}.` : 'Open for all users.'}`, flags: 64 });
      return;
    }

    if (interaction.customId.startsWith('offer_submit_modal_')) {
      const messageId = interaction.customId.replace('offer_submit_modal_', '');
      const diamondsStr = interaction.fields.getTextInputValue('offer_diamonds') || '0';

      let diamonds = 0;
      if (diamondsStr && diamondsStr !== '0') {
        diamonds = parseBid(diamondsStr);
      }

      const offerItems = interaction.user.offerItems || [];
      delete interaction.user.offerItems;
      delete interaction.user.messageId;

      const trade = trades.get(messageId);
      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      // Check if user is the trade host
      if (trade.host.id === interaction.user.id) {
        return interaction.reply({ content: '❌ You cannot make an offer on your own trade!', flags: 64 });
      }

      // Add offer to trade
      trade.offers.push({
        user: interaction.user,
        diamonds: diamonds,
        items: offerItems,
        timestamp: Date.now()
      });

      // Update trade embed to show grid layout
      await updateTradeEmbed(interaction.guild, trade, messageId);

      // Notify host of new offer
      const channel = interaction.guild.channels.cache.get(trade.channelId);
      if (channel) {
        await channel.send(`📢 <@${trade.host.id}>, you received an offer from <@${interaction.user.id}>!`);
      }

      await interaction.reply({ content: `Offer submitted! Host will accept or decline.`, flags: 64 });
      return;
    }

    if (interaction.customId === 'bid_modal') {
      const auction = Array.from(auctions.values()).find(a => a.channelId === interaction.channel.id);
      if (!auction) return sendErrorReply(interaction, 'E16');

      // Check if user is the auction host
      if (auction.host.id === interaction.user.id) {
        return interaction.reply({ content: '❌ You cannot bid on your own auction!', flags: MessageFlags.Ephemeral });
      }

      const diamondsStr = interaction.fields.getTextInputValue('diamonds');
      const items = interaction.fields.getTextInputValue('items') || '';

      let diamonds = 0;
      if (diamondsStr) {
        diamonds = parseBid(diamondsStr);
      }

      if (auction.model === 'items' && diamonds > 0) return sendErrorReply(interaction, 'E49', 'This auction is offers only');
      if (auction.model === 'diamonds' && items) return sendErrorReply(interaction, 'E49', 'This auction is diamonds only');
      if (auction.model === 'diamonds' && diamonds === 0) return sendErrorReply(interaction, 'E11');
      if (auction.model === 'items' && !items) return sendErrorReply(interaction, 'E11');

      // Additional check for 'both' model: if there's a previous bid with only diamonds, don't allow adding diamonds
      if (auction.model === 'both' && diamonds > 0 && auction.bids.some(bid => bid.diamonds > 0 && !bid.items)) {
        return interaction.reply({ content: 'Since there\'s already a bid with only diamonds, you can only add items to your bid.', flags: MessageFlags.Ephemeral });
      }

      // Check if bid is higher than current max
      const maxBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
      if (auction.model !== 'items' && diamonds <= maxBid) return interaction.reply({ content: `Your bid must be higher than the current highest bid of ${formatBid(maxBid)} 💎.`, flags: MessageFlags.Ephemeral });

      auction.bids.push({ user: interaction.user, diamonds, items, timestamp: Date.now() });
      interaction.reply(`Bid placed: ${diamonds > 0 ? `${formatBid(diamonds)} 💎` : ''}${items ? ` and ${items}` : ''}`);
    }

    if (interaction.customId === 'auction_modal') {
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const startingPriceStr = interaction.fields.getTextInputValue('starting_price');
      const model = interaction.fields.getTextInputValue('model').toLowerCase();

      if (!['diamonds', 'items', 'both'].includes(model)) return interaction.reply({ content: 'Invalid model. Use diamonds, items/offer, or both.', flags: MessageFlags.Ephemeral });
      const time = 60; // Fixed to 60 seconds
      const startingPrice = parseBid(startingPriceStr);
      if (isNaN(startingPrice) || startingPrice < 0) return interaction.reply({ content: 'Invalid starting price.', flags: MessageFlags.Ephemeral });

      if (auctions.size > 0) {
        return interaction.reply({ content: 'An auction is already running in the server. Please wait for it to end.', flags: MessageFlags.Ephemeral });
      }

      const auction = {
        host: interaction.user,
        title,
        description,
        model,
        time,
        startingPrice,
        bids: [],
        started: new Date(),
        channelId: interaction.channel.id
      };

      const targetChannel = redirectChannelId ? interaction.guild.channels.cache.get(redirectChannelId) : interaction.channel;
      if (!targetChannel) return interaction.reply({ content: 'Redirect channel not found.', flags: MessageFlags.Ephemeral });

      // Send ping message first
      await targetChannel.send('-# ||<@&1461741243427197132>||');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`${description}\n\n**Looking For:** ${model}\n**Starting Price:** ${formatBid(startingPrice)} 💎\n**Current Bid:** ${formatBid(startingPrice)} 💎\n**Time Remaining:** ${time}s\n**Hosted by:** ${interaction.user}`)
        .setColor(0x00ff00)
        .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
        .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('bid_button')
            .setLabel('Bid')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('view_bids_button')
            .setLabel('View Bids')
            .setStyle(ButtonStyle.Secondary)
        );

      const message = await targetChannel.send({ embeds: [embed], components: [row] });
      auction.messageId = message.id;
      auction.channelId = targetChannel.id;
      auctions.set(targetChannel.id, auction);

      await interaction.reply({ content: `Auction "${title}" started in ${targetChannel}!`, flags: MessageFlags.Ephemeral });

      // Start timer
      auction.timer = setTimeout(async () => {
        clearInterval(auction.updateInterval);
        await endAuction(targetChannel);
      }, time * 1000);

      // Update embed every second
      auction.updateInterval = setInterval(async () => {
        const remaining = Math.max(0, Math.ceil((auction.started.getTime() + auction.time * 1000 - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(auction.updateInterval);
          return;
        }
        const currentBid = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.diamonds)) : auction.startingPrice;
        const updatedEmbed = new EmbedBuilder()
          .setTitle(auction.title)
          .setDescription(`${auction.description}\n\n**Looking For:** ${auction.model}\n**Starting Price:** ${formatBid(auction.startingPrice)} 💎\n**Current Bid:** ${formatBid(currentBid)} 💎\n**Time Remaining:** ${remaining}s\n**Hosted by:** ${auction.host}`)
          .setColor(0x00ff00)
          .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
          .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');
        try {
          await message.edit({ embeds: [updatedEmbed], components: [row] });
        } catch (e) {
          // ignore if message deleted
        }
      }, 1000);
    }

    if (interaction.customId.startsWith('proof_image_modal_trade_')) {
      const messageId = interaction.customId.replace('proof_image_modal_trade_', '');
      const description = interaction.fields.getTextInputValue('proof_description') || '';
      const trade = trades.get(messageId);

      if (!trade) return sendErrorReply(interaction, 'E07', 'Trade not found');

      // Check if user has attachments
      if (interaction.message && interaction.message.attachments.size > 0) {
        // User needs to upload image via button with attachments
        return interaction.reply({ 
          content: '❌ Please use the file upload feature. Reply to this message with an image attachment.',
          flags: MessageFlags.Ephemeral 
        });
      }

      // For now, show instruction
      await interaction.reply({
        content: '📸 Please attach the proof image to your next message in this channel.\n\nAfter you send the image, the proof will be automatically forwarded to the records channel.',
        ephemeral: false
      });

      // Store waiting state
      interaction.user.waitingForProof = {
        tradeMessageId: messageId,
        description: description,
        type: 'trade'
      };
    }

    if (interaction.customId === 'proof_image_modal_auction') {
      const description = interaction.fields.getTextInputValue('proof_description') || '';

      // Show instruction
      await interaction.reply({
        content: '📸 Please attach the proof image to your next message in this channel.\n\nAfter you send the image, the proof will be automatically forwarded to the records channel.',
        ephemeral: false
      });

      // Store waiting state
      interaction.user.waitingForProof = {
        auctionProofMessageId: interaction.message?.id || null,
        description: description,
        type: 'auction'
      };
    }

    if (interaction.customId.startsWith('proof_image_modal_giveaway_')) {
      const messageId = interaction.customId.replace('proof_image_modal_giveaway_', '');
      const imageUrl = interaction.fields.getTextInputValue('proof_image_url') || '';
      const description = interaction.fields.getTextInputValue('proof_description') || '';
      const giveawayData = finishedGiveaways.get(messageId);

      if (!giveawayData) {
        return sendErrorReply(interaction, 'E36', 'Giveaway not found');
      }

      // Validate URL
      if (!imageUrl) {
        return interaction.reply({ content: '❌ Please provide a valid image URL.', flags: MessageFlags.Ephemeral });
      }

      try {
        const channel = interaction.guild.channels.cache.get(giveawayData.channelId);
        if (!channel) {
          return interaction.reply({ content: '❌ Giveaway channel not found.', flags: MessageFlags.Ephemeral });
        }

        // Fetch the original giveaway message
        const giveawayMessage = await channel.messages.fetch(messageId);
        if (!giveawayMessage) {
          return interaction.reply({ content: '❌ Giveaway message not found.', flags: MessageFlags.Ephemeral });
        }

        // Update thumbnail of the giveaway embed
        if (giveawayMessage.embeds.length > 0) {
          const updatedEmbed = EmbedBuilder.from(giveawayMessage.embeds[0])
            .setThumbnail(imageUrl);
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
        }

        // Send proof to records channel
        const proofChannelId = '1462197194646880368';
        const proofChannel = interaction.guild.channels.cache.get(proofChannelId);

        if (proofChannel) {
          const proofEmbed = new EmbedBuilder()
            .setTitle('🎁 Giveaway Proof')
            .setDescription(`**Host:** ${giveawayData.host}\n**Winner:** ${giveawayData.winner}\n\n**Note:** ${description || 'No description provided'}`)
            .setColor(0xFF1493)
            .setImage(imageUrl)
            .setFooter({ text: `Submitted by ${interaction.user.username}` })
            .setTimestamp();

          await proofChannel.send({ embeds: [proofEmbed] });
        }

        await interaction.reply({ content: '✅ Proof image has been submitted and the giveaway thumbnail updated!', flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error('Error processing giveaway proof:', error);
        await interaction.reply({ content: '❌ Error processing proof image.', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.customId === 'giveaway_diamonds_modal') {
      const diamondsStr = interaction.fields.getTextInputValue('giveaway_diamonds_amount');
      const diamonds = parseBid(diamondsStr);

      if (diamonds <= 0) {
        return interaction.reply({ content: 'Please enter a valid amount of diamonds.', flags: MessageFlags.Ephemeral });
      }

      // Store diamonds as item
      if (!interaction.user.giveawayItems) {
        interaction.user.giveawayItems = [];
      }
      
      // Check if diamonds already exist, if so replace quantity instead of adding
      const existingDiamondsIndex = interaction.user.giveawayItems.findIndex(item => item.name === '💎 Diamonds');
      if (existingDiamondsIndex !== -1) {
        interaction.user.giveawayItems[existingDiamondsIndex].quantity = diamonds;
      } else {
        interaction.user.giveawayItems.push({ name: '💎 Diamonds', quantity: diamonds });
      }

      // Show continue select
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const continueSelect = new StringSelectMenuBuilder()
        .setCustomId('giveaway_continue_select')
        .setPlaceholder('What would you like to do?')
        .addOptions([
          { label: '✅ Create Giveaway', value: 'create_giveaway' },
          { label: '➕ Add Another Category', value: 'add_category' },
          { label: '❌ Remove Items', value: 'remove_items' }
        ]);

      const row = new ActionRowBuilder().addComponents(continueSelect);
      
      const itemsList = formatItemsList(interaction.user.giveawayItems);

      await interaction.reply({ 
        content: `**Selected Items:**\n${itemsList}\n\nWhat would you like to do?`,
        components: [row], 
        flags: 64 
      });
    }
  }
});

async function updateTradeEmbed(guild, trade, messageId) {
  if (!guild) return;
  
  try {
    const channel = guild.channels.cache.get(trade.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId);
    if (!message) return;

    // Create embed with grid layout
    const embed = new EmbedBuilder()
      .setTitle('Trade Offer')
      .setColor(trade.accepted ? 0x00ff00 : 0x0099ff)
      .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
      .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

    if (trade.accepted) {
      if (trade.adminCancelled) {
        embed.setDescription(`**Status:** ❌ Cancelled by an admin\n\n**Host:** <@${trade.host.id}>`);
      } else {
        embed.setDescription(`**Status:** ✅ Trade Accepted\n\n**Host:** <@${trade.host.id}>\n**Guest:** <@${trade.acceptedUser.id}>`);
      }
    } else if (trade.offers.length > 0) {
      embed.setDescription(`**Status:** Awaiting Host Decision\n\n**Host:** <@${trade.host.id}>`);
    } else {
      embed.setDescription(`**Status:** Waiting for offers\n\n**Host:** <@${trade.host.id}>`);
    }

    const hostItemsText = formatItemsText(trade.hostItems);
    embed.addFields({
      name: `Host${trade.hostDiamonds > 0 ? ` (+ ${formatBid(trade.hostDiamonds)} 💎)` : ''}`,
      value: hostItemsText,
      inline: true
    });

    if (trade.offers.length > 0 && !trade.accepted) {
      const lastOffer = trade.offers[trade.offers.length - 1];
      const guestItemsText = formatItemsText(lastOffer.items);
      embed.addFields({
        name: `${lastOffer.user.displayName || lastOffer.user.username}${lastOffer.diamonds > 0 ? ` (+ ${formatBid(lastOffer.diamonds)} 💎)` : ''}`,
        value: guestItemsText,
        inline: true
      });
    } else if (trade.accepted) {
      const acceptedOffer = trade.offers.find(o => o.user.id === trade.acceptedUser.id);
      if (acceptedOffer) {
        const guestItemsText = formatItemsText(acceptedOffer.items);
        embed.addFields({
          name: `${acceptedOffer.user.displayName || acceptedOffer.user.username}${acceptedOffer.diamonds > 0 ? ` (+ ${formatBid(acceptedOffer.diamonds)} 💎)` : ''}`,
          value: guestItemsText,
          inline: true
        });
      }
    }

    let components = [];

    if (!trade.accepted && trade.offers.length > 0) {
      const acceptButton = new ButtonBuilder()
        .setCustomId(`trade_accept_${messageId}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success);

      const declineButton = new ButtonBuilder()
        .setCustomId(`trade_decline_${messageId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(acceptButton, declineButton));
    } else if (trade.accepted) {
      // Add Upload Proof Image button for accepted trades
      const proofButton = new ButtonBuilder()
        .setCustomId(`upload_proof_trade_${messageId}`)
        .setLabel('Upload Proof Image')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(proofButton, deleteButton));
    } else if (!trade.accepted) {
      const offerButton = new ButtonBuilder()
        .setCustomId('trade_offer_button')
        .setLabel('Make Offer')
        .setStyle(ButtonStyle.Primary);

      const deleteButton = new ButtonBuilder()
        .setCustomId(`trade_delete_${Date.now()}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      components.push(new ActionRowBuilder().addComponents(offerButton, deleteButton));
    }

    await message.edit({ embeds: [embed], components });
  } catch (e) {
    console.error('Error updating trade embed:', e);
  }
}

async function endAuction(channel) {
  const auction = auctions.get(channel.id);
  if (!auction) return;

  clearTimeout(auction.timer);
  clearInterval(auction.updateInterval);
  auctions.delete(channel.id);

  if (auction.bids.length === 0) {
    return channel.send('Auction ended with no bids.');
  }

  // Find winner: highest diamonds, if tie, first bid
  auction.bids.sort((a, b) => b.diamonds - a.diamonds || auction.bids.indexOf(a) - auction.bids.indexOf(b));
  const winner = auction.bids[0];

  // Update the active embed with winner and red color
  try {
    const message = await channel.messages.fetch(auction.messageId);
    const finalEmbed = new EmbedBuilder()
      .setTitle(auction.title)
      .setDescription(`${auction.description}\n\n**Looking For:** ${auction.model}\n**Starting Price:** ${formatBid(auction.startingPrice)} 💎\n**Winning Bid:** ${formatBid(winner.diamonds)} 💎${winner.items ? ` and ${winner.items}` : ''}\n**Winner:** ${winner.user}\n**Hosted by:** ${auction.host}`)
      .setColor(0xff0000) // Red color
      .setFooter({ text: 'Version 1.0.9 | Made By Atlas' })
      .setThumbnail('https://media.discordapp.net/attachments/1461378333278470259/1461514275976773674/B2087062-9645-47D0-8918-A19815D8E6D8.png?ex=696ad4bd&is=6969833d&hm=2f262b12ac860c8d92f40789893fda4f1ea6289bc5eb114c211950700eb69a79&=&format=webp&quality=lossless&width=1376&height=917');

    await message.edit({ embeds: [finalEmbed], components: [] }); // Remove buttons
  } catch (e) {
    console.error('Error updating auction embed:', e);
  }

  const embed = new EmbedBuilder()
    .setTitle('Auction Ended!')
    .setDescription(`**Title:** ${auction.title}\n**Winner:** ${winner.user}\n**Bid:** ${winner.diamonds} 💎${winner.items ? ` and ${winner.items}` : ''}`)
    .setColor(0xff0000)
    .setFooter({ text: 'Version 1.0.9 | Made By Atlas' });

  // Add Upload Proof Image button
  const proofButton = new ButtonBuilder()
    .setCustomId(`upload_proof_auction_${channel.id}`)
    .setLabel('Upload Proof Image')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(proofButton);

  const proofMessage = await channel.send({ embeds: [embed], components: [row] });

  // Store finished auction data for proof handler
  finishedAuctions.set(proofMessage.id, {
    host: auction.host,
    title: auction.title,
    winner: winner.user,
    diamonds: winner.diamonds,
    items: winner.items,
    channelId: channel.id,
    auctionChannelId: '1461849894615646309'
  });
}

client.login(process.env.TOKEN);
