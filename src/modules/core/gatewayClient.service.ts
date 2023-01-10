import Axios from 'axios'
import { CoreService } from './core.service'
import NodeSchedule from 'node-schedule'
import PQueue from 'p-queue'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { EncodeStatus, JobStatus } from '../encoder.model'
import GitCommitInfo from 'git-commit-info'

const queue_concurrency = 1
export class GatewayClient {
  self: CoreService
  apiUrl: string
  jobQueue: PQueue
  activeJobs: Record<string, Object>

  constructor(self) {
    this.self = self

    this.getNewJobs = this.getNewJobs.bind(this)

    this.jobQueue = new PQueue({ concurrency: queue_concurrency })

    this.activeJobs = {}
  }

  async queueJob(remoteJob) {
    console.log(remoteJob)
    try {
      //Asks gateway to accept the job
      const { data } = await Axios.post(`${this.apiUrl}/api/v0/gateway/acceptJob`, {
        jws: await this.self.identityService.identity.createJWS({
          action: 'accept',
          job_id: remoteJob.id,
        }),
      })
      const job_id = remoteJob.id
      console.log(data)

      //Notes the job so it can be removed if neede when the daemon stops/restart
      this.activeJobs[job_id] = remoteJob;

      const job = await this.self.encoder.createJob(remoteJob.input.uri); //Creates an internal job
      console.log(job)

      let pid;
      //Adds job to the queue.
      this.jobQueue.add(async () => {

        //Ping interval
        pid = setInterval(async () => {
          const job_data = await this.self.encoder.pouch.get(job.id)
          await Axios.post(`${this.apiUrl}/api/v0/gateway/pingJob`, {
            jws: await this.self.identityService.identity.createJWS({
              job_id,
              progressPct: job_data.progressPct,
              download_pct: job_data.download_pct,
            }),
          })
        }, 5000)

        const eventListenr = async (jobUpdate) => {
          console.log(jobUpdate)

          // console.log(jobUpdate.content.status, JobStatus.COMPLETE, jobUpdate.streamId.toString(), job.streamId)
          //Make sure the event is not destine for another job
          if (jobUpdate.streamId.toString() === job.streamId) {
            console.log(`Current Status: ${job.streamId} ${jobUpdate.content.status}`)
            //Ensure the job is complete and not something else
            if (jobUpdate.content.status === JobStatus.COMPLETE) {
              console.log(`Encode Complete ${job_id} submitting`)
              //Submitting the job
              await Axios.post(`${this.apiUrl}/api/v0/gateway/finishJob`, {
                jws: await this.self.identityService.identity.createJWS({
                  job_id: job_id,
                  output: {
                    cid: jobUpdate.content.outCid,
                  },
                }),
              })
              this.ipfsBootstrap().catch((e) => {
                console.log(e)
              })
              delete this.activeJobs[job_id];
              clearInterval(pid)
              this.self.encoder.events.off('job.status_update', eventListenr)
            }
          }
        }
        

        this.self.encoder.events.on('job.status_update', eventListenr)
        
        
        try {
          //TODO: Probably should redo the whole remote and local job ID thing
          await this.self.encoder.executeJob(job.id)
        } catch(ex) {
          console.log('failing job ' + job_id)
          await this.failJob(job_id)
          clearInterval(pid)
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
    /*const { data } = await Axios.get(`${this.apiUrl}/api/v0/gateway/getJob`)
    console.log(data)*/
    const { data } = await Axios.post(`${this.apiUrl}/v1/graphql`, {
      query: `
      query Query($node_id: String) {
        queueJob(node_id: $node_id) {
          reason
          job {
            id
            status
            created_at
            last_pinged
            start_date
            completed_at
            input {
              format
              uri
              size
            }
            result {
              format
              uri
              size
            }
            sync
            storageMetadata
            metadata
          }
        }
      }
      `,
      variables: {
        node_id: this.self.identityService.identity.id
      }
    })

    console.log('jobInfo', JSON.stringify(data), {
      node_id: this.self.identityService.identity.id
    })

    if(data.data.queueJob.job) {
      if (this.jobQueue.size === 0 && this.jobQueue.pending === (queue_concurrency - 1)) {
        this.queueJob(data.data.queueJob.job)
      }
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
  
  async ipfsBootstrap() {
    const {data: gqlResult} = await Axios.post(`${this.apiUrl}/v1/graphql`, {
      query: `
        {
          ipfsBootstrap
        }
      `
    })
    const peers = gqlResult.data.ipfsBootstrap.peers;

    for(let peer of peers) {
      await this.self.ipfs.swarm.connect(peer)
    }
  }

  async start() {
    if (this.self.config.get('remote_gateway.enabled')) {
      console.log(`${Math.round(Math.random() * (60 + 1))} * * * * *`)
      NodeSchedule.scheduleJob(`${Math.round(Math.random() * (60 + 1))} * * * * *`, this.getNewJobs)
      
      this.apiUrl = this.self.config.get('remote_gateway.api') || 'http://127.0.0.1:4005'
      
      await this.ipfsBootstrap()

      setTimeout(async() => {
        try {
          await Axios.post(`${this.apiUrl}/api/v0/gateway/updateNode`, {
            jws: await this.self.identityService.identity.createJWS({
              node_info: {
                name: this.self.config.get('node.name'),
                cryptoAccounts: this.self.config.get('node.cryptoAccounts'),
                peer_id: await (await this.self.ipfs.id()).id,
                commit_hash: GitCommitInfo().hash
              }
            }),
          })
        } catch (ex) {
          console.log(ex)
          process.exit(0)
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
