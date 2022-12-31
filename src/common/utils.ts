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

/**
 * @param {any} data
 * @returns {API.ClusterInfo}
 */
 const toClusterInfo = ({
  id,
  addresses,
  version,
  commit,
  peername: peerName,
  rpc_protocol_version: rpcProtocolVersion,
  cluster_peers: clusterPeers,
  cluster_peers_addresses: clusterPeersAddresses,
  ipfs,
  error
}) => ({
  id,
  addresses,
  version,
  commit,
  peerName,
  rpcProtocolVersion,
  clusterPeers,
  clusterPeersAddresses,
  ipfs,
  error
})


/**
 * @param {API.Config} cluster
 * @param {API.RequestOptions} [options]
 * @returns {Promise<API.ClusterInfo[]>}
 */
 export const peerList = async (cluster, options = {} as any) => {
  const response = await Axios.get(`${cluster.url}/peers`, {
      headers: {Authorization: `Bearer ${options.token}`}, 
      responseType: 'stream'
  });

const stream = response.data;

// stream.on('data', data => {
//     console.log(data);
// });

// stream.on('end', () => {
//     console.log("stream done");
// });
  let infos = []
  for await (const d of stream) {
    // console.log(JSON.parse(d.toString()))
    infos.push(toClusterInfo(JSON.parse(d.toString())))
  }
  return infos
}