# Family trip planner source handoff

Last updated: 2026-10-30 by Codex release-round.

## 0. Operating protocol — mandatory for every agent and model

Any LLM or person working in this repo follows these rules. No exceptions for "small" changes.

1. **Read first.** Read this whole file before doing anything. Then read whatever `README.md` sections your task touches.
2. **Before you start work:** add an entry under **§1 In progress**. Give the date, who you are (tool + model), what you are about to do, and which files or systems you will touch. Save the file (and commit it if you can) **before** you start the work itself. If you are interrupted, the next agent will know what was underway.
3. **After you finish, or when you stop for any reason:**
   - Remove your entry from §1.
   - Add a dated entry at the top of **§8 Work log**. Say what changed, the commit SHA, and what you verified versus what is still untested.
   - Update **§5 Current state**, **§6 Open items** and **§7 Gotchas** so they describe the project as it is *now*.
   - Update "Last updated" at the top.
4. **Stale "In progress" entries:** an entry left by someone else means that work was interrupted. Check what actually landed (git log, database, live site), then finish it or roll it back, and record what you found in the Work log.
5. **Current state means current.** History goes only in the Work log, newest first. Never delete Work log entries.
6. **Never put secrets in this file**, including API keys, the Supabase service-role key, passwords, or personal data about family members beyond first names.
7. **If you can't write to the repo**, put the exact text you would have added in your reply to the owner so they can paste it in.


## 1. In progress

None in this release lane. Documentation privacy separation is complete; owner actions below remain open.

## 2. Product and architecture

A private family/group trip planner: signed-in people join circles and households, vote on properties and record private household logistics. Vacation planning is the default; acquisition features are hidden unless enabled by a circle. Static client in public/, Supabase authentication and row-level security, explicit RPCs and reviewed schema migrations. Public source is Justice-Write/family-estate-planner; configured host is family-estate-planner.pages.dev.

## 3. Current source state

Main includes workflow maintenance a2c4496: research job bounded at 70 minutes around its existing 60-minute script budget; unused model variable removed. Script syntax and workflow YAML validation pass. The historical listing-workflows-review branch is preserved but superseded; never deploy it over current main. No research/health workflow or live database operation was dispatched by this lane.

## 4. Public/private boundary

Only public/ is deployable. Runtime code, public property research and intentionally publishable client configuration belong in source. Circle/party invite codes are access material, not source fixtures. Live memberships, votes, household budgets/dates, contact/account details, auth sessions, service-role/provider keys and operator histories stay outside public docs and packages. Keep full operator notes in the owner private operations workspace.

Existing public operator docs contained live invite codes. Current-tree documentation is redacted; old commits were not rewritten. The owner must rotate exposed codes through the authorized Admin flow and review memberships. No misuse or unauthorized membership is claimed. Do not attempt live access using historical codes.

## 5. Verification and blockers

- Both Node scripts parse and research workflow YAML validates. No runtime public/ asset changes in this release.
- Anonymous automated readback to the configured Pages origin returned HTTP 403. Access was not bypassed, and deployed-byte equality is not claimed. Verify the existing host through its authorized owner path.
- Provider secrets are missing per the prior operator check; no values were requested or retained in chat. Existing Supabase connector scope cannot access the documented project organization. Live provider and database acceptance remain blocked.

## 6. Next steps

Owner: rotate previously exposed live circle invite codes, review memberships, confirm authorized host access, enter required Actions secrets in GitHub and reconnect the appropriate Supabase organization. Agents: rerun provider jobs only after authorization/configuration is ready, inspect candidate SQL in PRs, and never auto-apply research results. Keep the acquisition feature hidden by default.

## 7. Work log

- 2026-10-30 Codex: maintained bounded research workflow without provider/DB calls; preserved historical source; separated private operator handoffs from public source after finding invite codes. Existing history remains preserved, requiring owner rotation rather than an unauthorized history rewrite or database action.
