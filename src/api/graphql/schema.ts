

export const schema = `
    scalar JSON
    scalar Long
    type ResultObj {
        format: String
        uri: String
        size: Long
    }
    type InputObj {
        format: String
        uri: String
        size: Long
    }
    type Job {
        id: String
        status: String
        created_at: String
        last_pinged: String
        start_date: String
        completed_at: String

        input: InputObj
        result: ResultObj
        sync: Boolean
        storageMetadata: JSON
        metadata: JSON
    }

    type QueueJob {
        reason: String
        job: Job
    }

    type GatewayStats {
        queueLag: Int
        completeLag: Int
        averageByteRate: Int
    }

    type Query {
        queueJob(node_id: String): QueueJob 
        scoreMap: JSON
        nodeScore(node_id: String): JSON
        ipfsBootstrap: JSON
        gatewayStats: GatewayStats
    }

`