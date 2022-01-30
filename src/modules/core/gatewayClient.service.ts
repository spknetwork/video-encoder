import Axios from 'axios'
import { CoreService } from './core.service'
import NodeSchedule from 'node-schedule'
import PQueue from 'p-queue'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { EncodeStatus, JobStatus } from '../encoder.model'

export class GatewayClient {
  self: CoreService
  apiUrl: string
  jobQueue: PQueue

  constructor(self) {
    this.self = self

    this.getNewJobs = this.getNewJobs.bind(this)

    this.jobQueue = new PQueue({ concurrency: 1 })
  }

  async queueJob(jobInfo) {
    console.log(jobInfo)
    try {
      const { data } = await Axios.post(`${this.apiUrl}/api/v0/gateway/acceptJob`, {
        jws: await this.self.identityService.identity.createJWS({
          action: 'accept',
          job_id: jobInfo.id,
        }),
      })
      const job_id = jobInfo.id
      console.log(data)

      const job = await this.self.encoder.createJob(jobInfo.input.uri)
      console.log(job)
      this.jobQueue.add(async () => {
        setInterval(async () => {
          const job_data = await this.self.encoder.pouch.get(job.id)
          await Axios.post(`${this.apiUrl}/api/v0/gateway/pingJob`, {
            jws: await this.self.identityService.identity.createJWS({
              job_id,
              progressPct: job_data.progressPct,
            }),
          })
        }, 5000)
        const eventListenr = async (jobUpdate) => {
          console.log(jobUpdate)
          console.log(jobUpdate.streamId.toString(), job.streamId)

          //Make sure the event is not destine for another job
          if (jobUpdate.streamId.toString() === job.streamId) {
            console.log(jobUpdate.content.status, JobStatus.COMPLETE)
            //Ensure the job is complete and not something else
            if (jobUpdate.content.status === JobStatus.COMPLETE) {
              console.log('posting gg')
              //Submitting the job
              await Axios.post(`${this.apiUrl}/api/v0/gateway/finishJob`, {
                jws: await this.self.identityService.identity.createJWS({
                  job_id: job_id,
                  output: {
                    cid: jobUpdate.content.outCid,
                  },
                }),
              })
            }
          }
        }
        this.self.encoder.events.on('job.status_update', eventListenr)
        
        await this.self.encoder.executeJob(job.streamId)
        

        
        //this.self.encoder.events.off('job.status_update', eventListenr)
      })
    } catch (ex) {
      console.log(ex)
    }

    //this.self.encoder.createJob(jobInfo.input.url)
  }
  async getNewJobs() {
    console.log(this.apiUrl)
    const { data } = await Axios.get(`${this.apiUrl}/api/v0/gateway/getJob`)
    console.log(data)

    if (data && this.jobQueue.size === 0) {
      this.queueJob(data)
    }
  }

  async start() {
    if (this.self.config.get('remote_gateway.enabled')) {
      console.log(`${Math.round(Math.random() * (60 + 1))} * * * * *`)
      NodeSchedule.scheduleJob(`${Math.round(Math.random() * (60 + 1))} * * * * *`, this.getNewJobs)

      this.apiUrl = this.self.config.get('remote_gateway.api') || 'http://127.0.0.1:4005'


      setTimeout(async() => {
        try {
          await Axios.post(`${this.apiUrl}/api/v0/gateway/updateNode`, {
            jws: await this.self.identityService.identity.createJWS({
              node_info: {
                name: this.self.config.get('node.name'),
                cryptoAccounts: this.self.config.get('node.cryptoAccounts'),
                peer_id: await (await this.self.ipfs.id()).id
              }
            }),
          })
        } catch (ex) {
          console.log(ex)
        }
      }, 1000)
    }
  }
}
