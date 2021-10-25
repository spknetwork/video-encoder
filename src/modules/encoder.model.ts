
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