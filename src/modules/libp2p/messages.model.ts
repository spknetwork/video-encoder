
enum VIDEO_FORMATS {
    mp4 = 'mp4'
}

/**
 * Sends an encoding job to server
 */
export interface REQ_ENCODE_JOB {
   format?: VIDEO_FORMATS
   ipfsHash: string
}

export interface RET_ENCODE_JOB {
    streamId: string
}

interface STATUS_UPDATE {
    id: string

    progress: number
    output_log: string[]
}

interface SUBSCRIBE_UPDATE {
    id: string
}

interface UNSUBSCRIBE_UPDATE {
    id: string
}

/**
 * Designates whether the encoder can accept jobs.
 * This is most applicable when the encoder node is overloaded or performing a graceful shutdown (finishing all jobs before going offline)
 */
export enum JOB_RULE { 
    OPEN,
    CLOSED
}

/**
 * The policy of whether the encoder should accept a job.
 */
export enum JOB_POLICY {
    OPEN, //Open, anyone can upload to the encoder
    PAYWALL, //Payment is required. This won't be implemented initially.
    PRIVATE //Only a select list of users can upload. Authentication required
}

export interface NODE_INFO {
    job_policy: JOB_POLICY
    job_rule: JOB_RULE
    peerInfo: any //IPFS peerInfo
    scripts: {
        motd?: string, //General note for all users connecting to the encoder. Shown before encoding
        upload_motd?: string //Notified to the user when they upload a video
        short_policy?: string //A general policy for uploading/what to look out for
        tos?: string //Terms of service. The legal stuff that an encoder may need to provide to the user
    }
}

export enum MESSAGE_TYPES {
    STATUS_UPDATE,
    SUBSCRIBE_UPDATE,
    UNSUBSCRIBE_UPDATE,
    REQUEST_ENCODE_JOB,
    RESPONE_ENCODE_JOB
}

export function supportedType(messageType) {
    
}