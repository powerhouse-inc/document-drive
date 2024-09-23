import { beforeAll, describe, expect, it } from "vitest";
import { SignatureVerificationService } from "../src/server/verification/signature-verification.service";
import { ActionContext, ActionSigner, Operation, Signature, utils } from "document-model/document";


const budgetStatementWithoutOperations = {
  name: "",
  documentType: "powerhouse/budget-statement",
  revision: {
    global: 0,
    local: 0
  },
  created: "2024-06-20T09:19:51.579Z",
  lastModified: "2024-06-20T09:19:51.579Z",
  attachments: {},
  state: {
    global: {
      owner: {
        ref: null,
        id: null,
        title: null
      },
      month: null,
      quoteCurrency: null,
      vesting: [],
      ftes: null,
      accounts: [],
      auditReports: [],
      comments: []
    },
    local: {}
  },
  initialState: {
    name: "",
    documentType: "powerhouse/budget-statement",
    revision: {
      global: 0,
      local: 0
    },
    created: "2024-06-20T09:19:51.579Z",
    lastModified: "2024-06-20T09:19:51.579Z",
    attachments: {},
    state: {
      global: {
        owner: {
          ref: null,
          id: null,
          title: null
        },
        month: null,
        quoteCurrency: null,
        vesting: [],
        ftes: null,
        accounts: [],
        auditReports: [],
        comments: []
      },
      local: {}
    }
  },
  operations: {
    global: [],
    local: []
  },
  clipboard: []
}

const budgetStatementWithOperations = {
  "name": "", "documentType": "powerhouse/budget-statement", "revision": { "global": 2, "local": 0 }, "created": "2024-09-19T12:08:01.684Z", "lastModified": "2024-09-19T12:09:24.247Z", "attachments": {}, "state": { "global": { "owner": { "ref": null, "id": null, "title": null }, "month": null, "quoteCurrency": null, "vesting": [], "ftes": null, "accounts": [{ "address": "123123", "name": "123123", "lineItems": [] }, { "address": "123123123", "name": "", "lineItems": [] }], "auditReports": [], "comments": [] }, "local": {} }, "initialState": { "name": "", "documentType": "powerhouse/budget-statement", "revision": { "global": 0, "local": 0 }, "created": "2024-09-19T12:08:01.684Z", "lastModified": "2024-09-19T12:08:01.684Z", "attachments": {}, "state": { "global": { "owner": { "ref": null, "id": null, "title": null }, "month": null, "quoteCurrency": null, "vesting": [], "ftes": null, "accounts": [], "auditReports": [], "comments": [] }, "local": {} } }, "operations": {
    "global": [
      { "index": 0, "skip": 0, "type": "ADD_ACCOUNT", "id": "772b669b-f3c8-4c8e-b80a-90c83e83b753", "input": { "address": "123123", "name": "123123" }, "hash": "3+x4J3HCodfoWsKA0kgwTC/px0g=", "timestamp": "2024-09-19T12:08:19.875Z", "context": { "signer": { "user": { "address": "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C", "networkId": "eip155", "chainId": 1 }, "app": { "name": "Connect", "key": "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj" }, "signatures": [["1726747699", "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj", "eeVQPEy/f2PuuVbAOpr0xyihlQ4=", "", "0x01fffb50954eb88f5a5b9e9a38166a5ef7ef5e319da8e8ae5d1d2ffbf4677c955444a5a20f30998e751e3358a791755e87b2144c3a80d87d25936ec0cee1be6c"]] } }, "scope": "global", "branch": "main" },

      { "index": 1, "skip": 0, "type": "ADD_ACCOUNT", "id": "4437e4ec-3ca6-4a15-b591-0344209c2cc2", "input": { "address": "123123123", "name": "" }, "hash": "TlCX+gIT+31k9g37ePjHAWHxJos=", "timestamp": "2024-09-19T12:09:24.247Z", "context": { "signer": { "user": { "address": "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C", "networkId": "eip155", "chainId": 1 }, "app": { "name": "Connect", "key": "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj" }, "signatures": [["1726747763", "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj", "lxqlqhujUKEREhCzqba7GLZA860=", "3+x4J3HCodfoWsKA0kgwTC/px0g=", "0x63faf4ec13d37541ddf77bc006e37b19256b6ae992e00877daaf6bf70c7826fa40ae773533165d1fc5bb0c717be61c5e2d58fbb54838ba2675d1ac698058fd37"]] } }, "scope": "global", "branch": "main" }], "local": []
  }, "clipboard": []
}


