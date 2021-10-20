

/**
 * Sends an encoding job to server
 */
interface ASK_ENCODE_JOB {
   
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