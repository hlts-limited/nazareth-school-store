/** Documents every application needs. Shared by the server and the browser form (no database code here). */
export const DOC_KINDS = [
  { kind: "passport", label: "Candidate's passport photograph", required: true },
  { kind: "faith", label: "Baptismal certificate (Catholic) or dedication certificate", required: true },
  { kind: "birth", label: "Birth certificate", required: true },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["kind"];

export const RELIGIONS = ["Catholic", "Christian (other denomination)", "Muslim", "Other"] as const;

/** Catholics bring a baptismal certificate; everyone else a dedication certificate. */
export const docLabel = (kind: string, religion?: string | null) =>
  kind === "faith"
    ? religion === "Catholic" ? "Baptismal certificate" : religion ? "Dedication certificate" : "Baptismal certificate (Catholic) or dedication certificate (non-Catholic)"
    : DOC_KINDS.find((d) => d.kind === kind)?.label ?? kind;
