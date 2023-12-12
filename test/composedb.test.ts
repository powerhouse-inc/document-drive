import { DatabaseStorage } from "../src/storage/database";

describe("ComposeDB Storage Layer", () => {

  const layer = new DatabaseStorage();

  it("should create a drive", async () => {
    layer.saveDrive({
      state: {
        id: "",
        name: "name",
        icon: "icon",
      },
      initialState: {
        name: "name",
        icon: "icon",
      },
      attachments: {},

    });
    })
  });

});