import { DocumentDriveStorage } from "../storage";
import { IDriveStorage, IStorage } from "../storage/types";

export interface ICache {
    setDocument(drive: string, id: string, document: any): Promise<void>
    getDocument(drive: string, id: string): Promise<any>
    deleteDocument(drive: string, id: string): Promise<void>
}