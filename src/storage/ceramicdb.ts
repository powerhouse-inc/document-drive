import { ComposeClient } from '@composedb/client';
import {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveState
} from 'document-model-libs/document-drive';
import {
    Document,
    ExtendedState,
    FileRegistry,
    Operation
} from 'document-model/document';
import { IDriveStorage } from './types.js';
// Import your compiled composite
import { DID } from 'dids';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import { getResolver } from 'key-did-resolver';
import { fromString } from 'uint8arrays';
import { definition } from '../__generated__/definition.js';
export class CeramicDB implements IDriveStorage {
    private compose: ComposeClient;
    private did: DID;

    constructor() {
        const privateKey = fromString(
            '99a34254824af53910bb030a1c9242d87c2086e6635709f045be521c5101a78a',
            'base16'
        );

        this.did = new DID({
            resolver: getResolver(),
            provider: new Ed25519Provider(privateKey)
        });
        this.compose = new ComposeClient({
            ceramic: 'http://localhost:7007',
            definition: definition
        });

        this.compose.setDID(this.did);
    }

    async getDocuments(drive: string) {
        const query = `
        query getDocumentsFromDrive($i:StringValueFilterInput) {
          documentIndex(first:100 filters:{where:{
            driveIdentifier: $i,
            isDeleted: {
              equalTo: false
            }
          }}) {
            edges {
              node{
                id
                identifier
              }
            }
          }
        }`;

        const result = await this.compose.executeQuery(query, {
            i: { equalTo: drive }
        });
        if (result.errors) {
            console.log(result.errors);
            return [];
        }

        if (!result.data?.documentIndex) {
            return [];
        }

        const { edges } = result.data.documentIndex as {
            edges: { node: { identifier: string } }[];
        };

        return edges
            .map(edge => edge.node.identifier)
            .filter(e => e.includes('drive-') === false);
    }

    async getDocument(driveId: string, id: string) {
        const query = `query getDocumentFromDrive($documentId: StringValueFilterInput, $driveId: StringValueFilterInput) {
          documentIndex(
            first: 1
            filters: {where: {driveIdentifier: $driveId, identifier: $documentId, isDeleted: {
              equalTo: false
            }}}
          ) {
            edges {
              node {
                id
                attachments {
                  data
                  fileName
                  mimeType
                  extension
                  identifier
                }
                created
                documentType
                initialState
                state
                lastModified
                name
                revision
                operations {
                  hash
                  index
                  timestamp
                  input
                  type
                }
              }
            }
          }
        }`;

        const result = await this.compose.executeQuery(query, {
            drive: { equalTo: driveId },
            documentId: { equalTo: id }
        });
        if (result.errors) {
            console.log(result.errors);
            throw new Error(`Document with id ${id} not found`);
        }

        const documentIndex = result.data?.documentIndex;
        if (!documentIndex) {
            throw new Error(`Document with id ${id} not found`);
        }

        const { edges } = documentIndex as any;
        if (edges.length == 0) {
            throw new Error(`Document with id ${id} not found`);
        }

        const dbDoc = edges[0].node as {
            id: string;
            attachments: any[];
            created: string;
            documentType: string;
            initialState: string;
            lastModified: string;
            name: string;
            operations: {
                hash: string;
                index: number;
                timestamp: string;
                input: string;
                type: string;
            }[];
            revision: number;
            state: string;
        };

        const attachments: FileRegistry = {};
        dbDoc.attachments.forEach(attachment => {
            attachments[attachment.identifier] = {
                data: attachment.data,
                mimeType: attachment.mimeType,
                extension: attachment.extension,
                fileName: attachment.fileName
            };
        });

        const doc: DocumentDriveDocument = {
            attachments: attachments,
            created: dbDoc.created,
            documentType: dbDoc.documentType,
            // This code loads the initial state of the document drive from the database.

            initialState: JSON.parse(
                dbDoc.initialState
            ) as ExtendedState<DocumentDriveState>,
            state: JSON.parse(dbDoc.state) as DocumentDriveState,
            lastModified: dbDoc.lastModified,
            name: dbDoc.name,
            operations: dbDoc.operations.map(op => {
                return {
                    hash: op.hash,
                    index: op.index,
                    timestamp: op.timestamp,
                    input: JSON.parse(op.input),
                    type: op.type
                };
            }) as Operation<DocumentDriveAction>[],
            revision: dbDoc.revision
        };

        return doc;
    }

