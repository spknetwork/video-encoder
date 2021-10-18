import { TileDocument } from '@ceramicnetwork/stream-tile'
import ThreeIdProvider from '3id-did-provider'
import { CeramicClient } from '@ceramicnetwork/http-client'
import ThreeIdResolver from '@ceramicnetwork/3id-did-resolver'
import { DID } from 'dids'
import { IDX } from '@ceramicstudio/idx'
import  IPFSHTTP from 'ipfs-http-client'
import {IPFSHTTPClient} from 'ipfs-http-client'
import { ConfigService } from '../../config.service'
import {Lib2pService} from '../libp2p/libp2p.service'
import { EncoderService } from './encoder.service'

const idxAliases = {
  rootPosts: 'ceramic://kjzl6cwe1jw147fikhkjs9qysmv6dkdsu5i6zbgk4x9p47gt9uedru1755y76dg',
}
export class CoreService {
  _threeId
  idx: IDX
  ipfs: IPFSHTTPClient
  p2pService: Lib2pService
  encoder: EncoderService



  constructor(readonly ceramic: CeramicClient) {
    this.encoder = new EncoderService(this)
  }


  async start() {

    console.log(ThreeIdProvider)
    this._threeId = await ThreeIdProvider.create({
      ceramic: this.ceramic,
      did: 'did:3:kjzl6cwe1jw147v2fzxjvpbvjp87glksoi2p698t6bbhuv2cuc3vie7kcopvyfb',
      // Seed is randomly generated so we can safely expose it publicly.
      seed: Uint8Array.from([
        86, 151, 157, 124, 159, 113, 140, 212, 127, 91, 246, 26, 219, 239, 93, 63, 129, 86, 224,
        171, 246, 28, 8, 4, 188, 0, 114, 194, 151, 239, 176, 253,
      ]),
      getPermission: (request) => {
        return request.payload.paths
      },
    })

    const did = new DID({
      provider: this._threeId.getDidProvider(),
      resolver: ThreeIdResolver.getResolver(this.ceramic),
    })
    await did.authenticate()
    await this.ceramic.setDID(did)
    console.log(this._threeId.getDidProvider())
    console.log(did.id)
    this.idx = new IDX({
      autopin: true,
      ceramic: this.ceramic,
      aliases: idxAliases,
    })
    this.ipfs = new IPFSHTTP({ host: ConfigService.getConfig().ipfsHost })

    this.p2pService = new Lib2pService(this)
    await this.p2pService.start()
    this.encoder.start()
  }
}
