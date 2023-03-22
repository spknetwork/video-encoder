import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
// import { graphqlHTTP } from 'express-graphql'
import { createSchema, createYoga } from 'graphql-yoga'
import { GraphQLJSON, GraphQLLong } from 'graphql-scalars'
import { buildSchema } from 'graphql'
import { IPFSHTTPClient } from 'ipfs-http-client'
import { CoreService } from '../modules/core/core.service'
import {GatewayApiController} from './gateway.controller'
import { Resolvers } from './graphql/resolvers'
import { schema } from './graphql/schema'

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

    const yoga = createYoga({
      schema: createSchema({
        typeDefs: schema,
        resolvers: {
          Long: GraphQLLong,
          JSON: GraphQLJSON,
          Query: Resolvers
        }
      })
    })

    app.use(
      '/v1/graphql',
      yoga
    )

    await app.listen(this.listenPort)
  }
}
