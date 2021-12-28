import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { IPFSHTTPClient } from 'ipfs-http-client'
import { CoreService } from '../modules/core/core.service'
import {GatewayApiController} from './gateway.controller'

export const ipfsContainer: { self: IPFSHTTPClient } = {} as any
export const encoderContainer: { self: CoreService } = {} as any

export const INDEXER_API_BASE_URL = '/api/v0/node'

@Module({
  imports: [],
  controllers: [GatewayApiController],
  providers: [],
})
class ControllerModule {}

/**
 * see api requirements here https://github.com/3speaknetwork/research/discussions/3
 */
export class EncoderApiModule {
  constructor(
    private readonly listenPort: number,
    private readonly self: CoreService
  ) {
    encoderContainer.self = self;
  }

  public async listen() {
    const app = await NestFactory.create(ControllerModule)

    const swaggerconfig = new DocumentBuilder().setTitle('SPK encoder node').build()
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerconfig)
    SwaggerModule.setup('swagger', app, swaggerDocument)

    await app.listen(this.listenPort)
  }
}
