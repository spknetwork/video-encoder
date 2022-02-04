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
  activeJobs: Record<string, Object>

  constructor(self) {
    this.self = self

    this.getNewJobs = this.getNewJobs.bind(this)

    this.jobQueue = new PQueue({ concurrency: 1 })

    this.activeJobs = {}
  }

  async queueJob(jobInfo) {
    console.log(jobInfo)
    try {
      //Asks gateway to accept the job
      const { data } = await Axios.post(`${this.apiUrl}/api/v0/gateway/acceptJob`, {
        jws: await this.self.identityService.identity.createJWS({
          action: 'accept',
          job_id: jobInfo.id,
        }),
      })
      const job_id = jobInfo.id
      console.log(data)

      //Notes the job so it can be removed if neede when the daemon stops/restart
      this.activeJobs[job_id] = jobInfo;

      const job = await this.self.encoder.createJob(jobInfo.input.uri); //Creates an internal job
      console.log(job)

      //Adds job to the queue.
      this.jobQueue.add(async () => {

        //Ping interval
        const pid = setInterval(async () => {
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
              delete this.activeJobs[job_id];
              clearInterval(pid)
              this.self.encoder.events.off('job.status_update', eventListenr)
            }
          }
        }

        this.self.encoder.events.on('job.status_update', eventListenr)
        
        
        try {
          await this.self.encoder.executeJob(job.streamId)
        } catch(ex) {
          console.log('failing job ' + job.id)
          await this.failJob(job.id)
          console.log(ex)
        }

        
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

  async rejectJob(job_id) {
    await Axios.post(`${this.apiUrl}/api/v0/gateway/rejectJob`, {
      jws: await this.self.identityService.identity.createJWS({
        job_id
      })
    })
  }

  async failJob(job_id) {
    await Axios.post(`${this.apiUrl}/api/v0/gateway/failJob`, {
      jws: await this.self.identityService.identity.createJWS({
        job_id
      })
    })
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
  async stop() {
    NodeSchedule.gracefulShutdown();
    console.log(Object.keys(this.activeJobs))
    for (let job_id of Object.keys(this.activeJobs)) {
      console.log('Cancelling all jobs')
      try {
        await this.rejectJob(job_id)
      } catch (ex) {
        console.log(ex)
      }
    }
  }
}
