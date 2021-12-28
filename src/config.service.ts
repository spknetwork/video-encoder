export interface EncoderAppConfig {
    mongoDatabaseName: string
    mongoHost: string
    ceramicHost: string
    ipfsHost: string
    apiListenPort: number
  }
  
  export class ConfigService {
    static getConfig(): EncoderAppConfig {
      let apiListenPort
      if (process.env.API_LISTEN_PORT) {
        try {
          apiListenPort = parseInt(process.env.API_LISTEN_PORT)
        } catch (err) {
          throw new Error(
            `Error parsing api listen port!  ${process.env.API_LISTEN_PORT} is not a valid number`,
          )
        }
      } else {
        apiListenPort = 4567
      }
  
      return {
        mongoDatabaseName: process.env.MONGO_DATABASE || 'spk-encoder-node',
        mongoHost: process.env.MONGO_HOST || 'localhost:27017',
        ceramicHost: process.env.CERAMIC_HOST || 'https://ceramic-clay.3boxlabs.com',
        ipfsHost: process.env.IPFS_HOST || 'localhost:5001',
        apiListenPort,
      }
    }
  }