const operations = [
  {
    "hash": "TlCX+gIT+31k9g37ePjHAWHxJos=",
    "index": 2,
    "timestamp": "2024-09-19T12:12:13.831Z",
    "type": "ADD_ACCOUNT",
    "input": "{\"address\":\"123123123\",\"name\":\"\"}",
    "skip": 0,
    "context": {
      "signer": {
        "app": {
          "name": "Connect",
          "key": "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj"
        },
        "user": {
          "address": "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
          "networkId": "eip155",
          "chainId": 1
        },
        "signatures": [
          [
            "1726747934",
            "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj",
            "kWhXK0l620Umn+EEKgu3LeUcNoA=",
            "TlCX+gIT+31k9g37ePjHAWHxJos=",
            "0xeb018a8e6f56de33f674b1f80227b7a86a98bd0bd62d5125c0c3dc5a70fbddb8c10a8d815ad73466a0b3e0e725d941933ff84938708b80e5e113dd2cf73202da"
          ]
        ]
      }
    },
    "id": "3212363c-a7bd-4f76-add0-b4796b56950b"
  }
]

const wrongHashOperations = [
  {
    "hash": "TlCX+gIT+31k9g37ePjHAWHxJos=",
    "index": 2,
    "timestamp": "2024-09-19T12:12:13.831Z",
    "type": "ADD_ACCOUNT",
    "input": "{\"address\":\"123123123\",\"name\":\"\"}",
    "skip": 0,
    "context": {
      "signer": {
        "app": {
          "name": "Connect",
          "key": "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj"
        },
        "user": {
          "address": "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
          "networkId": "eip155",
          "chainId": 1
        },
        "signatures": [
          [
            "1726747934",
            "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj",
            "kWhXK0l620Umn+EEKgu3LeUcNoA=",
            "WRONGHASH",
            "0xeb018a8e6f56de33f674b1f80227b7a86a98bd0bd62d5125c0c3dc5a70fbddb8c10a8d815ad73466a0b3e0e725d941933ff84938708b80e5e113dd2cf73202da"
          ]
        ]
      }
    },
    "id": "3212363c-a7bd-4f76-add0-b4796b56950b"
  }
]

const wrongSignatureOperations = [
  {
    "hash": "TlCX+gIT+31k9g37ePjHAWHxJos=",
    "index": 2,
    "timestamp": "2024-09-19T12:12:13.831Z",
    "type": "ADD_ACCOUNT",
    "input": "{\"address\":\"123123123\",\"name\":\"\"}",
    "skip": 0,
    "context": {
      "signer": {
        "app": {
          "name": "Connect",
          "key": "did:key:zDnaejJcajtdiWSpRnibYf448FXzht4SgddhNW7eVB3emmrqj"
        },
        "user": {
          "address": "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
          "networkId": "eip155",
          "chainId": 1
        },
        "signatures": [
          [
            "1726747934",
            "did:key:WRONGDID",
            "kWhXK0l620Umn+EEKgu3LeUcNoA=",
            "TlCX+gIT+31k9g37ePjHAWHxJos=",
            "WRONGSIGNATURE"
          ]
        ]
      }
    },
    "id": "3212363c-a7bd-4f76-add0-b4796b56950b"
  }
]

const documentId = "9ERhmo+jaShvFVqiDXdk6GwgFmw=";
describe("Signature Verification Service", () => {

  let service: SignatureVerificationService;

  beforeAll(async () => {
    service = new SignatureVerificationService();
  });

  it("should accept valid pushed operations", async () => {
    const result = await service.verifyOperationsAndSignature(documentId, budgetStatementWithOperations.operations.global.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })), operations.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })));
    expect(result).toBeTruthy();
  });

  it("should reject pushed operations without valid signature", async () => {
    const result = await service.verifyOperationsAndSignature(documentId, budgetStatementWithOperations.operations.global.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })), wrongHashOperations.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })));
    expect(result).toBeFalsy();
  });

  it("should reject pushed operations with wrong signed data", async () => {
    const result = await service.verifyOperationsAndSignature(documentId, budgetStatementWithOperations.operations.global.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })), wrongSignatureOperations.map(op => ({ ...op, scope: "global", context: op.context as ActionContext })));
    expect(result).toBeFalsy();
  });
})
