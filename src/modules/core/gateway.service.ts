import { CoreService } from './core.service'
import { v4 as uuid } from 'uuid'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { StreamID } from '@ceramicnetwork/streamid'
import tmp from 'tmp'
import ffmpeg from 'fluent-ffmpeg'
import { globSource } from 'ipfs-http-client'
import Path from 'path'
import fs from 'fs'
import EventEmitter from 'events'
import PouchDB from 'pouchdb'
import PouchdbFind from 'pouchdb-find'
import PouchdbUpsert from 'pouchdb-upsert'
import { EncodeStatus, GatewayJob, GatewayWorkerInfo, JobStatus } from '../encoder.model'
import NodeSchedule from 'node-schedule'
import { MongoClient, Db, Collection } from 'mongodb'
import PQueue from 'p-queue'
//import { Cluster } from '@nftstorage/ipfs-cluster'
import IpfsCluster from 'ipfs-cluster-api'
import { IpfsClusterPinAdd } from '../../common/utils'

export class GatewayService {
  self: CoreService
  events: EventEmitter
  db: Db
  jobs: Collection
  clusterNodes: Collection<GatewayWorkerInfo>
  claimQueue: PQueue
  ipfsCluster: IpfsCluster

  constructor(self) {
    this.self = self
    this.claimQueue = new PQueue({ concurrency: 1 })

    this.askJob = this.askJob.bind(this)
    this.runReassign = this.runReassign.bind(this)
    this.runUploadingCheck = this.runUploadingCheck.bind(this)
  }

  async stats() {
    const totalEncoded = await this.jobs
      .find({
        encodeStatus: EncodeStatus.COMPLETE,
      })
      .count()

    const totalFailed = await this.jobs
      .find({
        encodeStatus: EncodeStatus.FAILED,
      })
      .count()

    const totalEncodedLastDay = await this.jobs
      .find({
        encodeStatus: EncodeStatus.COMPLETE,
      })
      .count()

    const totalFailedLastDay = await this.jobs
      .find({
        encodeStatus: EncodeStatus.FAILED,
      })
      .count()

    return {
      totalEncoded,
      totalFailed,
      totalEncodedLastDay,
      totalFailedLastDay,
    }
  }

  async updateNode(peer_did, nodeInfo) {
    const data = await this.clusterNodes.findOne({
      id: peer_did
    })
    if(!data) {
      await this.clusterNodes.insertOne({
        id: peer_did,
        peer_id: nodeInfo.peer_id,
        name: nodeInfo.name,
        last_seen: new Date(),
        first_seen: new Date()
      } as any)
    } else {
      await this.clusterNodes.findOneAndUpdate(data, {
        $set: {
          cryptoAccounts: nodeInfo.cryptoAccounts,
          peer_id: nodeInfo.peer_id,
          name: nodeInfo.name,
          last_seen: new Date(),
        }
      } as any)
    }
  }

  async askJob() {
    return await this.jobs.findOne(
      {
        status: JobStatus.QUEUED,
      },
      {
        sort: {
          created_at: 1,
        },
      },
    )
  }

  async acceptJob(job_id, node_id) {
    if (!job_id) {
      throw new Error('Job_id is not defined')
    }
    const jobInfo = await this.jobs.findOne({
      id: job_id,
    })
    if (!jobInfo) {
      throw new Error(`${job_id} does not exist`)
    }
    if (jobInfo.status === JobStatus.QUEUED) {
      await this.jobs.findOneAndUpdate(
        {
          id: job_id,
        },
        {
          $set: {
            status: JobStatus.ASSIGNED,
            assigned_to: node_id,
            assigned_date: new Date(),
            last_pinged: new Date(),
          },
        },
      )
      return 'ok'
    } else {
      throw new Error(`${job_id} is nolonger available`)
    }
  }

  async cancelJob(job_id) {}

  async rejectJob(job_id, node_id) {
    const jobInfo = await this.jobs.findOne({
      id: job_id
    })
    if(jobInfo.assigned_to === node_id) {
      await this.jobs.findOneAndUpdate({
        id: job_id
      }, {
        $set: {
          status: JobStatus.QUEUED,
          assigned_date: null,
          assigned_to: null,
          last_pinged: null
        }
      })
    }
  }

  async finishJob(payload, did) {
    const jobInfo = await this.jobs.findOne({
      id: payload.job_id,
    })
    console.log(payload)
    console.log('received finish job from ' + did)
    if (jobInfo.assigned_to === did) {
      if (payload.output) {
        if (payload.output.cid) {
          console.log('accepted finish job from ' + did)
          await this.jobs.findOneAndUpdate(jobInfo, {
            $set: {
              status: JobStatus.UPLOADING,
              result: {
                cid: payload.output.cid as any,
              } as any,
            },
          })

          const out = await IpfsClusterPinAdd(payload.output.cid, {
            metadata: jobInfo.storageMetadata,
            replicationFactorMin: 2,
            replicationFactorMax: 3
          })
          console.log(out)
        } else {
          throw new Error('Output CID not provided')
        }
      } else {
        throw new Error('Output not provided')
      }
    } else {
      throw new Error('This job does not belong to you!')
    }
  }

