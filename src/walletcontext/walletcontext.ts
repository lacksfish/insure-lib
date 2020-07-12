import * as bitcoinjs from 'bitcoinjs-lib'
import ElectrumConnection from './electrum'

interface Derivation {
  address: string,
  scriptObj: bitcoinjs.Payment,
  derivationPath: string,
  utxos: Array<any>,
  used: boolean,
  pubKeyHex: string
}

class WalletContext {

  ledger
  network
  electrum: ElectrumConnection
  derivations: Array<Derivation>

  constructor(ledger, electrum: ElectrumConnection, network, derivations:Array<Derivation>|null) {
    if (!derivations) {
      this.derivations = []
    } else {
      this.derivations = derivations
    }

    this.electrum = electrum
    this.ledger = ledger
    this.network = network
  }

  getDerivationsWithUTXOs() {
    return this.derivations.filter(deri => deri.utxos.length > 0)
  }

  addAddress(address:string, derivationPath:string, scriptObj:any, pubKeyHex:string, addressData:any = null): Promise<boolean> {
    let self = this

    if (!!addressData) {
      addressData = Promise.resolve(addressData)
    } else {
      addressData = self.fetchAddressInformation(address)
    }

    return addressData.then((addressData:any) => {
      let derivation:Derivation = {
        address: address,
        scriptObj: scriptObj,
        derivationPath: derivationPath,
        utxos: addressData.utxos,
        used: addressData.used,
        pubKeyHex: pubKeyHex
      }

      self.derivations.push(derivation)
      return addressData.used
    })
  }

  fetchAddressInformation = (address: string): Promise<any> => {
    // Check if address has history
    return this.electrum.addressGetHistory(address)
      .then((result) => {
        if (result.length > 0) {
          // check if address has utxos
          return this.electrum.addressListUnspent(address)
            .then(async (result) => {
              if (result.length == 0){
                return {
                  utxos: [],
                  used: true
                }
              } else {
                // if utxos, format them
                let utxos = result.map((utxo) => {
                  return this.electrum.transactionGet(utxo.tx_hash)
                    .then((rawTx) => {
                      let tx = bitcoinjs.Transaction.fromHex(rawTx)
                      return {
                        raw: rawTx,
                        tx_hash: utxo.tx_hash,
                        block_height: utxo.height,
                        value: utxo.value,
                        tx_output_n: utxo.tx_pos,
                        scriptPubKey: tx.outs[utxo.tx_pos].script.toString('hex')
                      }
                    })
                })

                return {
                  utxos: await Promise.all(utxos),
                  used: true
                }
              }
            })
        } else {
          return {
            utxos: [],
            used: false
          }
        }
      })
  }

  generateScript(pubKeyHex: string, derivationPath: string) {
      let purpose = this.ledger.explodePath(derivationPath)[0]

      console.log("Pubkey: (" + derivationPath + "): " + pubKeyHex)
      let pubKey:any = bitcoinjs.ECPair.fromPublicKey(Buffer.from(pubKeyHex, "hex"))
      // This is tested for ledger hardware wallet
      let script = null
      switch (purpose) {
        case 44:
          // p2pkh
          script = bitcoinjs.payments.p2pkh({
            pubkey: pubKey.publicKey,
            network: this.network
          })
          break
        case 49:
          let p2wpkh = bitcoinjs.payments.p2wpkh({
            pubkey: pubKey.publicKey,
            network: this.network
          })
          let p2pkh = bitcoinjs.payments.p2pkh({
            pubkey: pubKey.publicKey,
            network: this.network
          })
          // p2sh
          script = bitcoinjs.payments.p2sh({
            redeem: p2wpkh,
            network: this.network
          })
          break
        case 84:
          // p2wpkh
          script = bitcoinjs.payments.p2wpkh({
            pubkey: pubKey.publicKey,
            network: this.network
          })
          break
        default:
          throw new Error("Unsupported purpose in derivation!")
      }
      return script
  }

  /**
    initialize the (u)txo set
  */
  initialize = (derivationSet:Array<any>|null) => {
    let self = this

    const walletContextUpdateLoop = (purpose, account, change, index): Promise<boolean> => {
      let path = self.ledger.getPath(purpose, account, change, index)
      return self.ledger.getPublicKeyFromPath(path)
        .then((pubKeyHex:string) => {
          let script = this.generateScript(pubKeyHex, path)
          return self.addAddress(script.address, path, script, pubKeyHex)
        })
    }

    const derivationLoop = (purpose, account, change, index): Promise<boolean> => {
      return walletContextUpdateLoop(purpose, account, change, index)
        .then((proceed) => {
          if (proceed) {
            // Itterate over all addresses with balances
            return derivationLoop(purpose, account, change, index + 1)
          } else if (change == 0 && index != 0) {
            // Check change index
            return derivationLoop(purpose, account, 1, 0)
          } else {
            return true
          }
        })
    }

    const accountLoop = (purpose, account, change, index): Promise<boolean> => {
      let utxoCount = this.getDerivationsWithUTXOs().length
      return derivationLoop(purpose, account, change, index)
        .then(() => {
          // If new utxos have been found, check next account
          if (utxoCount < this.getDerivationsWithUTXOs().length) {
            return derivationLoop(purpose, account + 1, change, index)
          } else {
            return true
          }
        })
    }

    // If derivation set has been provided, initialize it
    if (derivationSet && derivationSet.length > 0) {
      return Promise.all(derivationSet.map((derivation) => {
        let script = this.generateScript(derivation.pubKeyHex, derivation.derivationPath)
        let addressData = {
          'utxos': derivation.utxos,
          'used': derivation.used
        }
        return self.addAddress(script.address, derivation.derivationPath, script, derivation.pubKeyHex, addressData)
      }))
    // If no derivation set has been provided, initialize from scratch
    } else {
      // 44 = P2PKH
      // 49 = P2SH-P2WPKH
      // 84 = P2WPKH
      let purposes = [44, 49, 84]

      return purposes.reduce((p, purpose) =>
        p.then(_ => accountLoop(purpose, 0, 0, 0)),
        Promise.resolve()
      )
    }
  }

  getTotalBalance = () => {
    let utxobalances = [].concat.apply([], this.derivations.map(deri => deri.utxos.map(utxo => utxo.value)))
    return utxobalances.reduce((balance:number, acc:number) => acc + balance, 0)
  }
}

export default WalletContext
