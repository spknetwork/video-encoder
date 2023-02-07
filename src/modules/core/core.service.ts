import { TileDocument } from '@ceramicnetwork/stream-tile'
import ThreeIdProvider from '3id-did-provider'
import { CeramicClient } from '@ceramicnetwork/http-client'
import ThreeIdResolver from '@ceramicnetwork/3id-did-resolver'
import { DID } from 'dids'
import { IDX } from '@ceramicstudio/idx'
import  * as IPFSHTTP from 'ipfs-http-client'
import {IPFSHTTPClient} from 'ipfs-http-client'
import { ConfigService } from '../../config.service'
import {Lib2pService} from '../libp2p/libp2p.service'
import { EncoderService } from './encoder.service'
import { GatewayService } from './gateway.service'
import { Config } from './config.service'
import os from 'os'
import path from 'path'
import { IdentityService } from './identity.service'
import { GatewayClient } from './gatewayClient.service'
import { DiscordBot } from './misc/discordbot.service'

const idxAliases = {
  rootPosts: 'ceramic://kjzl6cwe1jw147fikhkjs9qysmv6dkdsu5i6zbgk4x9p47gt9uedru1755y76dg',
}
export class CoreService {
  idx: IDX
  ipfs: IPFSHTTPClient
  p2pService: Lib2pService
  encoder: EncoderService
  gateway: GatewayService
  config: Config
  identityService: IdentityService
  gatewayClient: GatewayClient
  discordBot: DiscordBot

  constructor(readonly ceramic: CeramicClient) {
    this.encoder = new EncoderService(this)
  }
  
  
  async start() {
    this.config = new Config(path.join(os.homedir(), '.spk-encoder'));
    await this.config.open()

    this.identityService = new IdentityService(this)
    this.identityService.start();

    this.idx = new IDX({
      autopin: true,
      ceramic: this.ceramic,
      aliases: idxAliases,
    })

    this.ipfs = IPFSHTTP.create({ host: ConfigService.getConfig().ipfsHost })

    this.p2pService = new Lib2pService(this)
    await this.p2pService.start()
    this.encoder.start()

    this.gateway = new GatewayService(this)
    await this.gateway.start()

    this.gatewayClient = new GatewayClient(this)
    await this.gatewayClient.start()

    this.discordBot = new DiscordBot(this)
    await this.discordBot.start()
  }

  async stop() {


    await this.gatewayClient.stop()
    await this.gateway.stop()
  }
}