  async pingJob(payload, node_id) {
    const { job_id } = payload
    const data = await this.jobs.findOne({
      id: job_id,
    })
    if (
      data.assigned_to === node_id &&
      (data.status === JobStatus.ASSIGNED || data.status === JobStatus.RUNNING)
    ) {
      await this.jobs.findOneAndUpdate(
        {
          id: job_id,
        },
        {
          $set: {
            last_pinged: new Date(),
            progress: {
              pct: payload.progressPct,
            },
            ...(payload.progressPct > 1
              ? {
                  status: JobStatus.RUNNING,
                }
              : {}),
          },
        },
      )
    } else {
    }
  }

  async nodestats() {}

  async nodeJobs() {}

  async createJob(url: string, metadata, storageMetadata) {
    const obj = {
      id: uuid(),
      created_at: new Date(),
      status: JobStatus.QUEUED,
      start_date: null,
      last_pinged: null,
      finished_date: null,

      assigned_to: null,
      assigned_date: null,
      metadata: metadata,
      storageMetadata,
      input: {
        uri: url,
      },
      result: null,
    }
    await this.jobs.insertOne(obj)
    return obj
  }

  async runReassign() {
    console.log('running ', new Date())
    const expiredJobs = await this.jobs.find({
      $or: [
        {
          status: { $eq: JobStatus.RUNNING },
          last_pinged: { $lt: new Date(new Date().getTime() - 1000 * 60 * 5) },
        },
        {
          status: { $eq: JobStatus.ASSIGNED },
          last_pinged: { $lt: new Date(new Date().getTime() - 1000 * 60 * 5) },
        },
      ],
    })
    console.log(`${await expiredJobs.count()} number of jobs has expired`)
    for await (let job of expiredJobs) {
      console.log(`Re-assigning ${job.id} from ${job.assigned_to}`)
      await this.jobs.findOneAndUpdate(job, {
        $set: {
          status: JobStatus.QUEUED,
          assigned_date: null,
          assigned_to: null,
          last_pinged: null,
        },
      })
    }
  }
  async runUploadingCheck() {
    const jobs = await this.jobs
      .find({
        status: JobStatus.UPLOADING,
      })
      .toArray()
    console.log(jobs)
    for (let job of jobs) {
      const cid = (job.result as any).cid
      console.log(cid)
      const pinStatus = await this.ipfsCluster.status(cid)
      console.log(pinStatus)
      let uploaded = false
      let pinning = false
      for (let mapEntry of Object.values(pinStatus.peer_map) as any[]) {
        if (mapEntry.status === 'pinned') {
          uploaded = true
        }
        if (mapEntry.status === 'pinning') {
          pinning = true
        }
      }
      if (uploaded) {
        await this.jobs.findOneAndUpdate(job, {
          $set: {
            status: JobStatus.COMPLETE,
          },
        })
      } else if (!pinning) {
        await IpfsClusterPinAdd(cid, {
          metadata: job.storageMetadata,
          replicationFactorMin: 2,
          replicationFactorMax: 3
        })
      }
      console.log(`${job.id}: ${uploaded}`)
    }
  }

  async start() {
    const gatewayEnabled = this.self.config.get('gateway.enabled')
    if (gatewayEnabled) {
      const mongo = new MongoClient(this.self.config.get('gateway.mongodb_url'))
      await mongo.connect()
      this.db = mongo.db('spk-encoder-gateway')
      this.jobs = this.db.collection('jobs')
      this.clusterNodes = this.db.collection('cluster_nodes')

      NodeSchedule.scheduleJob('15 * * * * *', this.runReassign)
      NodeSchedule.scheduleJob('45 * * * * *', this.runReassign)
      NodeSchedule.scheduleJob('45 * * * * *', this.runUploadingCheck)

      console.log(
        JSON.stringify(
          await this.self.identityService.identity.createJWS({
            hello: 'world',
          }),
        ),
      )
      this.ipfsCluster = new IpfsCluster({
        host: '',
        port: '9094',
        protocol: 'http',
        headers: {
          authorization: '',
        },
      })
    }
  }
  async stop() {

  }
}
void (async () => {
 try {
     let ipfsCluster = new IpfsCluster({
       host: '',
       port: '9094',
       protocol: 'http',
       headers: {
         authorization: '',
       },
     })
     const a = await ipfsCluster.status('QmaCRG6bam6XJiXfVSSPkXAY388GUgv22bvhqkHNHeqL8h')
     const b = await ipfsCluster.status('QmeeZ8sDCG6krbLQ7h5Su4YXjKA6qVjGW6FeRCc7u5HiCP')
     console.log(a)
     console.log(b)
     console.log(await ipfsCluster.pin.ls())
     await ipfsCluster.pin.rm('QmaSL1VwhRERhHPnddb19o6K2BhRazVTtDZq1TVuqQA5dd')
 } catch {

 }
})()
