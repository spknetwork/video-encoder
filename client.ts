import Libp2p from 'libp2p'

import TCP from 'libp2p-tcp'
import MPLEX  from 'libp2p-mplex'
import { NOISE } from 'libp2p-noise'
import MulticastDNS  from 'libp2p-mdns'
import Bootstrap from 'libp2p-bootstrap'
import DHT from 'libp2p-kad-dht'
import PeerId from 'peer-id'
import { CeramicClient } from '@ceramicnetwork/http-client'

import Pushable from 'it-pushable'
import {pipe} from 'it-pipe'

import {decode, encode} from './src/modules/libp2p/frame-codec.util'
import { MESSAGE_TYPES } from './src/modules/libp2p/messages.model'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { EncodeStatus } from './src/modules/encoder.model'
import logUpdate from 'log-update';
import logger from 'node-color-log'
import cli from 'cli-ux'


const ClientKey =
{
    id: 'Qmc9qsUzsCMyeCwxh5DPer5sNtUXXz1RxCf8BD7U1j2CuG',
    privKey: 'CAASpwkwggSjAgEAAoIBAQDQb2mb/sBeJG6bjL9rR2t9YXUvlpb4b5m1vulNUydWlbeumJhg6foqiK3dC8x1g8h8LY5nP5HITc6r6L22/K1xYFj4+rRsJCf8xoB9eYUCjWAuKh07kRbj95JJGoi9AiW//XUEGmkPcKpb9aB3ocxwgyqTkPKtga1Xh+hkTaRg/Nwuc0CRnaxoyUFV/jbIEfLvvkURecAQOsxm80SVcHS4lZL8Kcq9BEu+Ui8Ien6EdkSGDtgwxum1UUn8DOBNWN/geQ88n0ch6raVPk2YNWwVdcX32caXddwKd5RdXEiOHG5osvwFgUf8RG3M5AUU6Anh5Aong/erqf5zmjcbK+blAgMBAAECggEAbARA27myoVcKBwxyqrrRZqGZ5DaLOGZFZx1vtEXSjhl6nj2wQhEfNumsCHCz3XaU8F1/fdxAxWglIYu0vV7G14mRsj3iQGSgYGvSbLQMDR2M6X+jtJnlHfDP25inoiO5wnwsJxs0tO6zKoLpTPYJh4lCCEVGrkoUtdbVxR1DgYq4RX2KX4RHPmmbxinMupQGAIC8FPZqtzhONKInK5fVN1kZFZ3uZ79JTrFvX7ZHbDcOi5IZzm+4J7+z8ZfZv95gfmwlXugKIUThyIIJSVL8rg7LwioxJTfDBt2MT/Kr6guxVnaFY00FV44x9RHkSDZdKkwtRsy/4cFC2PggU/wU4QKBgQD/TsquSnjhcwW/o3QRHHILyVB7yAiXHHgO/dwGYDVWnkcl2in5aG6ob8UXzGafk6tYJZ/14SDiAmWSnl0TqPihEisAsL0EPEe0jRbt6sOi5GKz93M9+f33ONx40bxEGZNC+VLfvjUjU2V9kNbat5nR0W6K7oHz0sguCFzUd0gTOQKBgQDRABYzEeK0brLDoXKR/4cVsN/Luznhq/UM3W5hGfmSahEoRXTDfHnUzIlpckK3U6MoHXbPjbG5V4VOFfuh+zdCtj1yCuO5LMjBg7RGooU5sqKM2ZMb2CByt5jG8nAxOSZg+TtfjZUlzv33h2vR+FeEf42kpamSMPVBszGtWilVDQKBgHXSwfzfh5vb/morn/QJoaRI2ujVLwm17L5Wb8VNfzAjSYhxf2+Hv5HiSx4pia7ZcnjynDjYFdnX61JX3XKmR1/mR4xBBGpA+4KanltcPb8eEWMmrruKdKc0SaNEf9MZznlZIOL7IADWiv8A6fb0RnurYI2jdru0qgd8eoLfLZcZAoGAesjYQeySCXq3XyMsUgWS8PVWpTQ7Tw9dCc/VFwrRimjx53zWmjo4wQHhAKf19goW4mxc7pbKAJ8gW72idYlG79RsyOEI5DMhRj7/3DeCmWEPCjyQpl0UwxCFmuu3adOvbm09qmddZjbzEUbn2xVRJTBioIYK1y4YCB8kYjmD6skCgYEAsxSXWogFc1mCEdNUBNruRf0ZxPjgDj+qBKaaZ4P6Nr7qxAIv1O09xnIGc8XMtN9ywutyIsf7+YcofpC3bHqFmke8wysTW/Ggwb+6BTCSQwXaGUQFN0BmRyQEmuI4rkZ+0ynqgtz3lH5Kk5H6/pzxQ3PCM2as7OfFR7L0Dte6X/w=',
    pubKey: 'CAASpgIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDQb2mb/sBeJG6bjL9rR2t9YXUvlpb4b5m1vulNUydWlbeumJhg6foqiK3dC8x1g8h8LY5nP5HITc6r6L22/K1xYFj4+rRsJCf8xoB9eYUCjWAuKh07kRbj95JJGoi9AiW//XUEGmkPcKpb9aB3ocxwgyqTkPKtga1Xh+hkTaRg/Nwuc0CRnaxoyUFV/jbIEfLvvkURecAQOsxm80SVcHS4lZL8Kcq9BEu+Ui8Ien6EdkSGDtgwxum1UUn8DOBNWN/geQ88n0ch6raVPk2YNWwVdcX32caXddwKd5RdXEiOHG5osvwFgUf8RG3M5AUU6Anh5Aong/erqf5zmjcbK+blAgMBAAE='
  }
  
