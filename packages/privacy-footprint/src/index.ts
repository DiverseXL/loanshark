// Typed privacy footprint shared by apps/web and @loanshark/preflight.
//
// No imports, no network, no chain call: pure data and types.

export type { ActionFootprint, FootprintActionId } from "./actions.js";
export { FOOTPRINT_ACTIONS, FOOTPRINTS } from "./actions.js";

export type { FieldClass, FieldClassification } from "./contract-fields.js";
export {
  CONTRACT_FIELD_CLASSIFICATION,
  CONVERSATION_KEY_FIELDS,
} from "./contract-fields.js";
