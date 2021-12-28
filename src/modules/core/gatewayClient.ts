import Axios from 'axios'
import { CoreService } from './core.service'
import NodeSchedule from 'node-schedule'
import PQueue from 'p-queue';
import { TileDocument } from '@ceramicnetwork/stream-tile';
import { EncodeStatus, JobStatus } from '../encoder.model';

export class GatewayClient {
    self: CoreService;
    apiUrl: string;
    jobQueue: PQueue;

    constructor(self) {
        this.self = self

        this.getNewJobs = this.getNewJobs.bind(this)
        
        this.jobQueue = new PQueue({concurrency: 1})
    }
    

    async queueJob(jobInfo) {
        console.log(jobInfo)
        try {
            const {data} = await Axios.post(`${this.apiUrl}/api/v0/gateway/acceptJob`, {
                jws: await this.self.identityService.identity.createJWS({
                    action: 'accept',
                    job_id: jobInfo.id
                })
            })
            const job_id = jobInfo.id
            console.log(data)

            const job = await this.self.encoder.createJob(jobInfo.input.uri)
            console.log(job)
            this.jobQueue.add(async() => {
                setInterval(async() => {
                    const job_data = await this.self.encoder.pouch.get(job.id)
                    await Axios.post(`${this.apiUrl}/api/v0/gateway/pingJob`, {
                        jws: await this.self.identityService.identity.createJWS({
                            job_id,
                            progressPct: job_data.progressPct
                        })
                    })
                }, 5000)
                await this.self.encoder.executeJob(job.streamId)
                
                const data = await TileDocument.load(this.self.ceramic, job.streamId)
                console.log(data)
                this.self.encoder.events.on('job.status_update', async (jobUpdate) => {
                    console.log(jobUpdate)
                    console.log(jobUpdate.streamId.toString(), job.streamId)
                    if(jobUpdate.streamId.toString() === job.streamId) {
                        console.log(jobUpdate.status, JobStatus.COMPLETE)
                        if(jobUpdate.content.status === JobStatus.COMPLETE) {
                            console.log('posting gg')
                            await Axios.post(`${this.apiUrl}/api/v0/gateway/finishJob`, {
                                jws: await this.self.identityService.identity.createJWS({
                                    job_id: job_id,
                                    output: {
                                        cid: jobUpdate.content.outCid
                                    }
                                })
                            })
                        }
                    }
                })
            })
        } catch (ex) {
            console.log(ex)
        }

        //this.self.encoder.createJob(jobInfo.input.url)
    }
    async getNewJobs() {
        console.log(this.apiUrl)
        const {data} = await Axios.get(`${this.apiUrl}/api/v0/gateway/getJob`)
        console.log(data)

        if(data) {
            this.queueJob(data)
        }
    }

    async start() {
        if(this.self.config.get('remote_gateway.enabled') || true) {
            console.log(`${Math.round(Math.random() * (60 + 1))} * * * * *`)
            NodeSchedule.scheduleJob(`${Math.round(Math.random() * (60 + 1))} * * * * *`, this.getNewJobs)

            this.apiUrl = this.self.config.get('remote_gateway.api') || 'http://127.0.0.1:4005'
            /*Axios.post(`${this.apiUrl}/api/v0/gateway/updateNode`, {
                jws: await this.self.identityService.identity.createJWS({
                    name: this.self.config.get('node.name'),
                    cryptoAccounts: this.self.config.get('cryptoAccounts')
                })
            })*/
            
        }
    }
}