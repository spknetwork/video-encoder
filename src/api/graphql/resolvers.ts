import moment from "moment";
import { encoderContainer } from ".."
import { peerList } from "../../common/utils";
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
    async queueJob(_, args: any) {
        const queuedJobs = await encoderContainer.self.gateway.jobs.find(
            {
                $or: [{
                    status: JobStatus.QUEUED,
                    attempt_count: {
                      //TODO: do proper dequeueing and marking as failed
                      $lt: 5
                    }
                }, {
                    status: JobStatus.QUEUED,
                    attempt_count: {
                      //TODO: do proper dequeueing and marking as failed
                      $exists: false
                    }
                }]
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
            if(score_node.last_seen) {
                if(score_node.load === 0 && preferred_nodes.length !== 6 && moment().subtract('1', 'day').toDate() < score_node.last_seen) {
                    preferred_nodes.push(score_node.node_id)
                }
            }
        }
        
        //console.log('preferred_nodes', preferred_nodes, scoreMap)
        
        const nodeInfo = await encoderContainer.self.gateway.clusterNodes.findOne({
            node_id: node_id
        })

        const nodeScore = await encoderContainer.self.gateway.scoring.nodeScore(node_id)

        if(nodeInfo?.banned === true) {
            return {
                reason: JobReason.BANNED,
                job: null
            }
        }

        
        if(preferred_nodes.includes(node_id) || ((typeof nodeScore?.low_precision !== 'undefined') ? nodeScore?.low_precision : true)) {
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
            } else if(queuedJobs.length > 0) {
                return {
                    reason: JobReason.RANK_REQUIREMENT,
                    job: null
                }
            } else {
                return {
                    reason: JobReason.NO_JOBS,
                    job: null
                }
            }
            
        }
    },
    async scoreMap() {
        const scoreMap = await encoderContainer.self.gateway.scoring.scoreMap()
        return scoreMap.sort((a, b) => {
            return b.byte_rate - a.byte_rate
        })
    },
    async nodeScore(_, args: any) {
        return await encoderContainer.self.gateway.scoring.nodeScore(args.node_id)
    },
    async ipfsBootstrap() {
       
        const peers = await peerList({
            url: encoderContainer.self.gateway.ipfsClusterUrl
        })
        
        let outPeers = []
        for(let peer of Object.values<any>(peers)) {
            if(peer.ipfs.id) {
                outPeers.push(`/p2p/${peer.ipfs.id}`)
            }
        }
        
        return {
            peers: outPeers
        }
    },
    async gatewayStats() {
        /**
         * Gets all reassignment events over the last day
         * Includes duplicate jobs
         */
        const queueLagRecords = await encoderContainer.self.gateway.activity.activity.find({
            previous_status: 'queued',
            status: "assigned",
            date: {
                $gt: moment().subtract('1', 'day').toDate()
            },
            old_job: {
                $ne: true
            }
        }).toArray()

        const queueRecords = await encoderContainer.self.gateway.jobs.find({
            created_at: {
                $gt: moment().subtract('1', 'day').toDate(),
                $exists: true
            }
        }).toArray()

        let queueLag = 0;
        for(let record of queueLagRecords) {
            queueLag = queueLag + record.duration
        }

        queueLag = queueLag / queueLagRecords.length
        
        
        
        let completeLag = 0;
        let totalSize = 0;
        for(let record of queueRecords) {
            if(record.completed_at) {
                completeLag = completeLag + (record.completed_at - record.created_at)
                totalSize = totalSize + (record.input.size)
            }
        }

        completeLag = completeLag / queueRecords.length
        totalSize = totalSize / queueRecords.length


        /**
         * Defined as the number of average bytes processed per video divided by average lag per video
         * Goal is to find out in a simple fashion if complete is caused by lack of processing resources/bags OR large number of long videos naturally taking longer to process.
         * Average byte rate for videos within last 24 hours. Note: includes queue time as part of equation
         */
        let averageByteRate  = totalSize / (completeLag / 1000)
        


        
        return {
            queueLag: Math.round(queueLag),
            completeLag: Math.round(completeLag / 1000),
            completeLagAdv: async (_, args) => {
                const query = {
                    created_at: {
                        $gt: moment().subtract('1', 'day').toDate(),
                        $exists: true
                    }
                }
                const totalRecords = await encoderContainer.self.gateway.jobs.countDocuments(query)
                const totalDocsLimits = args.percentile * totalRecords
                const aggregateFunc = await encoderContainer.self.gateway.jobs.aggregate([{
                    $match: {
                        ...query,
                    }
                }, {
                    $addFields: {
                        duration: {
                            $divide: [{$subtract: ['$completed_at', '$created_at']}, 1000]
                        }
                    }
                }, {
                    $sort: {
                        duration: 1
                    }
                }, {
                    $limit: Math.round(totalDocsLimits),
                }, {
                    $group:  {
                     _id: "avg1",
                     avg1: {
                       $avg: "$duration"
                     }
                   }
                }]).toArray()

                return Math.round(aggregateFunc[0].avg1)
            },
            averageByteRate: Math.round(averageByteRate)
        }
    },
    async jobInfo(_, args) {
        const jobInfo = await encoderContainer.self.gateway.jobs.findOne({
            id: args.job_id
        })

        if(!jobInfo) {
            return null;
        }

        return jobInfo
    }
}