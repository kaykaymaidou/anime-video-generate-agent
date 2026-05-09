import { describe, expect, it } from "vitest";

import { transitionSocketPhase, type SocketConnectionPhase } from "../socket-connection.machine";

describe("transitionSocketPhase", () => {
  it("connect_called from idle moves to connecting", () => {
    expect(transitionSocketPhase("idle", { type: "connect_called" })).toBe("connecting");
  });

  it("socket_connected yields connected", () => {
    expect(transitionSocketPhase("connecting", { type: "socket_connected" })).toBe("connected");
  });

  it("taskId race doc: disconnected clears subscription scope", () => {
    let p: SocketConnectionPhase = "connected";
    p = transitionSocketPhase(p, { type: "socket_disconnected" });
    expect(p).toBe("disconnected");
  });

  it("reconnect_attempt only from connected", () => {
    expect(transitionSocketPhase("connected", { type: "reconnect_attempt" })).toBe("reconnecting");
    expect(transitionSocketPhase("disconnected", { type: "reconnect_attempt" })).toBe("disconnected");
  });

  it("socket_destroyed resets to idle", () => {
    expect(transitionSocketPhase("error", { type: "socket_destroyed" })).toBe("idle");
  });
});
