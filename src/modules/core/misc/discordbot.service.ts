import {
  ActivityType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Message,
  Partials,
  APIEmbedField
} from 'discord.js'
import logger from 'node-color-log'
import { CoreService } from '../core.service'

export class DiscordBot {
  client: Client<boolean>
  self: CoreService

  constructor(self: CoreService) {
    this.self = self

    this.handleMessage = this.handleMessage.bind(this)
  }

  async _sendNode(originalMessage: Message, did: string, footer: string) {
    const nodeScores = await this.self.gateway.scoring.nodeScore(did)
    const nodeOwner = await this.self.gateway.clusterNodes.findOne({
        id: did,
    })
    const embedFields:Array<APIEmbedField> = []
    logger.info(nodeScores)
    for(let field in nodeScores) {
        embedFields.push({
            name: field,
            value: `\`${nodeScores[field]}\``,
            inline: true
        })
    }
    embedFields.push({
        name: "peer_id",
        value: nodeOwner.peer_id
    })
    embedFields.push({
        name: "Name",
        value: nodeOwner.name
    })
    embedFields.push({
        name: "last_seen",
        value: `${nodeOwner.last_seen.toISOString()}`
    })
    embedFields.push({
        name: "first_seen",
        value: `${nodeOwner.first_seen.toISOString()}`
    })
    embedFields.push({
        name: "Hive owner",
        value: `${nodeOwner.cryptoAccounts.hive}`
    })
    const embed = new EmbedBuilder()
    embed.setColor(0x0099ff).setTitle('Encoder Status').addFields(...embedFields)
    embed.setFooter({
        text: footer
    })
    originalMessage.channel.send({ content: 'Encoder Status', embeds: [embed], })
  }

  async handleMessage(msg: Message<boolean>) {
    if (msg.content.startsWith('!status')) {
      const [origin, arg] = msg.content.split(' ')

      const embedFields:Array<APIEmbedField> = []
      if (arg?.startsWith('z6') && arg.length > 32) {
        const did = `did:key:${arg}`
        //DID identity
        const nodeScores = await this.self.gateway.scoring.nodeScore(did)
        const nodeOwner = await this.self.gateway.clusterNodes.findOne({
            id: did,
        })
        logger.info(nodeScores)
        for(let field in nodeScores) {
            embedFields.push({
                name: field,
                value: `\`${nodeScores[field]}\``,
                inline: true
            })
        }
        embedFields.push({
            name: "peer_id",
            value: nodeOwner.peer_id
        })
        embedFields.push({
            name: "Name",
            value: nodeOwner.name
        })
        embedFields.push({
            name: "last_seen",
            value: `${nodeOwner.last_seen.toISOString()}`
        })
        embedFields.push({
            name: "first_seen",
            value: `${nodeOwner.first_seen.toISOString()}`
        })
        embedFields.push({
            name: "Hive owner",
            value: `${nodeOwner.cryptoAccounts.hive}`
        })
        const embed = new EmbedBuilder()
        embed.setColor(0x0099ff).setTitle('Encoder Status').addFields(...embedFields)
        msg.channel.send({ content: 'Encoder Status', embeds: [embed] })
      } else {
        //Hive username

        const nodes = await this.self.gateway.clusterNodes.find({
            "cryptoAccounts.hive": arg
        }).toArray()
        
        let x = 1;
        for(let node of nodes) {
            await this._sendNode(msg, node.id, `${x} of ${nodes.length}`)
            x = x + 1;
        }
      }
    }
  }

  async start() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
      ],
      partials: [Partials.Channel],
    })
    if(this.self.config.get('discordbot.token')) {
        await this.client.login(this.self.config.get('discordbot.token'))
        await this.client.user.setPresence({
          activities: [{ name: 'Encoding Videos!' }],
          status: 'online',
        })
        this.client.on('messageCreate', this.handleMessage)
    }
  }
}
