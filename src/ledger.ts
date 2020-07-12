import "regenerator-runtime"
//import TransportU2F from "@ledgerhq/hw-transport-u2f"
import TransportHID from "@ledgerhq/hw-transport-node-hid-noevents"
import Btc from "@ledgerhq/hw-app-btc"
import { compressPublicKey } from './utils'
import { Config } from './interfaces'
import AsyncLock from 'async-lock'

export default class BitcoinLedgerService {
	config: Config
	lock: AsyncLock

	constructor(config:Config) {
		this.config = config
		this.lock = new AsyncLock()
	}

	getP2SHPath = (account, change, index) => {
		return "49'/" + (this.config.networkName == 'testnet' ? '1' : '0') + "'/" + account + "'/" + change + "/" + index
	}

	getPath = (purpose, account, change, index) => {
		return  purpose + "'/" + (this.config.networkName == 'testnet' ? '1' : '0') + "'/" + account + "'/" + change + "/" + index
	}

	explodePath = (derivationPath) => {
		return derivationPath.replace(/\D+/g, ' ').trim().split(' ').map(e => parseInt(e))
	}

	public getPublicKeyFromPath(path: string, ledgerCb?: any) {
		if (!ledgerCb)
			ledgerCb = (phase, status) => { }

		ledgerCb(0, 'wait')

		return this.lock.acquire('interaction', () => {
			return new Promise((resolve, reject) => {
				TransportHID.open("").then(transport => {
					ledgerCb(1, 'wait')
	
					const btc = new Btc(transport)
					ledgerCb(2, 'wait')
					btc.getWalletPublicKey(path, { verify: false, format: 'p2sh' }).then(result => {
						//const comppk = compressPublicKey(result.publicKey)
						ledgerCb(2, 'success')
						resolve(result.publicKey)
					}).catch(err => {
						if (err.statusCode == 27010)
							ledgerCb(0, 'error')
						else if (err.id == 'U2F_5')
							ledgerCb(1, 'error')
						else
							ledgerCb(2, 'error')
	
						reject(err)
					})
				}).catch(err => {
					ledgerCb(0, 'error')
					reject(err)
				})
			})
		})
	}

	isConnected() {
		return new Promise((resolve, reject) => {
			return TransportHID.open("").then(transport => {
				resolve(true)
			}).catch(err => {
				reject(err)
			})
		})
	}
}
