import { Ed25519Provider } from 'key-did-provider-ed25519'
import KeyResolver from 'key-did-resolver'
import { DID } from 'dids'


export const did = new DID({ resolver: KeyResolver.getResolver() })


export async function unwrapJWS(payload) {
    let data = await did.verifyJWS(payload)
    const realDid = data.kid.split('#')[0]
    return {
        ...data,
        did: realDid
    };
}