    async saveDocument(drive: string, id: string, document: Document) {
        await this.did.authenticate();
        let query = `mutation CreateDocument($i: CreateDocumentInput!) {
          createDocument(input: $i) {
            document {
              id
              attachments {
                data
                fileName
                mimeType
                extension
                identifier
              }
              created
              documentType
              initialState
              state
              lastModified
              name
              revision
              operations {
                hash
                index
                timestamp
                input
                type
              }
            }
          }
        }`;
        let doc;
        let composeId = '0';
        try {
            doc = await this.getDocument(drive, id);
            query = query.replaceAll('CreateDocument', 'UpdateDocument');
            query = query.replaceAll('createDocument', 'updateDocument');

            const result = await this.compose.executeQuery(
                `query getDocumentFromDrive($documentId: StringValueFilterInput, $driveId: StringValueFilterInput) {
                documentIndex(
                  first: 1
                  filters: {where: {driveIdentifier: $driveId, identifier: $documentId}}
                ) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }`,
                {
                    drive: { equalTo: drive },
                    documentId: { equalTo: id }
                }
            );

            composeId = result.data.documentIndex.edges[0].node.id;
        } catch (e) {
            console.log(e);
            // do nothing
        }

        const filter = {
            i: {
                id: composeId,
                content: {
                    isDeleted: false,
                    attachments: Object.keys(document.attachments).map(
                        hash => ({
                            fileName: document.attachments[hash]!.fileName,
                            data: document.attachments[hash]!.data,
                            mimeType: document.attachments[hash]!.mimeType,
                            extension: document.attachments[hash]!.extension,
                            identifier: hash ?? ''
                        })
                    ),
                    created: document.created,
                    documentType: document.documentType,
                    initialState: JSON.stringify(document.initialState),
                    state: JSON.stringify(document.state),
                    lastModified: document.lastModified,
                    name: document.name,
                    revision: document.revision,
                    identifier: id,
                    driveIdentifier: drive,
                    operations: document.operations.map(op => {
                        return {
                            hash: op.hash,
                            index: op.index,
                            timestamp: op.timestamp,
                            input: op.input,
                            type: op.type
                        };
                    })
                }
            }
        };

        if (!doc) {
            delete filter.i.id;
        }
        const result = await this.compose.executeQuery(query, filter);
        console.log(result);
    }

    async deleteDocument(drive: string, id: string) {
        let query = `query getDocumentFromDrive($documentId: StringValueFilterInput, $driveId: StringValueFilterInput) {
        documentIndex(
          first: 1
          filters: {where: {driveIdentifier: $driveId, identifier: $documentId}}
        ) {
          edges {
            node {
              id
            }
          }
        }
      }`;

        const { data } = await this.compose.executeQuery(query, {
            drive: { equalTo: drive },
            documentId: { equalTo: id }
        });

        const composeDocuments = data.documentIndex.edges;
        if (composeDocuments.length == 0) {
            throw new Error(`Drive with id ${id} not found`);
        }

        const composeDocument = composeDocuments[0].node;

        query = `mutation UpdateDocument($i: UpdateDocumentInput!) {
        updateDocument(input: $i) {
          document {
            id
          }
        }
      }`;

        const filter = {
            i: {
                id: composeDocument.id,
                content: {
                    isDeleted: false
                }
            }
        };

        await this.compose.executeQuery(query, filter);

        // remove from nodes
        const result = await this.compose.executeQuery(
            `query getDrive($drive: StringValueFilterInput) {
        driveIndex(first: 1, filters: {where: {identifier: $drive}}) {
          edges {
            node {
              id
              nodes {
                identifier
              }
            }
          }
        }
      }`,
            {
                drive: {
                    equalTo: drive
                }
            }
        );

        const composeDrives = result.data.driveIndex.edges;
        if (composeDrives.length == 0) {
            throw new Error(`Drive with id ${id} not found`);
        }
        const composeDrive = composeDrives[0].node;
        const document = `mutation UpdateDrive($i: UpdateDriveInput!) {
            updateDrive(input: $i) {
              document {
                id
                name
                nodes {
                  identifier
                }
              }
            }
          }`;

        const updateFilter = {
            i: {
                id: composeDrive.id,
                content: {
                    nodes: composeDrive.nodes.filter(n => n.identifier !== id)
                }
            }
        };
        try {
            await this.compose.executeQuery(document, updateFilter);
        } catch (e) {
            console.log(e);
        }
    }

    async getDrives() {
        const query = `query GetDrives {
          driveIndex(first: 100 filters: {where: { isDeleted:{equalTo:false}}}) {
            edges {
              node {
                identifier
              }
            }
          }
        }`;

        const { data } = await this.compose.executeQuery(query);
        const composeDrives = (
            data as {
                driveIndex: { edges: [{ node: { identifier: string } }] };
            }
        ).driveIndex.edges;

        return composeDrives.map(drive => {
            return drive.node.identifier;
        });
    }

