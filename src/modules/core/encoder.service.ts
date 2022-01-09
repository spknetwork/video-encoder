import { CoreService } from './core.service'
import { v4 as uuid } from 'uuid'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { StreamID } from '@ceramicnetwork/streamid'
import tmp from 'tmp'
import ffmpeg from 'fluent-ffmpeg'
import { globSource } from 'ipfs-http-client'
import Path from 'path'
import fs from 'fs'
import EventEmitter from 'events'
import PouchDB from 'pouchdb'
import PouchdbFind from 'pouchdb-find'
import PouchdbUpsert from 'pouchdb-upsert'
import { EncodeStatus } from '../encoder.model'
import URL from 'url'
PouchDB.plugin(PouchdbFind)
PouchDB.plugin(PouchdbUpsert)

enum VideoFormat {
  mp4,
  hls,
  webm,
  mkv,
}
enum VideoCodec {
  h264,
  h265,
  vp8,
  vp9,
  av1,
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

const MAX_BIT_RATE = {
  '1080': '2760k',
  '720': '1327k',
  '480': '763k',
  '360': '423k',
  '240': '155k',
  '144': '640k',
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
    let res = codecData.video_details.filter((str) => {
      return resString.test(str)
    })
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
  events: EventEmitter

  updateSubscriptions: Set<Object>
  constructor(self) {
    this.self = self
    this.pouch = new PouchDB('encoder.db')

    this.events = new EventEmitter()

    this.updateSubscriptions = new Set()
  }

  async updateJob(streamId, updateData) {
    const tileDoc = await TileDocument.load(this.self.ceramic, streamId)
    const content = tileDoc.content
    console.log(streamId)
    console.log(content)
    for (let [key, value] of Object.entries(updateData)) {
      content[key] = value
    }
    content['updated_at'] = new Date().toISOString()
    await tileDoc.update(content)
    this.events.emit('job.status_update', {
      content,
      streamId,
    })
  }
  async executeJobRaw(jobInfo, streamId) {
    const workfolder = tmp.dirSync().name

    const parsedUrl = URL.parse(jobInfo.input.url)

    let sourceUrl
    if (parsedUrl.protocol === 'ipfs:') {
      sourceUrl = `https://ipfs.io/ipfs/${parsedUrl.hostname}`
    } else {
      sourceUrl = jobInfo.input.url
    }
    var command = ffmpeg(sourceUrl)

    var codec = await new Promise((resolve, reject) =>
      ffmpeg.getAvailableEncoders(async (e, enc) => {
        /*if (jobInfo.options.hwaccel !== null || jobInfo.options.hwaccel !== 'none') {
          for (var key of Object.keys(enc)) {
            if (key.includes(`h264_${jobInfo.options.hwaccel}`)) {
              return resolve(key)
            }
          }
        }*/
        for (var key of Object.keys(enc)) {
          if (key.includes(`h264_qsv`)) {
            return resolve(key)
          }
        }
        return resolve('libx264')
      }),
    )
    console.log(`Info: using ${codec}`)
    if(codec === "h264_qsv") {
      command.addOption('-preset', 'slow')
    } else {
      command.addOption('-preset', 'fast')
      command.addOption('-crf', '26')
    }
    command.videoCodec(codec)
    command.audioCodec('aac')
    command.audioBitrate('256k')
    command.outputFPS(30)
    command.addOption('-look_ahead', '1')
    command.addOption('-global_quality', '36')
    //command.addOption('-crf', '23')
    command.addOption('-profile:v', 'main')
    //command.addOption('-rc-lookahead:v', '32')
    //command.addOption('-pix_fmt', 'yuv420p')
    command
      .addOption('-hls_time', 5)
      // include all the segments in the list
      .addOption('-hls_list_size', 0)
      .addOption('-segment_time', 10)
      .addOption('-f', 'segment')
    //command.output(path.join(workfolder, "480p/index.m3u8")).outputFormat("hls")

    this.updateJob(streamId, {
      status: EncodeStatus.RUNNING,
    })
    console.log(jobInfo)
    let stage = 0
    let sizes = []
    let codecData
    let duration
    for (var profile of jobInfo.profiles) {
      var ret = command.clone()
      sizes.push(profile.size)
      ret.size(profile.size)
      ret.on(
        'progress',
        ((progress) => {
          //console.log(jobInfo)
          for (let key in progress) {
            progress[key] = progress[key] || 0
          }
          const progressPct =
            (stage / jobInfo.profiles.length + progress.percent / 100 / jobInfo.profiles.length) *
            100
          this.events.emit('job.progress', streamId.toString(), {
            stage,
            stages: jobInfo.profiles.length,
            progress,
            progressPct,
          })
          this.pouch.upsert(jobInfo.id, (doc) => {
            doc.progress = progress
            doc.progressPct = progressPct
            return doc
          })
        }).bind(this),
      )
      ret.on('end', () => {
        //this.events.emit('done', jobInfo.id)
        //this.statusInfo[jobInfo.id].done = true;
      })

      var promy = new Promise((resolve, reject) => {
        ret
          .on('end', () => {
            resolve(null)
          })
          .on('error', (err) => {
            reject(err)
          })
          .on('codecData', (data) => {
            codecData = data
            duration = codecData.duration
          })
      })

      ret.videoBitrate(MAX_BIT_RATE[String(profile.size.split('x')[1])])
      fs.mkdirSync(Path.join(workfolder, `${String(profile.size.split('x')[1])}p`))

      //ret.save(path.join(workfolder, `${String(size.split('x')[1])}p`, 'index.m3u8'))
      console.log(Path.join(workfolder, `${String(profile.size.split('x')[1])}p`, 'index.m3u8'))

      ret.addOption(`-segment_format`, 'mpegts')
      ret.addOption(
        '-segment_list',
        Path.join(workfolder, `${String(profile.size.split('x')[1])}p`, 'index.m3u8'),
      )
      ret.save(
        Path.join(
          workfolder + '/' + `${String(profile.size.split('x')[1])}p`,
          `${String(profile.size.split('x')[1])}p_%d.ts`,
        ),
      )
      await promy

      stage = stage + 1
    }

    var manifest = this._generateManifest(codecData, sizes)
    fs.writeFileSync(Path.join(workfolder, 'manifest.m3u8'), manifest)

    try {
      this.updateJob(streamId, {
        status: EncodeStatus.UPLOADING,
      })
      const ipfsHash = await this.self.ipfs.add(globSource(workfolder, '**'), {
        pin: false,
        wrapWithDirectory: true,
      })
      fs.unlink(workfolder, () => {})

      this.updateJob(streamId, {
        status: EncodeStatus.COMPLETE,
        outCid: ipfsHash.cid.toString(),
        total_size: ipfsHash.size,
      })
      return ipfsHash.cid.toString()
    } catch (ex) {
      this.updateJob(streamId, {
        status: EncodeStatus.FAILED,
      })
      fs.unlink(workfolder, () => {})
    }
  }
  async executeJob(jobInfoOrId: Object | string) {
    let jobInfo
    let streamId
    if (typeof jobInfoOrId === 'string') {
      try {
        streamId = StreamID.fromString(jobInfoOrId)
        jobInfo = (await TileDocument.load(this.self.ceramic, streamId)).content
      } catch {
        throw new Error('Error not streamId')
      }
    } else if (typeof jobInfoOrId === 'object') {
      jobInfo = jobInfoOrId
    } else {
      throw new Error('Invalid input')
    }
    this.events.on('job.progress', (e, b) => {
      console.log('receiving progress here 100%')
      console.log(e, b)
    })

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
      return `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${tutils.getBandwidth(
        tutils.getHeight(size),
      )},CODECS="avc1.4d001f,mp4a.40.2",RESOLUTION=${tutils.calculateWidth(
        codecData,
        tutils.getHeight(size),
      )},NAME=${tutils.getHeight(size)}\n`
    }
    let result = master
    console.log('availableSizes: ', sizes)
    sizes.forEach((size) => {
      // log(`format: ${JSON.stringify(formats[size])} , size: ${size}`)
      result += resolutionLine(size)
      result += String(size.split('x')[1]) + 'p/index.m3u8\n'
    })

    return result
  }
  async cleanUpJob() {}
  async createJob(url, peerId?, client_id?) {
    const id = uuid()
    const tileDocument = await TileDocument.create(
      this.self.ceramic,
      {
        id,
        client_peerid: peerId,
        client_id: client_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        peerid: this.self.p2pService.libp2p.peerId.toB58String(),
        input: {
          url,
        },
        profiles: [
          {
            name: '1080p',
            size: '1920x1080',
          },
          {
            name: '720p',
            size: '1080x720',
          },
          {
            name: '480p',
            size: '720x480',
          },
        ],
        output: [],
        status: EncodeStatus.PENDING,
        original_size: -1,
        total_size: -1,
      },
      {},
      {
        anchor: true,
        publish: false,
      },
    )
    //todo store in database

    this.pouch.upsert(id, (doc) => {
      doc['streamId'] = tileDocument.id.toString()
      doc['status'] = EncodeStatus.PENDING
      doc['progress'] = 0
      return doc
    })
    return {
      id,
      streamId: tileDocument.id.toString(),
    }
  }
  async start() {
    /*const data = await this.createJob('Qma9ZjjtH7fdLWSrMU43tFihvSN59aQdes7f5KW6vGGk6e', 'QmctF7GPunpcLu3Fn77Ypo657TA9GpTiipSDUUMoD2k5Kq', 'did:3:kjzl6cwe1jw14aijwpxwaa1ybg708bp9n5jqt8q89j6yrdqvt8tfxdxw1q5dpxh')
        console.log(data)
        this.executeJob(data.streamId)*/
  }
}
