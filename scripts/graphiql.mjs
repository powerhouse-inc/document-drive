import { serveEncodedDefinition } from "@composedb/devtools-node";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { fromString } from "uint8arrays";

/**
 * Runs GraphiQL server to view & query composites.
 */

const privateKey = fromString("99a34254824af53910bb030a1c9242d87c2086e6635709f045be521c5101a78a", "base16");

const did = new DID({
    resolver: getResolver(),
    provider: new Ed25519Provider(privateKey),
});
await did.authenticate();

const server = await serveEncodedDefinition({
    ceramicURL: "http://localhost:7007",
    graphiql: true,
    path: "./src/__generated__/definition.json",
    port: 5001,
    did,
});

console.log(`Server started on ${server.port}`);

process.on("SIGTERM", () => {
    server.stop();
});
