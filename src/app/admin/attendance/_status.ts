export const STATUS_WORD: Record<string, string> = { PRESENT: "On time", LATE: "Late", ABSENT: "Absent", LEAVE: "On leave", HOLIDAY: "Holiday" };
export const STATUS_TONE: Record<string, "ok" | "warn" | "err" | "info" | "plain"> = { PRESENT: "ok", LATE: "warn", ABSENT: "err", LEAVE: "info", HOLIDAY: "plain" };
export const timeOf = (d: Date | null) => (d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "—");
