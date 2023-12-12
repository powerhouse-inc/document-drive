import { ComposeClient } from '@composedb/client';
import { DocumentDriveDocument } from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { IDriveStorage } from './types';
// Import your compiled composite
import { DID } from 'dids';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import { getResolver } from 'key-did-resolver';
import { fromString } from 'uint8arrays';
import { definition } from './../__generated__/definition.js';
export class DatabaseStorage implements IDriveStorage {
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
        query DocumentDrives {
            documentDriveIndex(first: 100) {
              edges {
                node {
                  name
                }
              }
            }
          }`;

        const result = await this.compose.executeQuery(query);

        // const document: Document = {
        //     attachments: {},
        //     created: new Date().toISOString(),
        //     documentType: '',
        //     initialState: {
        //         attachments: {},
        //         created: new Date().toISOString(),
        //         documentType: '',
        //         lastModified: new Date().toISOString(),
        //         name: '',
        //         revision: 0,
        //         state: {}
        //     },
        //     lastModified: new Date().toISOString(),
        //     name: '',
        //     operations: [],
        //     revision: 0,
        //     state: {}
        // };

        console.log(document);

        // const documentDrive: DocumentDriveDocument = {
        //     attachments: {},
        //     created: new Date().toISOString(),
        //     documentType: '',
        //     initialState: {
        //         attachments: {},
        //         created: new Date().toISOString(),
        //         documentType: '',
        //         lastModified: new Date().toISOString(),
        //         name: '',
        //         revision: 0,
        //         state: {icon: 'icon', name: 'name', id: 'description', nodes: [], remoteUrl: 'remoteUrl', type: 'type'},}},
        //     },
        //     lastModified: new Date().toISOString(),
        //     name: '',
        //     operations: [],
        //     revision: 0,
        //     state: {}

        // };

        return result.map(doc => {
            return doc.id;
        });
    }

    async getDocument(driveId: string, id: string) {
        const query = `
        query DocumentDrives {
            documentDriveIndex(first: 100) {
              edges {
                node {
                  name
                }
              }
            }
          }`;

        const result = await this.compose.executeQuery(query);
        result.data?.documentDriveIndex
            ? ['edges'].map((edge: Document) => {
                  console.log(edge);
                  return '';
              })
            : // const document: Document = {
              //     attachments: {},
              //     created: new Date().toISOString(),
              //     documentType: '',
              //     initialState: {
              //         attachments: {},
              //         created: new Date().toISOString(),
              //         documentType: '',
              //         lastModified: new Date().toISOString(),
              //         name: '',
              //         revision: 0,
              //         state: {}
              //     },
              //     lastModified: new Date().toISOString(),
              //     name: '',
              //     operations: [],
              //     revision: 0,
              //     state: {}
              // };

              console.log(document);

        // const documentDrive: DocumentDriveDocument = {
        //     attachments: {},
        //     created: new Date().toISOString(),
        //     documentType: '',
        //     initialState: {
        //         attachments: {},
        //         created: new Date().toISOString(),
        //         documentType: '',
        //         lastModified: new Date().toISOString(),
        //         name: '',
        //         revision: 0,
        //         state: {icon: 'icon', name: 'name', id: 'description', nodes: [], remoteUrl: 'remoteUrl', type: 'type'},}},
        //     },
        //     lastModified: new Date().toISOString(),
        //     name: '',
        //     operations: [],
        //     revision: 0,
        //     state: {}

        // };

        return result.map(doc => {
            return doc.id;
        });
    }

    async saveDocument(drive: string, id: string, document: Document) {
        await this.did.authenticate();

        try {
            const document = `mutation UpdateDocument($i: CreateDocumentDriveInput!) {
                createDocumentDrive(input: $i) {
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
                    content: {
                        hash: drive.state.id,
                        name: drive.state.name,
                        nodes: JSON.stringify(drive.state.nodes),
                        remoteUrl: drive.state.remoteUrl,
                        icon: drive.state.icon,
                        id: drive.state.id
                    }
                }
            };
            const result = await this.compose.executeQuery(document, filter);
            console.log(result);
        } catch (e) {
            const document = `mutation CreateDocumentDrive($i: CreateDocumentDriveInput!) {
            createDocumentDrive(input: $i) {
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
                    content: {
                        hash: drive.state.id,
                        name: drive.state.name,
                        nodes: JSON.stringify(drive.state.nodes),
                        remoteUrl: drive.state.remoteUrl,
                        icon: drive.state.icon
                    }
                }
            };
            const result = await this.compose.executeQuery(document, filter);
            console.log(result);
        }
    }

    async deleteDocument(drive: string, id: string) {
        throw new Error('Method not implemented.');
    }

    async getDrives() {
        const drives = await this.db.documentDrive.findMany();
        return drives.map(drive => {
            return drive.id;
        });
    }

    async getDrive(id: string) {
        const query = `query DocumentDrives {
            documentDriveIndex(first: 1 ) {
              edges {
                node {
                  name
                  icon
                  hash
                  remoteUrl
                  id
                }
              }
            }
          }`;

        const result = await this.compose.executeQuery(query);
        console.log(result);
        return result;
    }

    async saveDrive(drive: DocumentDriveDocument) {
        await this.did.authenticate();
        if (drive.state.id != null) {
            // update
            const document = `mutation CreateDocumentDrive($i: CreateDocumentDriveInput!) {
                createDocumentDrive(input: $i) {
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
                    id: drive.state.id,
                    content: {
                        hash: drive.state.id,
                        name: drive.state.name,
                        nodes: JSON.stringify(drive.state.nodes),
                        remoteUrl: drive.state.remoteUrl,
                        icon: drive.state.icon
                    }
                }
            };
            await this.compose.executeQuery(document, filter);
        } else {
            // create
            const document = `mutation UpdateDocumentDrive($i: UpdateDocumentDriveInput!) {
                updateDocumentDrive(input: $i) {
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
                    content: {
                        hash: drive.state.id,
                        name: drive.state.name,
                        nodes: JSON.stringify(drive.state.nodes),
                        remoteUrl: drive.state.remoteUrl,
                        icon: drive.state.icon
                    }
                }
            };
            await this.compose.executeQuery(document, filter);
        }
    }

    async deleteDrive(id: string) {
        throw new Error('Method not implemented.');
    }
}
