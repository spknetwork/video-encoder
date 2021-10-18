import { CoreService } from './core.service'
import {v4 as uuid} from 'uuid'
import { TileDocument } from '@ceramicnetwork/stream-tile';
import {StreamID} from '@ceramicnetwork/streamid'
import tmp from 'tmp'
import ffmpeg from 'fluent-ffmpeg'
import {globSource} from 'ipfs-http-client'
import Path from 'path'
import fs from 'fs'
import EventEmitter from 'events'
import PouchDB from 'pouchdb'
import PouchdbFind from 'pouchdb-find'
import PouchdbUpsert from 'pouchdb-upsert'
PouchDB.plugin(PouchdbFind);
PouchDB.plugin(PouchdbUpsert);

enum VideoFormat {
    mp4,
    hls,
    webm,
    mkv
}
enum VideoCodec {
    h264,
    h265,
    vp8,
    vp9,
    av1
}
interface EncodeOutput {
    res: string
    format: VideoFormat

}
interface EncodeJobConfig {
    outputs: Array<EncodeOutput>
}
interface EncodeInput {
    type: string
    url: string
}
enum EncodeStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    LOADING = 'loading',
    RUNNING = 'running',
    FAILED = 'failed',
    UPLOADING = 'uploading',
    COMPLETE = 'complete',
}
const MAX_BIT_RATE = {
    '1080': '2760k',
    '720': '1327k',
    '480': '763k',
    '360': '423k',
    '240': '155k',
    '144': '640k'
}
const tutils = {
    /**
   * get an array of possible downsampled bitrates
   * @param  {number} height Video height, grabbed from ffmpeg probe
   * @return {array}        Array of possible downsample sizes.
   */
    getPossibleBitrates: function (height) {
        if (!height) {
            return null
        }

        if (height < 144) {
            // very small bitrate, use the original format.
            return ['?x' + height]
        } else if (height < 240) {
            return ['?x144']
        } else if (height < 360) {
            return ['?x240', '?x144']
        } else if (height < 480) {
            return ['?x360', '?x240', '?x144']
        } else if (height < 720) {
            return ['?x480', '?x360', '?x240', '?x144']
        } else if (height < 1080) {
            return ['?x720', '?x480', '?x360', '?x240', '?x144']
        } else if (height < 1440) {
            return ['?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
        } else if (height < 2160) {
            return ['?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
        } else {
            return ['?x2160', '?x1440', '?x1080', '?x720', '?x480', '?x360', '?x240', '?x144']
        }
    },
    getBandwidth: function (height) {
        if (!height) {
            return null
        }

        // default to the lowest height. in case the video is smaller than that.
        return MAX_BIT_RATE[String(height)] || MAX_BIT_RATE['144']
    },
    /**
     * get video height from size String
     * @param  {String} size string from ffmpeg @example '?x720'
     * @return {number}      height integer.
     */
    getHeight: function a(size) {
        return parseInt(size.split('x')[1])
    },
    calculateWidth: function (codecData, currentHeight) {
        let resString = /^\d{3,}x\d{3,}/g // test
        // test all video_details against resString
        let res = codecData.video_details.filter((str) => { return (resString.test(str)) })
        if (res && res.length > 0) {
            res = res[0]
            res = res.split('x')
        } else {
            console.log('RES IS NULL , ', res)
            return null
        }
        let width = parseInt(res[0])
        let height = parseInt(res[1])

        let s = parseInt(currentHeight)

        return String(Math.floor((width * s) / height) + 'x' + s)
    },
}
export class EncoderService {
    self: CoreService
    pouch: PouchDB
    constructor(self) {
        this.self = self;
        this.pouch = new PouchDB("encoder.db");
    }

    async updateJob(streamId, updateData ) {
        const tileDoc = await TileDocument.load(this.self.ceramic, streamId)
        const content = tileDoc.content;
        console.log(streamId)
        console.log(content)
        for(let [key, value] of Object.entries(updateData)) {
            content[key] = value
        }
        content['updated_at'] = new Date().toISOString()
        await tileDoc.update(content)
    }
    async executeJobRaw(jobInfo, streamId) {
        const workfolder = tmp.dirSync().name;
        const sourceUrl = `https://ipfs.3speak.tv/ipfs/${jobInfo.input.cid}`
        var command = ffmpeg(sourceUrl);
        

        
        var codec = await new Promise((resolve, reject) => ffmpeg.getAvailableEncoders(async (e, enc) => {
            /*if (jobInfo.options.hwaccel !== null || jobInfo.options.hwaccel !== "none") {
                for (var key of Object.keys(enc)) {
                    if (key.includes(`h264_${jobInfo.options.hwaccel}`)) {
                        return resolve(key)
                    }
                }
            }*/
            return resolve("h264_qsv");
        }))
        command.videoCodec(codec);
        command.audioCodec("aac")
        command.audioBitrate('256k')
        command.addOption('-hls_time', 5)
        // include all the segments in the list
        .addOption('-hls_list_size', 0)
        .addOption('-segment_time', 10)
        .addOption('-f', 'segment')
        //command.output(path.join(workfolder, "480p/index.m3u8")).outputFormat("hls")

        this.updateJob(streamId, {
            status: EncodeStatus.RUNNING
        })
        console.log(jobInfo)
        let sizes = []
        let codecData;
        let duration;
        for (var profile of jobInfo.profiles) {
            var ret = command.clone();
            sizes.push(profile.size);
            ret.size(profile.size);
            ret.on('progress', ((progress) => {
                //this.events.emit("progress", jobInfo.id, progress)
                console.log(progress)
                this.pouch.upsert(jobInfo.id, doc => {
                    doc.progress = progress
                    return doc
                })
            }).bind(this))
            ret.on('end', () => {
                //this.events.emit('done', jobInfo.id)
                //this.statusInfo[jobInfo.id].done = true;
                
            })
            var promy = new Promise((resolve, reject) => {
                ret.on('end', () => {
                    resolve(null);
                }).on('error', (err) => {
                    reject(err)
                }).on('codecData', (data) => {
                    codecData = data;
                    duration = codecData.duration;
                })
            })
            ret.videoBitrate(MAX_BIT_RATE[String(profile.size.split('x')[1])])
            fs.mkdirSync(Path.join(workfolder, `${String(profile.size.split('x')[1])}p`))
            //ret.save(path.join(workfolder, `${String(size.split('x')[1])}p`, 'index.m3u8'))
            console.log(Path.join(workfolder, `${String(profile.size.split('x')[1])}p`, 'index.m3u8'))
            ret.addOption(`-segment_format`, "mpegts")
            ret.addOption('-segment_list', Path.join(workfolder, `${String(profile.size.split('x')[1])}p`, 'index.m3u8'))
            ret.save(Path.join(workfolder + '/' + `${String(profile.size.split('x')[1])}p`, `${String(profile.size.split('x')[1])}p_%d.ts`))
            await promy;

            this.pouch.upsert(jobInfo.id, (doc) => {

            })
        }

        var manifest = this._generateManifest(codecData, sizes)
        fs.writeFileSync(Path.join(workfolder, "manifest.m3u8"), manifest)

        try {
            this.updateJob(streamId, {
                status: EncodeStatus.UPLOADING
            })
            const ipfsHash = await this.self.ipfs.add(globSource(workfolder, {recursive: true} ), {pin:false})
            fs.unlink(workfolder, () => {})
            console.log(ipfsHash)
            this.updateJob(streamId, {
                status: EncodeStatus.COMPLETE
            })
            return ipfsHash.cid.toString();
        } catch {
            fs.unlink(workfolder, () => {})

        }
    }
    async executeJob(jobInfoOrId: Object|string) {
        let jobInfo;
        let streamId;
        if(typeof jobInfoOrId === 'string') {
            try {
                streamId = StreamID.fromString(jobInfoOrId)
                jobInfo = (await TileDocument.load(this.self.ceramic, streamId)).content

            } catch {
                throw new Error('Error not streamId')
            }
        } else if(typeof jobInfoOrId === 'object') {
            jobInfo = jobInfoOrId;
        } else {
            throw new Error('Invalid input')
        }
        
        const out = await this.executeJobRaw(jobInfo, streamId)
        console.log(out)
    }
    /**
     * generate the master manifest for the transcoded video.
     * @return {Promise<String>}      generated Manifest string.
     */
     _generateManifest(codecData, sizes) {
        let master = '#EXTM3U\n'
        master += '#EXT-X-VERSION:6\n'
        let resolutionLine = (size) => {
            return `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${tutils.getBandwidth(tutils.getHeight(size))},CODECS="avc1.4d001f,mp4a.40.2",RESOLUTION=${tutils.calculateWidth(codecData, tutils.getHeight(size))},NAME=${tutils.getHeight(size)}\n`
        }
        let result = master
        console.log('availableSizes: ', sizes)
        sizes.forEach((size) => {
            // log(`format: ${JSON.stringify(formats[size])} , size: ${size}`)
            result += resolutionLine(size)
            result += String(size.split('x')[1]) + 'p/index.m3u8\n'
        })

        return result;
    }
    async cleanUpJob() {

    }
    async createJob(sourceCID, peerId, client_id) {
        const id = uuid();
        const tileDocument = await TileDocument.create(this.self.ceramic, {
            id,
            client_peerid: peerId,
            client_id: client_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            peerid: this.self.p2pService.libp2p.peerId.toB58String(),
            input: {
                cid: sourceCID
            },
            profiles: [
                {
                    name: "1080p",
                    size: "1920x1080"
                },
                {
                    "name": "720p",
                    size: "1080x720"
                },
                {
                    "name": "480p",
                    size: "720x480"
                }
            ],
            output: [],
            status: EncodeStatus.PENDING,
            original_size: -1,
            total_size: -1
        }, {}, {
            anchor: true,
            publish: false
        })
        //todo store in database
        
        this.pouch.upsert(id, (doc) => {
            doc['streamId'] = tileDocument.id.toString()
            doc['status'] = EncodeStatus.PENDING
            doc['progress'] = 0
            return doc
        })
        return {
            id,
            streamId: tileDocument.id.toString()
        }
    }
    async start() {
        
    }
}