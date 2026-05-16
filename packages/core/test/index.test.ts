import { describe, expect, test } from "bun:test";
import { ASYNCS_DESCRIPTION, ASYNCS_PACKAGE_NAME } from "../src/index";

describe("core metadata", () => {
  test("exports asyncs project metadata", () => {
    expect(ASYNCS_PACKAGE_NAME).toBe("asyncs");
    expect(ASYNCS_DESCRIPTION).toContain("sub-agent");
  });
});
