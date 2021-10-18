import { encode as CborEncode, decode as CborDecode } from '@ipld/dag-cbor'

export function encode(msg) {
  if (!msg.app) {
    msg.app = 'spk.network'
  }
  return CborEncode(msg)
}

export function decode(msg) {
  const obj = CborDecode(msg) as any
  if (typeof obj !== 'object') {
    throw new Error('[frame-codec]: Invalid message type [0]')
  }
  if (obj.app !== 'spk.network') {
    throw new Error('[frame-codec]: Invalid message type [1]')
  }
  return obj
}
