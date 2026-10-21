/** A reconnect query is only a hint: cookie authentication is unchanged. */
export function isReconnectRequest(url: string): boolean {
  return new URL(url, "http://localhost").searchParams.get("reconnect") === "1";
}

/**
 * A resumable client gets a resume token in the "welcome" message and can present it as
 * "?resume=<token>" to take over its session after a dropped connection. Like the reconnect query,
 * this is only a hint: cookie authentication is unchanged.
 */
export function getResumeRequest(url: string): {
  resumable: boolean;
  token: string;
} {
  const { searchParams } = new URL(url, "http://localhost");
  const token = searchParams.get("resume") ?? "";
  return {
    resumable: searchParams.get("resumable") === "1" || token !== "",
    token,
  };
}