    async getDrive(id: string) {
        const query = `query getDrive($drive: StringValueFilterInput) {
          driveIndex(first: 1, filters: {where: {identifier: $drive, isDeleted:{equalTo:false}}}) {
            edges {
              node {
                id
                remoteUrl
                identifier
                hash
                icon
                name
                nodes {
                  kind
                  name
                  identifier
                  parentFolder
                }
              }
            }
          }
        }`;

        const { data, errors } = await this.compose.executeQuery(query, {
            drive: {
                equalTo: id
            }
        });

        const composeDrives = data.driveIndex.edges;
        if (composeDrives.length == 0) {
            throw new Error(`Drive with id ${id} not found`);
        }

        const composeDrive = composeDrives[0].node;
        const metaDoc = await this.getDocument(id, 'drive-' + id);

        const driveDoc: DocumentDriveDocument = {
            attachments: metaDoc.attachments,
            created: metaDoc.created,
            documentType: metaDoc.documentType,
            initialState:
                metaDoc.initialState as ExtendedState<DocumentDriveState>,
            lastModified: metaDoc.lastModified,
            name: metaDoc.name,
            revision: metaDoc.revision,
            state: {
                icon: composeDrive.icon,
                id: composeDrive.identifier,
                name: composeDrive.name ?? '',
                remoteUrl:
                    composeDrive.remoteUrl === ''
                        ? null
                        : composeDrive.remoteUrl,
                nodes:
                    composeDrive.nodes.map(
                        (node: {
                            identifier: string;
                            kind: string;
                            name: string;
                            parentFolder: string;
                        }) => {
                            return {
                                id: node.identifier,
                                kind: node.kind ?? '',
                                name: node.name ?? '',
                                parentFolder: node.parentFolder ?? ''
                            };
                        }
                    ) ?? []
            },
            operations: metaDoc.operations.map(op => {
                return {
                    hash: op.hash,
                    index: op.index,
                    timestamp: op.timestamp,
                    input: op.input,
                    type: op.type
                };
            }) as Operation<DocumentDriveAction>[]
        };

        return driveDoc;
    }

    async saveDrive(drive: DocumentDriveDocument) {
        await this.did.authenticate();

        // get Drive
        await this.saveDocument(
            drive.state.id,
            'drive-' + drive.state.id,
            drive
        );

        const { data, errors } = await this.compose.executeQuery(
            `query getDrive($drive: StringValueFilterInput) {
              driveIndex(first: 1, filters: {where: {identifier: $drive}}) {
                edges {
                  node {
                    id
                  }
                }
              }
            }`,
            {
                drive: {
                    equalTo: drive.state.id
                }
            }
        );

        const composeDrives = data.driveIndex.edges;

        if (composeDrives.length == 0) {
            // create
            const document = `mutation CreateDrive($i: CreateDriveInput!) {
              createDrive(input: $i) {
                document {
                  id
                  name
                  name
                  author {
                    id
                  }
                }
              }
            }`;

            const filter = {
                i: {
                    content: {
                        hash: drive.state.id,
                        name: drive.state.name,
                        isDeleted: false,
                        nodes: drive.state.nodes.map(node => ({
                            kind: node.kind,
                            name: node.name,
                            identifier: node.id,
                            parentFolder: node.parentFolder ?? ''
                        })),
                        remoteUrl: drive.state.remoteUrl ?? '',
                        icon: drive.state.icon,
                        identifier: drive.state.id
                    }
                }
            };
            await this.compose.executeQuery(document, filter);
        } else {
            // update
            const composeDrive = composeDrives[0].node;
            const document = `mutation UpdateDrive($i: UpdateDriveInput!) {
              updateDrive(input: $i) {
                document {
                  id
                  name
                  author {
                    id
                  }
                }
              }
            }`;

            const filter = {
                i: {
                    id: composeDrive.id,
                    content: {
                        isDeleted: false,
                        hash: drive.state.id,
                        name: drive.state.name,
                        nodes: drive.state.nodes.map(node => ({
                            kind: node.kind,
                            name: node.name,
                            identifier: node.id,
                            parentFolder: node.parentFolder ?? ''
                        })),
                        remoteUrl: drive.state.remoteUrl ?? '',
                        icon: drive.state.icon,
                        identifier: drive.state.id
                    }
                }
            };
            await this.compose.executeQuery(document, filter);
        }
    }

    async deleteDrive(id: string) {
        const { data } = await this.compose.executeQuery(
            `query getDrive($drive: StringValueFilterInput) {
          driveIndex(first: 1, filters: {where: {identifier: $drive}}) {
            edges {
              node {
                id
                nodes {
                  identifier
                }
              }
            }
          }
        }`,
            {
                drive: {
                    equalTo: id
                }
            }
        );

        const composeDrives = data.driveIndex.edges;
        if (composeDrives.length == 0) {
            throw new Error(`Drive with id ${id} not found`);
        }
        const composeDrive = composeDrives[0].node;
        const document = `mutation UpdateDrive($i: UpdateDriveInput!) {
              updateDrive(input: $i) {
                document {
                  id
                  name
                  nodes {
                    identifier
                  }
                }
              }
            }`;

        const filter = {
            i: {
                id: composeDrive.id,
                content: {
                    isDeleted: true
                }
            }
        };
        await this.compose.executeQuery(document, filter);

        // delete all documents
        await Promise.all(
            composeDrive.nodes.map((node: { identifier: string }) => {
                return this.deleteDocument(id, node.identifier);
            })
        );
    }
}
