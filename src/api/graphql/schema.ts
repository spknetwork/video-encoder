

export const schema = `
    scalar JSON
    type ResultObj {
        format: String
        uri: String
        size: Int
    }
    type InputObj {
        format: String
        uri: String
        size: Int
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

    type Query {
        queueJob: QueueJob 
        scoreMap: JSON
        nodeScore(node_id: String): JSON
    }

`