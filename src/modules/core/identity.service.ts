import { Ed25519Provider } from "key-did-provider-ed25519";
import Crypto from 'crypto'
import KeyResolver from 'key-did-resolver'
import { DID } from 'dids'

import { CoreService } from "./core.service";

export class IdentityService {
    self: CoreService;
    identity: DID;

    constructor(self) {
        this.self = self
    }

    async start() {
        
        let privateKey = null
        if(this.self.config.get('node.privateKey')) {
            privateKey = Buffer.from(this.self.config.get('node.privateKey'), 'base64')
        } else {
            privateKey = Crypto.randomBytes(32);
            const hex = privateKey.toString('base64')
            this.self.config.set('node.privateKey', hex);
        }
        const key = new Ed25519Provider(privateKey)
        const did = new DID({ provider:key, resolver: KeyResolver.getResolver() })
        await did.authenticate()

        await this.self.ceramic.setDID(did)
        
        this.identity = did;

        console.info(`Logged in with ${did.id}`)
    }
}