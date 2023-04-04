import Axios from 'axios'
import { CoreService } from './core.service'
import NodeSchedule from 'node-schedule'
import PQueue from 'p-queue'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { EncodeStatus, JobStatus } from '../encoder.model'
import GitCommitInfo from 'git-commit-info'
import logger from 'node-color-log'

const queue_concurrency = 1
export class GatewayClient {
  self: CoreService
  apiUrl: string
  jobQueue: PQueue
  dbQueue: PQueue
  activeJobs: Record<string, Object>

  constructor(self) {
    this.self = self

    this.getNewJobs = this.getNewJobs.bind(this)
    this.ipfsBootstrap = this.ipfsBootstrap.bind(this)
    this.encoderUnpinCheck = this.encoderUnpinCheck.bind(this)

    this.jobQueue = new PQueue({ concurrency: queue_concurrency })

    this.dbQueue = new PQueue({ concurrency: 1 })

    this.activeJobs = {}
  }

  async queueJob(remoteJob) {
    try {
      this.jobQueue.add(async () => {
        //Asks gateway to accept the job
        try {
          const { data } = await Axios.post(`${this.apiUrl}/api/v0/gateway/acceptJob`, {
            jws: await this.self.identityService.identity.createJWS({
              action: 'accept',
              job_id: remoteJob.id,
            }),
          })
          logger.info(data)
        } catch {
          //If job was already stolen. 
          return;
        }
        const job_id = remoteJob.id

        //Notes the job so it can be removed if neede when the daemon stops/restart
        this.activeJobs[job_id] = remoteJob;

        const job = await this.self.encoder.createJob(remoteJob.input.uri); //Creates an internal job
        logger.info(job)

        let pid;
        //Adds job to the queue.

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
          logger.info(jobUpdate)

          // logger.info(jobUpdate.content.status, JobStatus.COMPLETE, jobUpdate.streamId.toString(), job.streamId)
          //Make sure the event is not destine for another job
          if (jobUpdate.streamId.toString() === job.streamId) {
            logger.info(`Current Status: ${job.streamId} ${jobUpdate.content.status}`)
            //Ensure the job is complete and not something else
            if (jobUpdate.content.status === JobStatus.COMPLETE) {
              logger.info(`Encode Complete ${job_id} submitting`)
              //Submitting the job
              await Axios.post(`${this.apiUrl}/api/v0/gateway/finishJob`, {
                jws: await this.self.identityService.identity.createJWS({
                  job_id: job_id,
                  output: {
                    cid: jobUpdate.content.outCid,
                  },
                }),
              })

              await this.dbQueue.add(async () => {
                await this.self.encoder.pouch.upsert('pin-allocation', (doc) => {
                  doc[job_id] = {
                    cid: jobUpdate.content.outCid
                  }
                  return doc;
                })
              })
              this.ipfsBootstrap().catch((e) => {
                logger.error(e)
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
          logger.error('failing job ' + job_id)
          await this.failJob(job_id)
          clearInterval(pid)
          delete this.activeJobs[job_id];
          logger.error(ex)
        }

        
      })
    } catch (ex) {
      logger.error(ex)
    }

    //this.self.encoder.createJob(jobInfo.input.url)
  }
  async getNewJobs() {
    logger.info(this.apiUrl)
    /*const { data } = await Axios.get(`${this.apiUrl}/api/v0/gateway/getJob`)
    logger.info(data)*/
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

    logger.info('jobInfo', JSON.stringify(data), {
      node_id: this.self.identityService.identity.id
    })

    if(data.data.queueJob.job) {
      logger.info(this.jobQueue.size === 0, this.jobQueue.pending, (queue_concurrency - 1))
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
      try {
        await this.self.ipfs.swarm.connect(peer)
      } catch {

      }
    }
  }

  async encoderUnpinCheck() {
    logger.info(`[GC] Running unpin cycle`)
    try {
      const doc:Record<string, {cid: string}> = await this.self.encoder.pouch.get('pin-allocation')
      logger.info(doc)
      for(let [job_id, docData] of Object.entries(doc)) {
        const { data } = await Axios.post(`${this.apiUrl}/v1/graphql`, {
          query: `
          query QueryJobInfo($job_id: String) {
            jobInfo(job_id:$job_id) {
              id
              status
            }
          }
          `,
          variables: {
            job_id: job_id
          }
        })
        const jobInfo = data.data.jobInfo
        

        logger.info(jobInfo)
        if(jobInfo.status === "complete") {
          logger.info(`[GC] Unpinning ${docData.cid} from ${job_id}`)
          try {
            await this.self.ipfs.pin.rm(docData.cid)
          } catch {
            //If not pinned
          }
          await this.dbQueue.add(async () => {
            await this.self.encoder.pouch.upsert('pin-allocation', (doc) => {
              delete doc[job_id]
              return doc;
            })
          })
        }
      }
    } catch(ex) {
      // logger.error(ex)
    }
    logger.info('[GC] Running IPFS GC')
    for await(let gcResult of this.self.ipfs.repo.gc()) {
      // logger.info(gcResult)
      //Don't log here unless you want spam
    }
    logger.info('[GC] IPFS GC complete')
  }

  async start() {
    if (this.self.config.get('remote_gateway.enabled')) {
      this.apiUrl = this.self.config.get('remote_gateway.api') || 'http://127.0.0.1:4005'
      logger.info(`${Math.round(Math.random() * (60 + 1))} * * * * *`)

      logger.info('Startup: Checking if IPFS is running')
      try {
        await (await this.self.ipfs.id()).id
      } catch {
        throw new Error("IPFS Daemon Not Available. Please run IPFS.")
      }


      NodeSchedule.scheduleJob(`${Math.round(Math.random() * (60 + 1))} * * * * *`, this.getNewJobs)
      NodeSchedule.scheduleJob(`${Math.round(Math.random() * (60 + 1))} * * * * *`, this.ipfsBootstrap)
      NodeSchedule.scheduleJob(`0 * * * *`, this.encoderUnpinCheck); //Garbage collect every hour
      
      
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
          logger.error(ex)
          process.exit(0)
        }
      }, 1000)
    }
  }
  async stop() {
    NodeSchedule.gracefulShutdown();
    logger.info(Object.keys(this.activeJobs))
    for (let job_id of Object.keys(this.activeJobs)) {
      logger.info('Cancelling all jobs')
      try {
        await this.rejectJob(job_id)
      } catch (ex) {
        logger.error(ex)
      }
    }
  }
}
