const Socket = require('json-rpc-tls').Socket
const AsyncLock = require('async-lock')

import * as electrumApi from 'electrum-api'

// IF you find a less hacky way, let me know.
// Should be some bug within json-rpc-tls
// https://stackoverflow.com/a/54184343
process.on('uncaughtException', function(err) {
  if (!err.message.startsWith("getaddrinfo ENOTFOUND")) {
    throw err
  }
})

let Blockchain = electrumApi.Blockchain
let Utils = electrumApi.Utils

class ElectrumConnection {
  socket: any
  id: number
  network: any
  url: string
  port: number
  idLock : typeof AsyncLock

  constructor(url:string, port:number, network:any) {
    this.network = network
    this.id = 1
    this.url = url
    this.port = port
    this.idLock = new AsyncLock()
  }

  connect() {
    return Socket.tlsSocket(this.url, this.port, {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    }).then(async (socket) => {
      socket.setEncoding('utf8')
      socket.setKeepAlive(false)
      socket.setNoDelay(true)
      this.socket = socket
      return true
    })
  }

  async keepAlive(ping) {
    if (ping) {
      let id : number
      await this.idLock.acquire('do-request', () => {
        id = this.id
        this.id += 1
      })
    
      await Blockchain.request({
        socket: this.socket,
        id: id,
        params: []
      }, 'server.ping')
    }
    
    setTimeout(() => {
      this.keepAlive(true)
    }, 1 * 60 * 1000)
  }

  async addressListUnspent(address) {
    let id : number
    await this.idLock.acquire('do-request', () => {
        id = this.id
        this.id += 1
    })
    const response = await Blockchain.scriptHashListUnspent({
      socket: this.socket,
      id: id,
      params: [Utils.addressToScriptHash(address, this.network)]
    })

    return response.result
  }

  async addressGetHistory(address) {
    let id : number
    await this.idLock.acquire('do-request', () => {
      id = this.id
      this.id += 1
    })
    const response = await Blockchain.scriptHashGetHistory({
      socket: this.socket,
      id: id,
      params: [Utils.addressToScriptHash(address, this.network)]
    })

    return response.result
  }

  async transactionGet(txid) {
    let id : number
    await this.idLock.acquire('do-request', () => {
      id = this.id
      this.id += 1
    })
    const response = await Blockchain.transactionGet({
      socket: this.socket,
      id: id,
      params: [txid]
    })
    
    return response.result
  }
}

export default ElectrumConnection
