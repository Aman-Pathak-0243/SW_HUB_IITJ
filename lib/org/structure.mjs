// Organization structure seed (capabilities 2 & 4). Org-unit TYPES, the
// allowed parent→child hierarchy edges, and base POSITION definitions are all
// DATA. The actual org units / people / appointments are migrated from V1 in
// Session 5 (see DATA_MIGRATION_REPORT.md §7); this file only seeds the
// type/position vocabulary they will reference.

export const ORG_UNIT_TYPES = [
  { key: "office", name: "Administrative Office", description: "Institute office (e.g. Dean of Student Affairs).", sortOrder: 10, isSystem: true },
  { key: "council", name: "Council", description: "Student council (General, Academic, Cultural, Sports).", sortOrder: 20, isSystem: true },
  { key: "club", name: "Club", description: "Student club under a council.", sortOrder: 30, isSystem: true },
  { key: "committee", name: "Committee", description: "Standing or ad-hoc committee.", sortOrder: 40, isSystem: true },
  { key: "hostel", name: "Hostel", description: "Residential hostel.", sortOrder: 50, isSystem: true },
  { key: "mess", name: "Mess", description: "Hostel / campus mess.", sortOrder: 60, isSystem: true },
];

// [parentTypeKey, childTypeKey]
export const ALLOWED_CHILD_EDGES = [
  ["office", "council"],
  ["office", "committee"],
  ["office", "hostel"],
  ["office", "mess"],
  ["council", "club"],
  ["council", "committee"],
];

// Base positions. appliesToType=null => institute-level (e.g. Dean).
// holderKind is a soft hint (person_type). maxHolders: null => unlimited;
// the DB enforces it (singleton via the partial unique + the deferred
// cardinality trigger). isLead marks the unit's lead role.
export const POSITIONS = [
  // Institute-level (Student Affairs office)
  { key: "dean", name: "Dean of Student Affairs", appliesToType: null, holderKind: "faculty", maxHolders: 1, rank: 100, isLead: true },
  { key: "associate_dean", name: "Associate Dean", appliesToType: null, holderKind: "faculty", maxHolders: null, rank: 90, isLead: false },
  { key: "assistant_registrar", name: "Assistant Registrar", appliesToType: null, holderKind: "staff", maxHolders: 1, rank: 60, isLead: false },
  { key: "sports_officer", name: "Sports Officer", appliesToType: null, holderKind: "staff", maxHolders: 1, rank: 55, isLead: false },
  // Council
  { key: "council_secretary", name: "Council Secretary", appliesToType: "council", holderKind: "student", maxHolders: 1, rank: 50, isLead: true },
  // Club
  { key: "pic", name: "Professor-in-Charge", appliesToType: "club", holderKind: "faculty", maxHolders: 1, rank: 45, isLead: true },
  { key: "secretary", name: "Secretary", appliesToType: "club", holderKind: "student", maxHolders: 1, rank: 40, isLead: true },
  { key: "coordinator", name: "Coordinator", appliesToType: "club", holderKind: "student", maxHolders: null, rank: 30, isLead: false },
  { key: "co_coordinator", name: "Co-Coordinator", appliesToType: "club", holderKind: "student", maxHolders: null, rank: 25, isLead: false },
  // Hostel
  { key: "warden", name: "Warden", appliesToType: "hostel", holderKind: "faculty", maxHolders: 1, rank: 50, isLead: true },
  { key: "wellness_warden", name: "Wellness Warden", appliesToType: "hostel", holderKind: "faculty", maxHolders: null, rank: 45, isLead: false },
  { key: "hostel_secretary", name: "Hostel Secretary", appliesToType: "hostel", holderKind: "student", maxHolders: 1, rank: 35, isLead: false },
  { key: "caretaker", name: "Caretaker", appliesToType: "hostel", holderKind: "staff", maxHolders: null, rank: 30, isLead: false },
  { key: "attendant", name: "Attendant", appliesToType: "hostel", holderKind: "staff", maxHolders: null, rank: 20, isLead: false },
  // Mess
  { key: "mess_secretary", name: "Mess Secretary", appliesToType: "mess", holderKind: "student", maxHolders: 1, rank: 35, isLead: true },
  { key: "mess_committee_member", name: "Mess Committee Member", appliesToType: "mess", holderKind: "student", maxHolders: null, rank: 20, isLead: false },
];
