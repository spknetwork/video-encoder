import moment from "moment";
import { encoderContainer } from ".."
import {JobReason, JobStatus} from '../../modules/encoder.model'

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
    async queueJob(args: any) {
        const queuedJobs = await encoderContainer.self.gateway.jobs.find(
            {
              status: JobStatus.QUEUED,
            },
            {
              sort: {
                created_at: 1,
              },
              limit: 20
            },
          ).toArray()

          
        //const job = await encoderContainer.self.gateway.askJob()

        if(!args.node_id) {
            let job = queuedJobs.pop();
            if(job) {
                return {
                    job: new JobInfo(job),
                    reason: JobReason.JOB_AVAILABLE
                }
            } else {
                return {
                    job: null,
                    reason: JobReason.NO_JOBS
                }
            }
        }

        const scoreMap = await encoderContainer.self.gateway.scoring.scoreMap();

        const sorted_score = scoreMap.sort((a, b) => {
            return b.byte_rate - a.byte_rate
        })

        
        const node_id = args.node_id

        const preferred_nodes = []
        for(let score_node of sorted_score) {
            if(score_node.load === 0 && preferred_nodes.length !== 3) {
                preferred_nodes.push(score_node.node_id)
            }
        }
        
        //console.log('preferred_nodes', preferred_nodes, scoreMap)
        
        const nodeInfo = await encoderContainer.self.gateway.clusterNodes.findOne({
            node_id: node_id
        })

        const nodeScore = scoreMap.find(e => e.node_id === node_id);

        if(nodeInfo?.banned === true) {
            return {
                reason: JobReason.BANNED,
                job: null
            }
        }

        

        if(preferred_nodes.includes(node_id) || (nodeScore?.low_precision || true)) {
            let job = queuedJobs.pop();
            if(job) {
                return {
                    job: new JobInfo(job),
                    reason: JobReason.JOB_AVAILABLE
                }
            } else {
                return {
                    job: null,
                    reason: JobReason.NO_JOBS
                }
            }
        } else {
            let jobOut;
            for(let job of queuedJobs) {
                if((moment.duration('30', 'minutes').asSeconds() > job.input.size / nodeScore.byte_rate)) {
                    jobOut = new JobInfo(job);
                    break;
                }
            }

            if(jobOut) {
                return {
                    reason: JobReason.JOB_AVAILABLE,
                    job: jobOut
                }
            }
            
            return {
                reason: JobReason.RANK_REQUIREMENT,
                job: null
            }
        }
    },
    async scoreMap() {
        return await encoderContainer.self.gateway.scoring.scoreMap()
    },
    async nodeScore(args: any) {
        return await encoderContainer.self.gateway.scoring.nodeScore(args.node_id)
    }
}