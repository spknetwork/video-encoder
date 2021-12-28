import CeramicHTTP from '@ceramicnetwork/http-client'
import { ConfigService } from './config.service'
import IPFSHTTP from 'ipfs-http-client'
import { CoreService } from './modules/core/core.service'
import {EncoderApiModule} from './api/index'


async function startup(): Promise<void> {
  // init ceramic
  const ceramic = new CeramicHTTP(ConfigService.getConfig().ceramicHost) //Using the public node for now.


  const instance = new CoreService(ceramic)
  await instance.start()

  const api = new EncoderApiModule(4005, instance)
  await api.listen()

}

void startup()


process.on('unhandledRejection', (error: Error) => {
  console.log('unhandledRejection', error)
})
