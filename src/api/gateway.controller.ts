/**
 * The gateway controller is designed to provide an API for 3rd party secondary nodes to interface with a central tasking/queue management node.
 * This handles job creation, job assignment, job tracking, managing clustered nodes, etc.
 */
import { BadRequestException, Body, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common'
import { Controller, Get, Param } from '@nestjs/common'
import { EncoderService } from '../modules/core/encoder.service'
import { encoderContainer } from './index'
import { unwrapJWS } from './middleware'

// Need to keep a top-level container here to avoid garbage collection
// @Controller(`${INDEXER_API_BASE_URL}/debug`)
@Controller(`/api/v0/gateway`)
export class GatewayApiController {
  constructor() {}

  @Post('/updateNode')
  async updateNode(@Body() body) {
    console.log(body)
    const { payload, did } = await unwrapJWS(body)
    console.log(payload, did)
  }

  /**
   * Get the total number of queued, assigned, running, complete and failed jobs
   * (over the last X time period)
   */
  @Get('/stats')
  async stats() {}

  /**
   * Gets stats of a specific node
   */
  @Get('/nodestats/:nodeId')
  async nodeStats() {}

  @Get('/nodeJobs/:nodeId')
  async nodeJobs(@Param('nodeId') nodeId) {
    console.log(nodeId)
  }

  /**
   * Gets the status of an already existing job
   */
  @Get('/getJob')
  async getJob() {
    return await encoderContainer.self.gateway.askJob()
  }

  /**
   * Encoder node is asking for a job
   */
  @Post('/askJob')
  async askJob() {}

  /**
   * Encoder node accepts a job
   */
  @Post('/acceptJob')
  async acceptJob(@Body() body) {
    const { kid, payload, did } = await unwrapJWS(body.jws)
    console.log(kid, payload, did)

    
    await encoderContainer.self.gateway.acceptJob(payload.job_id, did)
    return 'ok'
  }

  /**
   * Rejects a job and returns it to the queue
   */
  @Post('/rejectJob')
  async rejectJob(@Body() body) {
    const {payload, did} = await unwrapJWS(body)

  }

  @Post('/rejectAll')
  async rejectAll(@Body() body) {

  }
  
  /**
   * Client cancels a job and removes it from the queue
   */
  @Post('/cancelJob')
  async cancelJob(@Body() body) {
    const {payload, did} = await unwrapJWS(body.jws)
  }

  /**
   * Job is complete result is returned.
   */
  @Post('/finishJob')
  async finishJob(@Body() body) {
    const {payload, did} = await unwrapJWS(body.jws)

    await encoderContainer.self.gateway.finishJob(payload, did)
  }

  /**
   * Job ping: encoding server sends a request to the gateway to keep track of progress and re-assign the job if needed.
   */
  @Post('/pingJob')
  async pingJob(@Body() body) {

    const {payload, did} = await unwrapJWS(body.jws)

    await encoderContainer.self.gateway.pingJob(payload, did)

    return "ok"
  }

  /**
   * Pushes a new job onto the queue
   */
  @Get('/pushJob/:url')
  async pushJob(@Param('url') url) {
    const data = await unwrapJWS({
      payload: 'eyJoZWxsbyI6IndvcmxkIn0',
      signatures: [
        {
          protected:
            'eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa3NMdDFEdXZaeEN2cEM2YlA0YnlVR2FTNUxBTjNHclNHVjFDendveGRuNG55I3o2TWtzTHQxRHV2WnhDdnBDNmJQNGJ5VUdhUzVMQU4zR3JTR1YxQ3p3b3hkbjRueSJ9',
          signature:
            'L9xZKKeBZZcvjzVXhqAtzrKOmmmPbSGty9P-wbTM8Rf8gyssRCVozqlOJM9-8sKkXRxp6k2uVhMMmCsPuD29CA',
        },
      ],
    })
    console.log(data)
    return await encoderContainer.self.gateway.createJob(url)
  }
}
