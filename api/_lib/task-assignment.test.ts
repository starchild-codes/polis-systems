import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTaskAssignmentMessage,
  handleTaskAssignment,
  type AssignmentCollector,
  type AssignmentMembership,
  type AssignmentProfile,
  type AssignmentRequest,
  type AssignmentTask,
  type SafeAssignmentLog,
  type TaskAssignmentSender,
  type TaskAssignmentStore,
} from "./task-assignment.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const COLLECTOR_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const task: AssignmentTask = {
  id: TASK_ID,
  organizationId: ORGANIZATION_ID,
  collectorId: COLLECTOR_ID,
  title: "Lake cleanup",
  description: "Remove plastic waste",
  location: "East lake gate",
  zone: "East",
  dueAt: "2026-07-22T12:30:00.000Z",
  priority: "high",
  status: "assigned",
};

const profile: AssignmentProfile = { activeOrganizationId: ORGANIZATION_ID };
const membership: AssignmentMembership = {
  organizationId: ORGANIZATION_ID,
  role: "operator",
  isActive: true,
};
const collector: AssignmentCollector = {
  id: COLLECTOR_ID,
  organizationId: ORGANIZATION_ID,
  phoneE164: "+919000000001",
};

function tracked<TArguments extends unknown[], TResult>(
  implementation: (...arguments_: TArguments) => TResult,
) {
  const calls: TArguments[] = [];
  const callable = (...arguments_: TArguments): TResult => {
    calls.push(arguments_);
    return implementation(...arguments_);
  };
  return Object.assign(callable, { calls });
}

function createStore(overrides: Partial<TaskAssignmentStore> = {}): TaskAssignmentStore {
  return {
    authenticate: async () => ({ id: USER_ID }),
    getProfile: async () => profile,
    getTask: async () => task,
    getMembership: async () => membership,
    getCollector: async () => collector,
    prepareAssignment: async () => ({ result: "prepared", sessionId: "session-1" }),
    completeAssignment: async () => true,
    failAssignment: async () => undefined,
    ...overrides,
  };
}

function createSender(
  implementation: TaskAssignmentSender["send"] = async () => ({ messageSid: "SM-outbound-1" }),
): TaskAssignmentSender {
  return { send: implementation };
}

function request(overrides: Partial<AssignmentRequest> = {}): AssignmentRequest {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid-user-token" },
    body: { taskId: TASK_ID },
    ...overrides,
  };
}

async function execute(
  store = createStore(),
  sender = createSender(),
  log?: (entry: SafeAssignmentLog) => void,
) {
  return handleTaskAssignment(request(), {
    store,
    sender,
    log,
    now: () => new Date("2026-07-20T12:00:00.000Z"),
  });
}

