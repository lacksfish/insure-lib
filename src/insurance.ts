import * as bitcoinjs from 'bitcoinjs-lib'
import Btc from "@ledgerhq/hw-app-btc"
import TransportU2F from "@ledgerhq/hw-transport-node-hid-noevents"

import BitcoinLedgerService from './ledger'
import {serializeTransactionOutputs} from "@ledgerhq/hw-app-btc/lib/serializeTransaction"

export default class Insurance {

  derivations:Array<any>
  outputs:Array<any>
  network:any
  ledger:BitcoinLedgerService
  unsignedTx: bitcoinjs.Psbt
  segwit:boolean

  constructor(input_derivations:Array<any>, outputs:Array<any>, ledger:BitcoinLedgerService, network:any) {
    this.derivations = input_derivations
    this.outputs = outputs
    this.network = network
    this.ledger = ledger
    this.unsignedTx = null
    this.segwit = false
  }

  createUnsignedInsurance() {
    let tx = new bitcoinjs.Psbt({ network: this.network })

    this.derivations.map((derivation, idx) => {
      // TODO, better way to note down segwit usage
      if (derivation.derivationPath.startsWith('49') || derivation.derivationPath.startsWith('84')) {
        this.segwit = true
      }
      derivation.utxos.forEach((utxo) => {
        let redeemScript = null
        // Only provide redeemScript if available
        if ('redeem' in derivation.scriptObj) {
          tx.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_output_n,
            sequence: 0x0,
            // witnessUtxo: {
            //   script: Buffer.from(utxo.scriptPubKey, 'hex'),
            //   value: utxo.value
            // },
            nonWitnessUtxo: Buffer.from(utxo.raw, 'hex'), // rawtx hex
            redeemScript: derivation.scriptObj.redeem.output
          })
        } else {
          tx.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_output_n,
            sequence: 0x0,
            nonWitnessUtxo: Buffer.from(utxo.raw, 'hex')
          })
        }
      })
    })

    tx.addOutputs(this.outputs)
    tx.setVersion(1)
    this.unsignedTx = tx

    return tx
  }

  signInsurance(validDate:Date) {
    if (!this.unsignedTx) {
      throw new Error("No unsigned insurance was initialized")
    }

    if (!validDate || Date.now() > validDate.getTime()) {
      throw new Error("No or wrong insurance date was provided")
    }

    let segwit = this.segwit

    let ledgerCb = (phase, status) => { }
    return TransportU2F.open("").then(transport => {
      const btc = new Btc(transport)

      let inputs = []
      let paths = []
      let pubkeys = []
      this.derivations.map((derivation, idx) => {
        derivation.utxos.forEach((utxo) => {
          inputs.push([
            btc.splitTransaction(utxo.raw, segwit),
              utxo.tx_output_n,
              derivation.scriptObj.output.toString('hex'),
              0x0 //sequence
          ])
          if ('redeem' in derivation.scriptObj) {
            pubkeys.push(derivation.scriptObj.redeem.pubkey.toString('hex'))
          } else {
            pubkeys.push(derivation.scriptObj.pubkey.toString('hex'))
          }
          paths.push(derivation.derivationPath)
        })
      })

      const outshex = serializeTransactionOutputs(btc.splitTransaction((this.unsignedTx as any).__CACHE.__TX.toHex(), true)).toString('hex')

      return btc.createPaymentTransactionNew({
        inputs: inputs,
        associatedKeysets: paths,
        outputScriptHex: outshex,
        lockTime: Math.ceil(validDate.getTime() / 1000),
        segwit: segwit,
        transactionVersion: 1,
        sigHashType: 1
      })
      .then((txHex) => {
        return txHex
      })
    })
  }
}
