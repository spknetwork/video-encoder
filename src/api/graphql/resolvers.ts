import { encoderContainer } from ".."
import {JobReason} from '../../modules/encoder.model'

class JobInfo {
    data: any;
    constructor(data) {
        this.data = data;
    }
    get id() {
        return this.data.id
    }
    get status() {
        return this.data.status
    }
    get created_at() {
        return this.data.created_at?.toISOString()
    }
    get last_pinged() {
        return this.data.last_pinged?.toISOString()
    }
    get start_date() {
        return this.data.start_date?.toISOString()
    }
    get completed_at() {
        return this.data.completed_at?.toISOString()
    }
    get input() {
        return this.data.input
    }
    get result() {
        return this.data.result
    }
    get storageMetadata() {
        return this.data.storageMetadata
    }
    get metadata() {
        return this.data.metadata
    }
}

export const Resolvers = {
    async queueJob() {
        const job = await encoderContainer.self.gateway.askJob()

        let defaultReason;
        let jobOut; 
        if(job) {
            defaultReason = JobReason.JOB_AVAILABLE;
            jobOut = new JobInfo(job)
        } else {
            defaultReason = JobReason.NO_JOBS
        }

        console.log(job)
        
        return {
            job: jobOut,
            reason: defaultReason
        }
    },
    async scoreMap() {
        return await encoderContainer.self.gateway.scoring.scoreMap()
    },
    async nodeScore(args: any) {
        return await encoderContainer.self.gateway.scoring.nodeScore(args.node_id)
    }
}