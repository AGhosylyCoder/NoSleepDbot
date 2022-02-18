const Discord = require("discord.js")
const perspective = require('./perspective.js');

require("dotenv").config()

const generateImage = require("./generateImage")

const client = new Discord.Client({
    intents: [
        "GUILDS",
        "GUILD_MESSAGES",
        "GUILD_MEMBERS"
    ]
})

// Set your emoji "awards" here
const emojiMap = {
    'FLIRTATION': '💋',
    'TOXICITY': '🧨',
    'INSULT': '👊',
    'INCOHERENT': '🤪',
    'SPAM': '🐟',
}
  
  // Store some state about user karma.
  // TODO: Migrate to a DB, like Firebase
const users = {}
  

/**
 * Kick bad members out of the guild
 * @param {user} user - user to kick
 * @param {guild} guild - guild to kick user from
 */
async function kickBaddie(user, guild) {
  const member = guild.member(user);
  if (!member) return;
  try {
    await member.kick('Was a jerk');
  } catch (err) {
    console.log(`Could not kick user ${user.username}: ${err}`);
  }
}

/**
 * Analyzes a user's message for attribues
 * and reacts to it.
 * @param {string} message - message the user sent
 * @return {bool} shouldKick - whether or not we should
 * kick the users
 */
async function evaluateMessage(message) {
  let scores;
  try {
    scores = await perspective.analyzeText(message.content);
  } catch (err) {
    console.log(err)
    return false
  }

  const userid = message.author.id;

  for (const attribute in emojiMap) {
    if (scores[attribute]) {
      if(emojiMap[attribute]=='🧨')
      {
        message.delete()
          .then(msg => msg.reply(`Woah there @${msg.author.username}, chill out!`))
          .catch(console.error)
      }
      users[userid][attribute] =
                users[userid][attribute] ?
                users[userid][attribute] + 1 : 1
    }
  }
  // Return whether or not we should kick the user
  return (users[userid]['TOXICITY'] > process.env.KICK_THRESHOLD)
}

/**
 * Writes current user scores to the channel
 * @return {string} karma - printable karma scores
 */
function getKarma() {
  const scores = []
  for (const user in users) {
    if (!Object.keys(users[user]).length) continue
    let score = `<@${user}> - `
    for (const attr in users[user]) {
      score += `${emojiMap[attr]} : ${users[user][attr]}\t`
    }
    scores.push(score)
  }
  console.log(scores)
  if (!scores.length) {
    return '';
  }
  return scores.join('\n')
}


let bot = {
    client, 
    prefix: "!",
    owners: ["862249744067198986"]
}

client.commands = new Discord.Collection()
client.events = new Discord.Collection()
client.slashcommands = new Discord.Collection()
client.buttons = new Discord.Collection()

client.loadEvents = (bot, reload) => require("./handlers/events")(bot, reload)
client.loadCommands = (bot, reload) => require("./handlers/commands")(bot, reload)
client.loadSlashCommands = (bot, reload) => require("./handlers/slashcommands")(bot, reload)
client.loadButtons = (bot, reload) => require("./handlers/buttons")(bot, reload)

client.loadEvents(bot, false)
client.loadCommands(bot, false)
client.loadSlashCommands(bot, false)
client.loadButtons(bot, false)

client.on("interactionCreate", (interaction) => {
    if (!interaction.isCommand()) return 
    if (!interaction.inGuild()) return interaction.reply("This command can only be used in a server")

    const slashcmd = client.slashcommands.get(interaction.commandName)

    if (!slashcmd) return interaction.reply("Invalid slash command")

    if (slashcmd.perm && !interaction.member.permissions.has(slashcmd.perm))
        return interaction.reply("You do not have permission for this command")

    slashcmd.run(client, interaction)
})

client.on('message', async (message) => {
  // Ignore messages that aren't from a guild
  // or are from a bot
  if (!message.guild || message.author.bot) return

  // If we've never seen a user before, add them to memory
  const userid = message.author.id
  if (!users[userid]) {
    users[userid] = []
  }

  // Evaluate attributes of user's message
  let shouldKick = false
  try {
    shouldKick = await evaluateMessage(message)
  } catch (err) {
    console.log(err)
  }
  if (shouldKick) {
    kickBaddie(message.author, message.guild)
    delete users[message.author.id]
    message.channel.send(`Watch your language ${message.author.username}!`)
    return
  }


  if (message.content.startsWith('!karma')) {
    const karma = getKarma(message)
    message.channel.send(karma ? karma : 'No karma yet!')
  }
})


module.exports = bot

const welcomeChannelId = "935413324835848202"

client.on("guildMemberAdd", async (member) => {
    const img = await generateImage(member)
    member.guild.channels.cache.get(welcomeChannelId).send({
        content: `<@${member.id}> Welcome to the server!`,
        files: [img]
    })
})

client.login(process.env.DISCORD_TOKEN)
