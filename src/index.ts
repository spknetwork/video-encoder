import {CeramicClient} from '@ceramicnetwork/http-client'
import { onShutdown } from "node-graceful-shutdown";
import { ConfigService } from './config.service'
// import IPFSHTTP from 'ipfs-http-client'
import { CoreService } from './modules/core/core.service'
import {EncoderApiModule} from './api/index'

let instance: CoreService;
async function startup(): Promise<void> {
  
  // init ceramic
  const ceramic = new CeramicClient(ConfigService.getConfig().ceramicHost) //Using the public node for now.


  instance = new CoreService(ceramic)
  await instance.start()

  const api = new EncoderApiModule(4005, instance)
  await api.listen()

}

void startup()


process.on('unhandledRejection', (error: Error) => {
  console.log('unhandledRejection', error)
})


onShutdown(async () => {
  console.log('Video encoder stopping... ')
  await instance.stop()
  console.log('Exit');

});
