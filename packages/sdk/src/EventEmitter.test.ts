import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "./EventEmitter.js";

type TestEventMap = {
  ready: void;
  open: void;
  close: void;
  "message:received": { id: string; content: string };
  "message:sent": { id: string; content: string };
  "unread:changed": { count: number };
};

describe("EventEmitter", () => {
  it("calls listener when event is emitted", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener = vi.fn();

    emitter.on("ready", listener);
    emitter.emit("ready", undefined as never);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("passes typed payload to listener", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener = vi.fn();

    emitter.on("message:received", listener);
    emitter.emit("message:received", { id: "1", content: "hello" });

    expect(listener).toHaveBeenCalledWith({ id: "1", content: "hello" });
  });

  it("supports multiple listeners for the same event", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on("open", listener1);
    emitter.on("open", listener2);
    emitter.emit("open", undefined as never);

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it("off() removes a specific listener", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener = vi.fn();

    emitter.on("close", listener);
    emitter.off("close", listener);
    emitter.emit("close", undefined as never);

    expect(listener).not.toHaveBeenCalled();
  });

  it("off() does not remove other listeners", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on("open", listener1);
    emitter.on("open", listener2);
    emitter.off("open", listener1);
    emitter.emit("open", undefined as never);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it("off() is a no-op for unregistered listener", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener = vi.fn();

    expect(() => emitter.off("open", listener)).not.toThrow();
  });

  it("does not call listeners for other events", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const openListener = vi.fn();
    const closeListener = vi.fn();

    emitter.on("open", openListener);
    emitter.on("close", closeListener);
    emitter.emit("open", undefined as never);

    expect(openListener).toHaveBeenCalledOnce();
    expect(closeListener).not.toHaveBeenCalled();
  });

  it("emit is a no-op when no listeners registered", () => {
    const emitter = new EventEmitter<TestEventMap>();
    expect(() => emitter.emit("ready", undefined as never)).not.toThrow();
  });

  it("removeAllListeners clears all listeners", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on("open", listener1);
    emitter.on("close", listener2);
    emitter.removeAllListeners();
    emitter.emit("open", undefined as never);
    emitter.emit("close", undefined as never);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it("listener throwing does not prevent other listeners from being called", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingListener = () => { throw new Error("boom"); };
    const normalListener = vi.fn();

    emitter.on("ready", throwingListener);
    emitter.on("ready", normalListener);
    emitter.emit("ready", undefined as never);

    expect(normalListener).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("void events can be emitted without payload argument", () => {
    const emitter = new EventEmitter<TestEventMap>();
    const listener = vi.fn();

    emitter.on("ready", listener);
    emitter.emit("ready");

    expect(listener).toHaveBeenCalledOnce();
  });
});
