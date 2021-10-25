import Libp2p from 'libp2p'

import TCP from 'libp2p-tcp'
import MPLEX  from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import MulticastDNS  from 'libp2p-mdns'
import Bootstrap from 'libp2p-bootstrap'
import DHT from 'libp2p-kad-dht'
import PeerId from 'peer-id'

import { CoreService } from '../core/core.service'
import { decode, encode } from './frame-codec.util'
import { MESSAGE_TYPES } from './messages.model'
import pipe from 'it-pipe'
import Pushable from 'it-pushable'

const PEERINFO =  {
  id: 'QmctF7GPunpcLu3Fn77Ypo657TA9GpTiipSDUUMoD2k5Kq',
  privKey: 'CAASpwkwggSjAgEAAoIBAQC90BTfJW9ZDNic30Xkr4acCgEZWRmczeT/KVsecK98/qaTm4nvenHzuqXnh+CuBj1UKqHFjifTz6jy1oCSlJEEJgki0N/Vt/9Dkn/bn8Vjts/5M1ZlYbNfPJx6yEaWDClGz43rXtlHXKiwufPJ4dwPKQQZv4EshOEptAhO2913GB8D7/8bkaAlT+bwG+76jG5XkG9Pp0cHytOZWPBFYYRomOnAfDNRmbAK3lF0oyBXPuOd64AB9P/+wVrGrobKOZO5AiQkfBi0lYqx153tZ8CA5JxpPBLcmRoKxMA9Bmar7DjrVBi8fba1x4d3PufLzPwBIFVLV5mpkGMbtgQL74TNAgMBAAECggEAAcCTAMBat8q7kS8qeQL5ziT1f6Nn7h+kdoqOMci+hfvf08sCyfgqZyKY93s0osah+E3wcl9ulLD9EUjTpQbEE/K58N1Ww6VQMPKARanC67m7T8Sejo8JVd68XxHMPQRduS6fU8XrYZJEaGU/D+UK4ATz6bzv11ZescDctsWm1LubLwQ2RPOfAFPCYI0MYFPamw+py6/3JP0w5uBETrUy+izNraQ560bnqC4fMjkmy+KpuTUk+YFW1JPgPbpw960ZoEhfSBWpRiSpMJ3EByn04xxkumzpAvaffN2JDpypHn2jyAmMqiWHTacJC2Maz/X9KpT5Tj+0UkE9lQBVicG1oQKBgQDykEEwqD4r63O5Wi0JY02WdFOEDaeYIgX9FA7wsIfCrLlJIVOR2HXUL+f0qK8MeddvL/dnIkp+0pndO9RQYb66L9lWBstEJ/gUHuTe7SS05r9bOwMEH8l3V4u0qAqn/O0ZKmPUJhrATsUY2gUitvtE8hOeE1bh2g77vPAMsAff5QKBgQDIU8emmyXGVk/SDlkiyYB1VPLuEkj1KHuuSz9Xmvu9xG3dXZzB15MsN0zycUEUsgylJTqvPJ/It+o2Mvk7A1IZsO9xQUI9JdHKqWS4rwaDvtcKrAxxYf2RJQmvsrkAoSKNe9Oe2FCTu+rdTFe6eZxYdPebMn9rPUjFoNGV/44yyQKBgB5Zfk6gPmcwZqJibhAmpKaWl3yGWNnoJ+eqgtQKwnHROr2ztckh1FxgQh2SnZRqClKXJdV5rOiBYU8VFVOZZ0vUgNUKtJQqjBe4ZdqewWEBHiBEGfSCJasRASHxhKPQObpUW3lH60D0miSp4sqdKoNN5rZ4pP5NUmKdGUv9Gn8hAoGAW/qzwdicqIt6zNzPqnxQog7mF8+HdiEnYKimJchAbCpjs29HCW284mFl0C+WDTWPPshwQIOabeOcA1S2QJVOvgMSfbLUAhV6VQ4f8/hRCm62d+z1LZ4redhCsUxjS1mw7rt7OATkQmDW/tMNuM4brjXOdpDiFlAmOK+Va8TR+pkCgYEAwKBtzUnY7dLJL8yI5feS+DkHvn4MdGMPGqcdug6mkTXOJZdxbvF99dt7czP8fYc5acB4wsSeKUlGjgzNxU7/c6Verao1jl3Yxl+UrMkoruZCf4HIMbYgtoSCbMaoH83/M3xqWtUBAVdYnikAjEptl0HM1nReB63uwT90Y4iSxsU=',
  pubKey: 'CAASpgIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC90BTfJW9ZDNic30Xkr4acCgEZWRmczeT/KVsecK98/qaTm4nvenHzuqXnh+CuBj1UKqHFjifTz6jy1oCSlJEEJgki0N/Vt/9Dkn/bn8Vjts/5M1ZlYbNfPJx6yEaWDClGz43rXtlHXKiwufPJ4dwPKQQZv4EshOEptAhO2913GB8D7/8bkaAlT+bwG+76jG5XkG9Pp0cHytOZWPBFYYRomOnAfDNRmbAK3lF0oyBXPuOd64AB9P/+wVrGrobKOZO5AiQkfBi0lYqx153tZ8CA5JxpPBLcmRoKxMA9Bmar7DjrVBi8fba1x4d3PufLzPwBIFVLV5mpkGMbtgQL74TNAgMBAAE='
}

