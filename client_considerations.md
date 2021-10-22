## Client functionality

* Manage local daemon admin API through HTTTP
* Connect to remote (or local) node for encoding a videoz

The client should spawn a Libp2p daemon to communicate with the local and remote encoding nodes. The problem with this is long loading to execute a command.
Another possible issue with this approach is the daemon would have a libp2p instance then the client would have one as well. 
There should only be one Libp2p instance. However, with on Libp2p instance it would be impossible to self dial the same node. 
So all local operations must be done 100% through http. Not great.

Additionally, local node <---> remote node communication can be done in two ways
* CLI Client --> Background daemon (HTTP) --> remote node
* CLI Client --> *spawns libp2p instance* --> remote node

Both options either require a background daemon to be running or spawn a daemon live.

A last ditch fix to this issue would be requiring all nodes participating in encoding operators to have a public HTTP endpoint.
This is not going to fly in many instances. Maybe a hybrid of http and libp2p? 
HTTP for dedicated public nodes, libp2p for easy node operation with less hassle of HTTPS/SSL setup and domains.

Why Libp2p is important:
* Peer-to-peer communication from the beginning. 
    * Built in encryption
    * No domain neccessary
    * True Device-Device communication
    * 2 way stream communication
* Encoding cluters made of multiple computers possibly behind a NAT firewall.
* File transfer (bitswap) and control messages on the same layer.
* Significantly easier to manage and significantly more flexible 