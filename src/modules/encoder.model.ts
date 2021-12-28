
export interface ffmpegProgress {
    frames: number
    currentFps?: number
    currentKbps?: number
    targetSize?: number
    timemark: string //FFMPEG timemark
    percent: number
}
export enum EncodeStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    LOADING = 'loading',
    RUNNING = 'running',
    FAILED = 'failed',
    UPLOADING = 'uploading',
    COMPLETE = 'complete',
}

export enum JobStatus {
    QUEUED = "queued",
    ASSIGNED = "assigned",
    RUNNING = "running",
    COMPLETE = 'complete'
}

interface ResultObj {
    format: string,
    uri: string
    size: Number
}

interface InputObj {
    format?: string,
    uri: string
}

export interface GatewayJob {
    id: string,
    status: JobStatus,
    created_at: Date,
    assigned_date: Date,
    last_pinged: Date | null, //When node last pinged. After 5 minutes the gateway will reassign
    start_date: Date | null,
    finished_date: Date | null,

    input: InputObj, 
    result: ResultObj | null 
    assigned_to: string | null
}


export interface GatewayWorkerInfo {
    node_id: string, //DID of node
    peer_id: string | null, //libp2p peerID
    last_seen: Date,
    first_seen: Date,
    cryptoAccounts: {
        hive: string | Date
    },
    nodeInfo: {
        name: string | null
    }
}