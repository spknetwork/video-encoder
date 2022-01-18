import Axios from 'axios'

/**
 * @template {Object} T
 * @param {T} options
 * @returns {{[K in keyof T]: Exclude<T[K], undefined>}}
 */
const encodeParams = (options) =>
  // @ts-ignore - it can't infer this
  Object.fromEntries(Object.entries(options).filter(([, v]) => v != null))
/**
 *
 * @param {Record<string, string>} metadata
 */
const encodeMetadata = (metadata = {}) =>
  Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`meta-${k}`, v]))

export const encodePinOptions = (options: any = {}) =>
  encodeParams({
    name: options.name,
    mode: options.mode,
    'replication-min': options.replicationFactorMin,
    'replication-max': options.replicationFactorMax,
    'shard-size': options.shardSize,
    'user-allocations': options.userAllocations?.join(','),
    'expire-at': options.expireAt?.toISOString(),
    'pin-update': options.pinUpdate,
    origins: options.origins?.join(','),
    ...encodeMetadata(options.metadata || {}),
  })

export async function IpfsClusterPinAdd(cid, options) {
  return (await Axios.post(`http://localhost:9094/pins/${cid}`, null, {
      params: encodePinOptions(options)
  })).data;
}
