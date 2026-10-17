---
name: plan-step
description: Do one numbered step of a plan in docs/ (e.g. docs/plan-auth-sqlite.md) in a fresh session, tests first, with minimal token use. Use when asked to "do step N of docs/<plan>.md" or to continue the plan.
---

# Doing one plan step

One session = one step. Its context starts cold, so only load what that step needs.

## Routine

1. **Read the plan, not the codebase.** Read `docs/<plan>.md` once. Check off what's done (`- [x]`)
   and work only on the requested step (or the first unchecked one). CLAUDE.md is already loaded:
   don't re-read it.
2. **Load only the step's files.** Open the files the step names, plus the skill it points to
   (`sqlite-db`, `auth`, `i18n`). For anything else, find it first with `grep -n` and read only that
   part with `sed -n 'A,Bp'`. Never explore broadly and never spawn agents.
3. **Tests first.** Write the step's tests, then run them and confirm they fail for the right reason
   (missing module/route, wrong status), not because of a typo in the test.
4. **Implement** until the tests pass. Run only the file you're working on:
   `cd server && npx vitest run tests/auth.test.ts` (same for `shared/`, `client/`).
5. **Full check once at the end:** `npm run lint && npm run typecheck && npm test`. Paste failures,
   don't paraphrase them.
6. **Record the step:**
   - tick its checkbox in the plan, and add a line under it for any decision that differs from
     the plan;
   - update the CLAUDE.md sections it affects (architecture, data model, pages);
   - update or create the skill the step names;
   - commit with a message that names the step (`Step 2: PIN auth on the server`).
7. **Stop.** Report in 3–5 lines what was done, and anything left over for the next step. Don't
   start the next step.

## Ways to save tokens

- Never read `boilerplate/` except the exact file a step names, and then only the relevant part.
- Never read `client/src/i18n/et.ts` or `ru.ts` whole. Follow the `i18n` skill and use `grep -n` to
  find where keys go.
- Don't read `package-lock.json`, `node_modules/`, `dist/` or `data/`.
- Read the start of large test files (`server/tests/api.test.ts`) for the setup pattern, then add
  new tests in a new file.
- Don't re-read a file after editing it. Run commands with `| tail -30`.
- If the plan turns out wrong or unclear, ask the user (one short question) instead of exploring
  to guess.