describe("WhatsApp outbound task assignment", () => {
  it("sends for an authenticated organization operator and finalizes the session", async () => {
    const prepare = tracked(createStore().prepareAssignment);
    const complete = tracked(createStore().completeAssignment);
    const send = tracked(async (_message: Parameters<TaskAssignmentSender["send"]>[0]) => ({
      messageSid: "SM-outbound-success",
    }));
    const response = await execute(
      createStore({ prepareAssignment: prepare, completeAssignment: complete }),
      createSender(send),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), {
      sent: true,
      duplicate: false,
      message: "WhatsApp assignment sent.",
    });
    assert.equal(prepare.calls.length, 1);
    assert.equal(send.calls.length, 1);
    assert.deepEqual(complete.calls, [[{
      sessionId: "session-1",
      outboundMessageSid: "SM-outbound-success",
      actorId: USER_ID,
    }]]);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await handleTaskAssignment(
      request({ headers: {} }),
      { store: createStore(), sender: createSender() },
    );
    assert.equal(response.status, 401);
  });

  it("rejects access to a task outside the active organization", async () => {
    const response = await execute(createStore({
      getProfile: async () => ({ activeOrganizationId: "different-organization" }),
    }));
    assert.equal(response.status, 403);
  });

  it("rejects an inactive or invalid role", async () => {
    const response = await execute(createStore({
      getMembership: async () => ({ ...membership, role: "viewer" as "operator" }),
    }));
    assert.equal(response.status, 403);
  });

  it("returns 404 when the task does not exist", async () => {
    const response = await execute(createStore({ getTask: async () => null }));
    assert.equal(response.status, 404);
  });

  it("reports an already accepted assignment accurately without sending again", async () => {
    const send = tracked(async (_message: Parameters<TaskAssignmentSender["send"]>[0]) => ({
      messageSid: "should-not-send",
    }));
    const response = await execute(
      createStore({ getTask: async () => ({ ...task, status: "accepted" }) }),
      createSender(send),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(JSON.parse(response.body), {
      error: "The collector has already accepted this assignment. Refresh the task to see its current status.",
      code: "task_not_assignable",
    });
    assert.equal(send.calls.length, 0);
  });

  it("returns 404 when the assigned collector does not exist", async () => {
    const response = await execute(createStore({ getCollector: async () => null }));
    assert.equal(response.status, 404);
  });

  it("blocks a collector from another organization", async () => {
    const response = await execute(createStore({
      getCollector: async () => ({ ...collector, organizationId: "different-organization" }),
    }));
    assert.equal(response.status, 403);
  });

  it("rejects a missing or invalid collector phone", async () => {
    for (const phoneE164 of [null, "not-a-phone"]) {
      const response = await execute(createStore({
        getCollector: async () => ({ ...collector, phoneE164 }),
      }));
      assert.equal(response.status, 422);
    }
  });

  it("does not send a duplicate assignment", async () => {
    const send = tracked(async (_message: Parameters<TaskAssignmentSender["send"]>[0]) => ({
      messageSid: "should-not-send",
    }));
    const response = await execute(
      createStore({
        prepareAssignment: async () => ({
          result: "already_sent",
          sessionId: "session-1",
          outboundMessageSid: "SM-existing",
        }),
      }),
      createSender(send),
    );
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).duplicate, true);
    assert.equal(send.calls.length, 0);
  });

  it("does not overwrite a collector's active proof workflow", async () => {
    const send = tracked(async (_message: Parameters<TaskAssignmentSender["send"]>[0]) => ({
      messageSid: "should-not-send",
    }));
    const response = await execute(
      createStore({
        prepareAssignment: async () => ({ result: "collector_busy", sessionId: null }),
      }),
      createSender(send),
    );
    assert.equal(response.status, 409);
    assert.match(response.body, /finish or cancel their active proof workflow/iu);
    assert.equal(send.calls.length, 0);
  });

  it("reuses the prepared database session returned by the store", async () => {
    const complete = tracked(createStore().completeAssignment);
    await execute(createStore({
      prepareAssignment: async () => ({ result: "prepared", sessionId: "reused-session" }),
      completeAssignment: complete,
    }));
    assert.equal(complete.calls[0]?.[0].sessionId, "reused-session");
  });

  it("cancels the prepared session when Twilio sending fails", async () => {
    const fail = tracked(async (_sessionId: string) => undefined);
    const response = await execute(
      createStore({ failAssignment: fail }),
      createSender(async () => { throw new Error("private Twilio error"); }),
    );
    assert.equal(response.status, 502);
    assert.doesNotMatch(response.body, /private Twilio error/);
    assert.deepEqual(fail.calls, [["session-1"]]);
  });

  it("returns a safe error when finalization fails", async () => {
    const fail = tracked(async (_sessionId: string) => undefined);
    const response = await execute(createStore({
      completeAssignment: async () => false,
      failAssignment: fail,
    }));
    assert.equal(response.status, 502);
    assert.doesNotMatch(response.body, /assignment_finalize_failed/);
    assert.equal(fail.calls.length, 0, "a Twilio-accepted message must not be made retryable");
  });

  it("logs only safe assignment metadata", async () => {
    const entries: SafeAssignmentLog[] = [];
    await execute(createStore(), createSender(), (entry) => entries.push(entry));
    const serialized = JSON.stringify(entries);
    assert.match(serialized, /"status":"sent"/);
    assert.doesNotMatch(serialized, /9000000001|East lake gate|Lake cleanup|valid-user-token/);
  });

  it("omits unavailable task labels from the free-form message", () => {
    const message = createTaskAssignmentMessage({
      ...task,
      zone: null,
      location: "",
      dueAt: null,
    });
    assert.match(message.body, /Task: Lake cleanup/);
    assert.doesNotMatch(message.body, /Zone:|Location:|Due:|null|undefined/);
    assert.match(message.body, /Reply ACCEPT/);
    assert.match(message.body, /Reply DECLINE/);
  });
});
