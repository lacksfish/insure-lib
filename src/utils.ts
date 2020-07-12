import * as bitcoinjs from 'bitcoinjs-lib'

export function toHexString(buffer: Buffer) {
	return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('')
}

export function toByteArray(hexString: string) {
	const Buffer = require('safe-buffer').Buffer
	const result = Buffer.alloc(hexString.length / 2)
	let i = 0
	while (hexString.length >= 2) {
		result[i] = parseInt(hexString.substring(0, 2), 16)
		i += 1
		hexString = hexString.substring(2, hexString.length)
	}
	return result
}

export function compressPublicKey(pk: string): string {
	return toHexString(bitcoinjs.ECPair.fromPublicKey(toByteArray(pk)).publicKey)
}
