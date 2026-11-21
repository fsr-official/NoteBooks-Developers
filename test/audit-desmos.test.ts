import { describe, expect, it } from "vitest";
import { auditDesmosState, desmosScriptFailureDetails } from "../utils/audit-desmos.js";

describe("Desmos state audit", () => {
  it("reports HTTP or network diagnostics without including request URLs", () => {
    expect(desmosScriptFailureDetails(403, null)).toBe("HTTP 403");
    expect(desmosScriptFailureDetails(null, "net::ERR_CONNECTION_REFUSED"))
      .toBe("network failure (net::ERR_CONNECTION_REFUSED)");
    expect(desmosScriptFailureDetails(null, null)).toBe("no response status or network failure details");
  });

  it("matches compiled expressions against calculator read-back", () => {
    const result = auditDesmosState(
      { expressions: [{ id: "curve-1", type: "expression", latex: "y = x + 1" }] },
      { expressions: { list: [{ id: "curve-1", type: "expression", latex: "y=x+1" }] } },
      { "curve-1": { isError: false } },
    );
    expect(result.counts.errors).toBe(0);
  });

  it("fails when an expression is missing, changed, or invalid in Desmos", () => {
    const missing = auditDesmosState(
      { expressions: [{ id: "curve-1", type: "expression", latex: "y=x" }] },
      { expressions: { list: [] } },
    );
    expect(missing.findings.some(({ message }) => message.includes("missing the compiled expression"))).toBe(true);

    const changed = auditDesmosState(
      { expressions: [{ id: "curve-1", type: "expression", latex: "y=x" }] },
      { expressions: { list: [{ id: "curve-1", type: "expression", latex: "y=x+1" }] } },
      { "curve-1": { isError: true, errorMessage: "invalid" } },
    );
    expect(changed.counts.errors).toBe(2);
  });
});