export class Lib2pService {
    self: CoreService
    libp2p: Libp2p

    constructor(self) {
      this.self = self;

      this.connectionHandler = this.connectionHandler.bind(this)
    }

    async subscribeClient() {

    }
    async connectionHandler({ connection, stream, protocol }) {
      console.log(connection)
      const pushable = Pushable()
      pipe(pushable, stream.sink)
      let listener;
      for await (const item of stream.source) {
        const decodedMessage = decode(item._bufs[0])
        console.log(decodedMessage)
        
        if(decodedMessage.type === MESSAGE_TYPES.SUBSCRIBE_UPDATE) {
          listener = this.self.encoder.events.on('job.progress', (streamId, statusUpdate) => {
            console.log('rxl is receiving update')
            console.log(streamId, decodedMessage.streamId)
            if(streamId === decodedMessage.streamId) {
              console.log(statusUpdate)
              pushable.push(encode({
                type: MESSAGE_TYPES.STATUS_UPDATE,
                statusUpdate
              }))
            }
          })
        }
        if(decodedMessage.type === MESSAGE_TYPES.UNSUBSCRIBE_UPDATE) {
          
        }
        if(decodedMessage.type === MESSAGE_TYPES.REQUEST_ENCODE_JOB) {
          console.log(stream)
          console.log(connection)
          
          const data = await this.self.encoder.createJob(decodedMessage.ipfsHash, connection.remotePeer.toString())

          pushable.push(encode({
            type: MESSAGE_TYPES.RESPONE_ENCODE_JOB,
            streamId: data.streamId
          }))
          this.self.encoder.executeJob(data.streamId)

        }
      }
      //this.self.encoder.events.off
      //clear event listeners
      console.log('stream is ending')
    }

    async start() {
        const idListener = await PeerId.createFromJSON(PEERINFO)
        console.log('P2P interface starting up')
        this.libp2p = await Libp2p.create({
            peerId: idListener,
            modules: {
              transport: [TCP],
              streamMuxer: [MPLEX],
              connEncryption: [NOISE],
              peerDiscovery: [MulticastDNS, Bootstrap],
              dht: DHT
            },
            addresses: {
                listen: ['/ip4/10.0.1.188/tcp/14445/']
            },
            config: {
                peerDiscovery: {
                  autoDial: true,             // Auto connect to discovered peers (limited by ConnectionManager minConnections)
                  // The `tag` property will be searched when creating the instance of your Peer Discovery service.
                  // The associated object, will be passed to the service when it is instantiated.
                  [MulticastDNS.tag]: {
                    interval: 1000,
                    enabled: true
                  },
                  [Bootstrap.tag]: {
                    list: [ // A list of bootstrap peers to connect to starting up the node
                      "/ip4/104.131.131.82/tcp/4001/ipfs/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
                      "/dnsaddr/bootstrap.libp2p.io/ipfs/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
                      "/dnsaddr/bootstrap.libp2p.io/ipfs/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
                    ],
                    interval: 2000,
                    enabled: true
                  }
                  // .. other discovery module options.
                },
                dht: {                        // The DHT options (and defaults) can be found in its documentation
                    kBucketSize: 20,
                    enabled: true,              // This flag is required for DHT to run (disabled by default)
                    randomWalk: {
                      enabled: true,            // Allows to disable discovery (enabled by default)
                      interval: 300e3,
                      timeout: 10e3
                    }
                  }
              }
          })

        // start libp2p
        await this.libp2p.start()
        console.log(this.libp2p.addresses)
        setInterval(() => {
            console.log(this.libp2p.connections.size)
        }, 5000)
        const handler = async ({ connection, stream, protocol }) => {
            // use stream or connection according to the needs
            console.log(connection, stream, protocol)
            for await (const item of stream.source) {
                console.log(item)
                console.log(decode(item._bufs[0]))
            }
          }
          
        this.libp2p.handle('/spk-video-encoder/1.0.0', this.connectionHandler)
        this.libp2p.dialProtocol(this.libp2p.peerId, '/spk-video-encoder/1.0.0')
    }
}