import { CoreService } from './core.service'
import { v4 as uuid } from 'uuid'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import { StreamID } from '@ceramicnetwork/streamid'
import tmp from 'tmp'
import ffmpeg from 'fluent-ffmpeg'
import { globSource } from 'ipfs-http-client'
import Path from 'path'
import fs from 'fs/promises'
import EventEmitter from 'events'
import PouchDB from 'pouchdb'
import PouchdbFind from 'pouchdb-find'
import PouchdbUpsert from 'pouchdb-upsert'
import { EncodeStatus } from '../encoder.model'
import URL from 'url'
import Downloader from 'nodejs-file-downloader'
import execa from 'execa'
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
  '1080': '2000000', //2000kb/s
  '720': '1327' + '000',
  '480': '763' + '000',
  '360': '423' + '000',
  '240': '155' + '000',
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

  async updateJob(job_id, updateData) {
    try {
      // const tileDoc = await TileDocument.load(this.self.ceramic, streamId)
      // const content = tileDoc.content
      await this.pouch.upsert(job_id, (doc) => {
        console.log('updateData - 141', updateData)
        for (let [key, value] of Object.entries(updateData)) {
          doc[key] = value
        }
        doc['updated_at'] = new Date().toISOString()
        
        return doc;
      })
      const docNew = await this.pouch.get(job_id)
      // for (let [key, value] of Object.entries(updateData)) {
      //   content[key] = value
      // }
      // content['updated_at'] = new Date().toISOString()
      // await tileDoc.update(content)
      this.events.emit('job.status_update', {
        content: docNew,
        streamId: docNew.streamId,
      })
    } catch (ex) {
      console.log(ex)
    }
  }
  async executeJobRaw(jobInfo, streamId) {
    const workfolder = tmp.dirSync().name
    const downloadFolder = tmp.dirSync().name

    const parsedUrl = URL.parse(jobInfo.input.url)

    let sourceUrl
    if (parsedUrl.protocol === 'ipfs:') {
      sourceUrl = `https://ipfs.io/ipfs/${parsedUrl.hostname}`
    } else {
      sourceUrl = jobInfo.input.url
    }

    const startTime = new Date();
    let download_pct = 0;
    const slowUpdate = setInterval(() => {
      this.pouch.upsert(jobInfo.id, (doc) => {
        doc.download_pct = download_pct;
        return doc
      })
    }, 500)
    const downloadProcess = execa('wget', [sourceUrl, '-O', Path.join(downloadFolder, `${jobInfo.id}_src.mp4`)], {
      // on
    })

    if(downloadProcess.stderr) {
      //   downloadProgress.stderr.pipe(process.stdout)
        for await(let chunk of downloadProcess.stderr) {
          const outArray = chunk.toString().split(' ')
          // console.log(outArray)
          const percentage = outArray.find(e => e.includes('%'));
          if(percentage) {
              const pctArray = percentage.split('%')
              if(Number(pctArray[0]) !== 0) {
                  // console.log(pctArray[0])
                  download_pct = Number(pctArray[0])
              }
          }
        }
    }
    await downloadProcess
    // console.log(stdout)
    // const downloader = new Downloader({
    //   url: sourceUrl,
    //   directory: downloadFolder,
    //   fileName: `${jobInfo.id}_src.mp4`,
    //   maxAttempts: 6, //Default is 1.
    //   onError: function (error) {
    //     //You can also hook into each failed attempt.
    //     console.log("Error from attempt ", error);
    //   },
    //   onProgress: (inputPercentage, chunk, remainingSize) => {
    //     //Gets called with each chunk.
    //     download_pct = Number(inputPercentage);
    //   },
    // });
    
    let srcVideo = Path.join(downloadFolder, `${jobInfo.id}_src.mp4`);
    // try {
    //   await downloader.download();
    //   clearInterval(slowUpdate)
    // } catch (error) {
    //   //If all attempts fail, the last error is thrown.
    //   console.log("Final fail", error);
    //   fs.rmdirSync(downloadFolder)
    //   clearInterval(slowUpdate)
    //   throw error;
    // }
    console.log(`Downloaded to `, srcVideo, `in ${new Date().getTime() - startTime.getTime()}ms`)

    var command = ffmpeg(srcVideo)

    var codec = await new Promise((resolve, reject) =>
      ffmpeg.getAvailableEncoders(async (e, enc) => {
        /*if (jobInfo.options.hwaccel !== null || jobInfo.options.hwaccel !== 'none') {
          for (var key of Object.keys(enc)) {
            if (key.includes(`h264_${jobInfo.options.hwaccel}`)) {
              return resolve(key)
            }
          }
        }*/
        if(e) {
          console.log(e)
        }
        if(enc) {
          for (var key of Object.keys(enc)) {
            if (key.includes(`h264_qsv`)) {
              return resolve(key)
            }
          }
        }
        return resolve('libx264')
      }),
    )
    console.log(`Info: using ${codec}`)
    if(codec === "h264_qsv") {
      command.addOption('-preset', 'slow')
      command.addOption('-look_ahead', '1')
      command.addOption('-global_quality', '36')
    } else {
      command.addOption('-preset', 'fast')
      command.addOption('-crf', '26')
    }
    command.videoCodec(codec)
    command.audioCodec('aac')
    command.audioBitrate('256k')
    command.outputFPS(30)
    //command.addOption('-crf', '23')
    command.addOption('-profile:v', 'main')
    command.addOption('-max_muxing_queue_size', '1024')
    //command.addOption('-rc-lookahead:v', '32')
    //command.addOption('-pix_fmt', 'yuv420p')
    command
      .addOption('-hls_time', 5)
      // include all the segments in the list
      .addOption('-hls_list_size', 0)
      .addOption('-segment_time', 10)
      .addOption('-f', 'segment')
    //command.output(path.join(workfolder, "480p/index.m3u8")).outputFormat("hls")

    this.updateJob(jobInfo.id, {
      status: EncodeStatus.RUNNING,
    })

    console.log('Started at', `in ${new Date().getTime() - startTime.getTime()}ms`)
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
          this.events.emit('job.progress', jobInfo.id.toString(), {
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
          .on('end', (stdout, stderr) => {
            console.log(stderr)
            if(stderr.includes('Invalid data found when processing input')) {
              return reject('Invalid data found when processing input')
            }
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
      await fs.mkdir(Path.join(workfolder, `${String(profile.size.split('x')[1])}p`))

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
    await fs.writeFile(Path.join(workfolder, 'manifest.m3u8'), manifest)

    try {
      await this.updateJob(jobInfo.id, {
        status: EncodeStatus.UPLOADING,
      })
      let ipfsHash;
      for await(let addResult of this.self.ipfs.addAll(globSource(workfolder, '**'), {
        pin: false,
        wrapWithDirectory: true,
      })) {
        ipfsHash = addResult;
      }
      
      await fs.rm(workfolder, {recursive: true, force: true})
      await fs.rm(downloadFolder, {recursive: true, force: true})
      console.log('Removing local temp content', workfolder, ipfsHash.cid.toString())

      await this.updateJob(jobInfo.id, {
        status: EncodeStatus.COMPLETE,
        outCid: ipfsHash.cid.toString(),
        total_size: ipfsHash.size,
      })
      return ipfsHash.cid.toString()
    } catch (ex) {
      console.log(ex)
      this.updateJob(jobInfo.id, {
        status: EncodeStatus.FAILED,
      })
      await fs.rm(workfolder, {recursive: true, force: true})
      await fs.rm(downloadFolder, {recursive: true, force: true})
    }
  }
  async executeJob(jobInfoOrId: Object | string) {
    let jobInfo
    let streamId
    let jobId
    if (typeof jobInfoOrId === 'string') {
      try {
        // streamId = StreamID.fromString(jobInfoOrId)
        //jobInfo = (await TileDocument.load(this.self.ceramic, streamId)).content
        jobInfo = await this.pouch.get(jobInfoOrId)
      } catch (ex) {
        console.log(ex)
        throw new Error('Error not streamId')
      }
    } else if (typeof jobInfoOrId === 'object') {
      jobInfo = jobInfoOrId
    } else {
      throw new Error('Invalid input')
    }
    // this.events.on('job.progress', (e, b) => {

    // })

    const out = await this.executeJobRaw(jobInfo, streamId)
    console.log(out)
  }
  /**
   * generate the master manifest for the transcoded video.
   * @return {Promise<String>}      generated Manifest string.
   */
  _generateManifest(codecData, sizes) {
    let master = '#EXTM3U\n'
    master += '#EXT-X-VERSION:3\n'
    let resolutionLine = (size) => {
      return `#EXT-X-STREAM-INF:BANDWIDTH=${tutils.getBandwidth(
        tutils.getHeight(size),
      )},CODECS="mp4a.40.2",RESOLUTION=${tutils.calculateWidth(
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
    const initialJob = {
      id,
      client_peerid: peerId,
      client_id: client_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      peerid: (await this.self.ipfs.id()).id,
      input: {
        url,
      },
      profiles: [
        {
          name: '1080p',
          size: '?x1080',
        },
        {
          name: '720p',
          size: '?x720',
        },
        {
          name: '480p',
          size: '?x480',
        },
      ],
      output: [],
      status: EncodeStatus.PENDING,
      original_size: -1,
      total_size: -1,
    }
    // const tileDocument = await TileDocument.create(
    //   this.self.ceramic,
    //   initialJob,
    //   {},
    //   {
    //     anchor: true,
    //     publish: false,
    //   },
    // )

    // const fakeStreamId = id
    

    await this.pouch.upsert(initialJob.id, (doc) => {
      for(let key in initialJob) {
        doc[key] = initialJob[key]
      }
      // doc['streamId'] = tileDocument.id.toString()
      doc['streamId'] = id
      
      doc['status'] = EncodeStatus.PENDING
      doc['progress'] = 0
      return doc
    })
    return {
      id,
      streamId: id,
    }
  }
  async start() {
    /*const data = await this.createJob('Qma9ZjjtH7fdLWSrMU43tFihvSN59aQdes7f5KW6vGGk6e', 'QmctF7GPunpcLu3Fn77Ypo657TA9GpTiipSDUUMoD2k5Kq', 'did:3:kjzl6cwe1jw14aijwpxwaa1ybg708bp9n5jqt8q89j6yrdqvt8tfxdxw1q5dpxh')
        console.log(data)
        this.executeJob(data.streamId)*/
  }
}