void (async () => {
    logger.info('P2P interface starting up')
    const ceramic = new CeramicClient('https://ceramic-clay.3boxlabs.com') //Using the public node for now.
    const idListener = await PeerId.createFromJSON(ClientKey)
    const libp2p = await Libp2p.create({
        peerId: idListener,
        modules: {
          transport: [TCP],
          streamMuxer: [MPLEX],
          connEncryption: [NOISE],
          peerDiscovery: [MulticastDNS, Bootstrap],
          dht: DHT
        },
        addresses: {
            listen: ['/ip4/10.0.1.188/tcp/14446']
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
    await libp2p.start()
    logger.info('LibP2P Peer ID', libp2p.peerId.toJSON())
    const handler = async ({ connection, stream, protocol }) => {
        // use stream or connection according to the needs
        logger.info(connection, stream, protocol)
        for await(let item of stream.source) {
          logger.info(item)
        }
      }
      
    libp2p.handle('/spk-video-encoder/1.0.0', handler)
    const output = await libp2p.dialProtocol("/ip4/10.0.1.188/tcp/14445/p2p/QmctF7GPunpcLu3Fn77Ypo657TA9GpTiipSDUUMoD2k5Kq", '/spk-video-encoder/1.0.0')
    logger.info(output)
      
    
    cli.action.start('Encoding Video')
    // do some action...
    // stop the spinner
    //cli.action.stop() // shows 'starting a process... done'
    
    void (async () => {
      let encodeId;
      void (async () => {
        for await(let item of output.stream.source) {
        const decodedMessage = decode(item._bufs[0])
        logger.info(decodedMessage)
        if(decodedMessage.type === MESSAGE_TYPES.RESPONE_ENCODE_JOB) {
          encodeId = decodedMessage.streamId
          pushable.push(encode({
            type: MESSAGE_TYPES.SUBSCRIBE_UPDATE,
            streamId: decodedMessage.streamId
          }))
          let encodeDoc = await TileDocument.load(ceramic, encodeId)
          setInterval(async () => {
            await encodeDoc.sync()
            const contentData = encodeDoc.content as any;
            if(contentData.status === EncodeStatus.COMPLETE) {
              logger.info(`Job complete, IPFS Hash is ${contentData.outCid}`)
              cli.action.stop()
              process.exit(0)
            }
          }, 1000)
        }
      }})()
    })()
    const pushable = Pushable()
    pipe(pushable, output.stream)
    pushable.push(encode({
      type: MESSAGE_TYPES.REQUEST_ENCODE_JOB,
      ipfsHash: 'Qma9ZjjtH7fdLWSrMU43tFihvSN59aQdes7f5KW6vGGk6e'
    }))
    //pushable.end()
    //logger.info(output.stream.close())
})()
