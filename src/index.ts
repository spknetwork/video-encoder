import {CeramicClient} from '@ceramicnetwork/http-client'
import { onShutdown } from "node-graceful-shutdown";
import logger from 'node-color-log'
import { ConfigService } from './config.service'
// import IPFSHTTP from 'ipfs-http-client'
import { CoreService } from './modules/core/core.service'
import {EncoderApiModule} from './api/index'

let instance: CoreService;
async function startup(): Promise<void> {
  
  try {
    // init ceramic
    const ceramic = new CeramicClient(ConfigService.getConfig().ceramicHost) //Using the public node for now.
  
    instance = new CoreService(ceramic)
    await instance.start()
  
    const api = new EncoderApiModule(4005, instance)
    await api.listen()
  } catch (ex) {
    logger.error(ex.message)
    await instance.stop()
    process.exit(0)
  }

}

void startup()


process.on('unhandledRejection', (error: Error) => {
  logger.error('unhandledRejection', error)
})


onShutdown(async () => {
  logger.info('Video encoder stopping... ')
  await instance.stop()
  logger.info('Exit');

});
