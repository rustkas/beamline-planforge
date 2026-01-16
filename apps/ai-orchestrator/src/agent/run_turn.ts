import { create_ajv, validate_with_ajv } from "@planforge/core-contracts";
import type { violation } from "@planforge/plugin-sdk";
import type { proposed_patch } from "@planforge/plugin-sdk";
import type { ApiResult } from "../api_core_client";
import type { Session } from "../session_store";
import { append_message, get_session, update_revision } from "../session_store";
import { clamp_x_patch, is_out_of_bounds } from "./repair";
import { plan_patch } from "./planner";

export type TurnResult = {
  ok: boolean;
  session_id: string;
  project_id: string;
  base_revision_id: string;
  new_revision_id?: string;
  proposed_patch?: proposed_patch;
  violations?: violation[];
  message: string;
};

type ApiClient = ReturnType<typeof import("../api_core_client").create_api_client>;

const ajv = create_ajv();

function extract_violations(payload: unknown): violation[] {
  if (payload && typeof payload === "object" && "violations" in payload) {
    const list = (payload as { violations?: violation[] }).violations;
    if (Array.isArray(list)) return list;
  }
  return [];
}

async function load_state(api: ApiClient, session: Session) {
  const revision = await api.get_revision(session.project_id, session.last_revision_id);
  return revision;
}

async function apply_patch(api: ApiClient, session: Session, patch: proposed_patch): Promise<ApiResult<{ new_revision_id: string; violations: unknown[] }>> {
  return api.apply_patch(session.project_id, session.last_revision_id, patch);
}

export async function run_turn(api: ApiClient, session_id: string, command: string): Promise<TurnResult> {
  const session = get_session(session_id);
  if (!session) {
    return {
      ok: false,
      session_id,
      project_id: "",
      base_revision_id: "",
      message: "Session not found"
    };
  }

  append_message(session_id, { role: "user", content: command, ts: Date.now() });

  const revision = await load_state(api, session);
  if (!revision.ok) {
    return {
      ok: false,
      session_id,
      project_id: session.project_id,
      base_revision_id: session.last_revision_id,
      message: revision.error.message
    };
  }

  const kitchen_state = revision.data.kitchen_state;
  const schema = validate_with_ajv(ajv, "planforge://schemas/kitchen_state.schema.json", kitchen_state);
  if (!schema.ok) {
    return {
      ok: false,
      session_id,
      project_id: session.project_id,
      base_revision_id: session.last_revision_id,
      message: "state.invalid_schema"
    };
  }

  const plan = plan_patch(command, kitchen_state);
  if (!plan.ok) {
    return {
      ok: false,
      session_id,
      project_id: session.project_id,
      base_revision_id: session.last_revision_id,
      message: plan.error
    };
  }

  let patch = plan.patch;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await apply_patch(api, session, patch);
    if (!result.ok) {
      return {
        ok: false,
        session_id,
        project_id: session.project_id,
        base_revision_id: session.last_revision_id,
        proposed_patch: patch,
        message: result.error.message
      };
    }

    const violations = result.data.violations as violation[];
    if (!violations || violations.length === 0) {
      update_revision(session_id, result.data.new_revision_id);
      append_message(session_id, {
        role: "assistant",
        content: `Applied patch, new revision ${result.data.new_revision_id}`,
        ts: Date.now()
      });
      return {
        ok: true,
        session_id,
        project_id: session.project_id,
        base_revision_id: session.last_revision_id,
        new_revision_id: result.data.new_revision_id,
        proposed_patch: patch,
        message: plan.message
      };
    }

    if (attempt < 2 && is_out_of_bounds(violations)) {
      patch = clamp_x_patch(kitchen_state, patch);
      continue;
    }

    return {
      ok: false,
      session_id,
      project_id: session.project_id,
      base_revision_id: session.last_revision_id,
      proposed_patch: patch,
      violations,
      message: "Violations after patch"
    };
  }

  return {
    ok: false,
    session_id,
    project_id: session.project_id,
    base_revision_id: session.last_revision_id,
    proposed_patch: patch,
    message: "Repair attempts exhausted"
  };
}
