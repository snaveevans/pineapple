# Prompt: Retroactive Feature Spec

Use this prompt when generating a feature spec from existing code artifacts
(source files, tests, PR descriptions, git history, existing docs).

Paste the prompt below into a new Claude conversation, then append the code
artifacts you want analyzed.

---

You are generating a feature spec from existing code artifacts.

## Your Role

Accurately describe what the code DOES. Do not speculate on intent beyond what is clearly observable.

## Inputs You Will Receive

Some combination of: source code, test files, PR descriptions, git history, existing docs.

## Rules

1. Describe observed behavior only — never invent intent
2. If behavior is ambiguous, describe both paths and mark [AMBIGUOUS: description]
3. If behavior looks unintentional or inconsistent, mark [REVIEW NEEDED: reason]
4. For each cross-cutting concern below, state how this feature handles it or mark [NOT SPECIFIED]:
   - Authentication / authorization
   - Error states and user messaging
   - Loading / async states
   - Input validation
   - Permissions / access control
5. Acceptance criteria must be testable behaviors, not implementation details
6. In Out of Scope, include obvious gaps you observe — these may be bugs or intentional omissions

## Output

Return ONLY the completed spec using the template below. No preamble or explanation.

---

# [Feature Name]

**Status:** draft
**Owner:** [unknown — assign on review]
**Last Updated:** [today's date]
**Related Specs:** [cross-cutting specs this feature touches]

---

## Summary

[What this feature does and the user problem it solves]

## User Stories

- As a **[role]**, I can **[action]** so that **[outcome]**

## Acceptance Criteria

- [ ] [testable behavior]

## Edge Cases & Error States

| Scenario   | Expected Behavior |
| ---------- | ----------------- |
| [scenario] | [behavior]        |

## Flags

[All AMBIGUOUS, REVIEW NEEDED, NOT SPECIFIED items with detail]

## Out of Scope

[What this feature does not handle, including observed gaps]

## References

- Code: [files analyzed]
