import { CeramicClient } from '@ceramicnetwork/http-client';
import { Composite } from '@composedb/devtools';
import {
    readEncodedComposite,
    writeEncodedComposite,
    writeEncodedCompositeRuntime
} from '@composedb/devtools-node';
import { DID } from 'dids';
import { readFileSync } from 'fs';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import { getResolver } from 'key-did-resolver';
import { fromString } from 'uint8arrays/from-string';

// Import the devtool node package

// Hexadecimal-encoded private key for a DID having admin access to the target Ceramic node
// Replace the example key here by your admin private key
const privateKey = fromString(
    '99a34254824af53910bb030a1c9242d87c2086e6635709f045be521c5101a78a',
    'base16'
);

const did = new DID({
    resolver: getResolver(),
    provider: new Ed25519Provider(privateKey)
});
await did.authenticate();

// Replace by the URL of the Ceramic node you want to deploy the Models to
const ceramic = new CeramicClient('http://localhost:7007');
// An authenticated DID with admin access must be set on the Ceramic instance
ceramic.did = did;

const documentsSchema = readFileSync('./composites/00-documentdrive.graphql', {
    encoding: 'utf-8'
});

const documentsComposite = await Composite.create({
    ceramic,
    schema: documentsSchema
});

const driveSchema = readFileSync('./composites/01-document.graphql', {
    encoding: 'utf-8'
}).replace('$DRIVE_ID', documentsComposite.modelIDs[0]);

const driveComposite = await Composite.create({
    ceramic,
    schema: driveSchema
});

// const documentDriveSchema = readFileSync(
//     './composites/02-documentdrivedocument.graphql',
//     {
//         encoding: 'utf-8'
//     }
// )
//     .replace('$DOCUMENT_ID', documentsComposite.modelIDs[0])
//     .replace('$DOCUMENT_DRIVE_ID', driveComposite.modelIDs[0]);
// const documentsDriveComposite = await Composite.create({
//     ceramic,
//     schema: documentDriveSchema
// });

const composite = Composite.from([
    documentsComposite,
    driveComposite
    // documentsDriveComposite
]);

await writeEncodedComposite(composite, './src/__generated__/definition.json');

await writeEncodedCompositeRuntime(
    ceramic,
    './src/__generated__/definition.json',
    './src/__generated__/definition.js'
);

const deployComposite = await readEncodedComposite(
    ceramic,
    './src/__generated__/definition.json'
);

await deployComposite.startIndexingOn(ceramic);

// Replace by the path to the encoded composite file
// await writeEncodedComposite(composite, './build/my-composite.json');
