import { describe, expect, test } from "@jest/globals";
import { getResumeRequest, isReconnectRequest } from "./connectionMode";

describe("WebSocket reconnect query", () => {
  test.each([
    ["/ws", false],
    ["/ws?reconnect=1", true],
    ["/ws?reconnect=0", false],
    ["/ws?reconnect=true", false],
    ["/ws?foo=bar&reconnect=1", true],
  ])("%s -> %s", (url, expected) => {
    expect(isReconnectRequest(url)).toBe(expected);
  });
});

describe("WebSocket resume query", () => {
  test.each([
    ["/ws", false, ""],
    ["/ws?reconnect=1", false, ""],
    ["/ws?resumable=1", true, ""],
    ["/ws?resumable=0", false, ""],
    ["/ws?resume=abc", true, "abc"],
    ["/ws?resumable=1&resume=abc", true, "abc"],
  ])("%s -> %s, %s", (url, resumable, token) => {
    expect(getResumeRequest(url)).toEqual({ resumable, token });
  });
});
