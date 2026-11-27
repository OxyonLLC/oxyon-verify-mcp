// Generates the SAFE sample evidence in examples/samples/: synthetic GeoProof-style bound witnesses signed with
// throwaway accounts created for this run (no real identity, nothing of value). Run once: `node examples/make-samples.mjs`.
// The committed files are what tests/examples.test.mjs replays; regenerating changes them (new keys, new hashes).
// Uses devDependencies only: the server itself never signs.
import { writeFileSync, mkdirSync } from 'node:fs'
import { Account } from '@xyo-network/account'
import { BoundWitnessBuilder } from '@xyo-network/boundwitness-builder'
import { PayloadBuilder } from '@xyo-network/payload-builder'

const dir = new URL('./samples/', import.meta.url)
mkdirSync(dir, { recursive: true })
const save = (name, value) => writeFileSync(new URL(name, dir), JSON.stringify(value, null, 2) + '\n')

const attester = await Account.random()
const verifier = await Account.random()
const statement = { schema: 'network.xyo.example.statement', text: 'SAMPLE: the reading was 21.5 °C at noon. Synthetic, for testing only.' }
const [proof] = await new BoundWitnessBuilder().payload(statement).signer(attester).build()
const receipt = { schema: 'network.xyo.example.receipt', proofHash: await PayloadBuilder.hash(proof), verdict: 'verified' }
const [receiptBw] = await new BoundWitnessBuilder().payload(receipt).signer(verifier).build()
const batch = { schema: 'network.xyo.example.batch', proofHashes: [await PayloadBuilder.hash(proof), await PayloadBuilder.hash(receiptBw)] }

save('statement.json', statement)
save('proof.json', proof)
save('receipt.json', receipt)
save('receipt-bw.json', receiptBw)
save('batch.json', batch)
// Tampered copies, for the failure examples.
save('proof-tampered.json', { ...proof, payload_hashes: ['00'.repeat(32)] })
save('receipt-edited.json', { ...receipt, verdict: 'rejected' })
console.log('samples written; attester', attester.address, 'verifier', verifier.address)
