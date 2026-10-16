# WorkPulse

A single-organization employee reporting platform: React + TypeScript + Vite, Tailwind CSS, Firebase Authentication, Cloud Firestore, a trusted Vercel Node.js API, Recharts, and Lucide. Attendance and hours are **employee-reported**, not independent evidence of attendance or actual time worked.

## Live deployment (2026-10-16)

- Production: https://workpulse-lake-three.vercel.app
- Repository: https://github.com/Alexwatson-de/Workpulse (`main`, Vercel Git integration enabled).
- Firebase: `workpulse-13227`; new default Standard Firestore database in `us-central1`, deletion protection enabled, restrictive rules deployed and composite indexes verified READY. Email/password Auth enabled; the production hostname is authorized.
- Initial administrator: `dhruv.bansal@softage.ai`. Firebase accepted the password-reset/setup email request. Use the email link or **Forgot your password?**; inbox delivery cannot be verified by the application.
- Vercel: `dhruv-820e/workpulse`, existing Hobby team explicitly requested by the owner. No billing plan was changed. See the service-plan restriction below; successful hosting does not establish eligibility under Vercel's terms.
- Server identity: dedicated `workpulse-vercel` service account with `roles/datastore.user` and `roles/firebaseauth.admin`. Server credentials are sensitive production-only Vercel variables. Local values live in ignored owner-readable `.env`; the tracked template is blank and `.vercelignore` excludes all environment files.
- Live verification passed: synthetic-role sign-in, protected routes, employee draft/preview/submission, manager correction/resubmission/approval, immutable revisions, cross-user read denial, privileged API denial, inactive-user denial, responsive layout and no uncaught browser errors. Synthetic accounts were disabled, tokens revoked and the test project archived; clearly labeled synthetic reports/audit records remain and are not actual employee work.

Only production has cloud environment variables. Preview deployments need separately approved origins/configuration before use. RoomSync and Forum were not modified.

## Implementation

- Invitation-only application access; email/password login, password reset, protected routes, inactive-account handling, and profile editing.
- Employee, directly assigned manager, and administrator authorization. Firestore scopes reads; the trusted API owns all writes. No client can promote itself or write reports, reviews, revisions, settings, or audit events directly.
- Daily reports with configurable attendance, date policies, multiple searchable assigned-project entries, quarter-hour inputs, duplicate/reorder/collapse controls, descriptions, questions, deliverables, blockers, secondary tasks, and additional notes.
- Confirmed Firestore draft saving, in-tab recovery, complete preview, transactional submission, deterministic employee/date IDs, optimistic version checks, and idempotent retries. Secondary-task hours count as regular hours, not invisible extra time.
- Review queue, comments, correction requests, resubmission, approvals, and immutable snapshots of every previous saved version. Approval cannot be self-granted.
- Project create/edit/archive/reactivate, owners, members, dates, status, membership records and notifications, project details, and authorized activity.
- Employee invitation/edit/deactivation, roles, managers, teams and departments; CSV import validation/preview and sensitive activation-link delivery; filtered, sorted, paginated employee views and exports.
- Organization policy editor; report monitoring/filtering; daily/weekly/monthly analytics, attendance distributions, hours, question counts, project participation, missing/late and review statistics; Excel-compatible CSV exports with spreadsheet-formula protection.
- Recipient-only notifications and persistent preferences. Deadline/missing reminders respect timezone, working days and holidays, are deduplicated, and refresh every five minutes while the tab is visible.
- Responsive sidebar, mobile navigation, keyboard focus-trapped dialogs, accessible labels, validation alerts, toasts, skeletons, empty states and real database-derived metrics.
- Reference-inspired Frost theme: blue/lilac glass canvas, dark ink, cobalt focus card, rounded panels, a 7/14-day activity view, team shortcuts, pastel project tiles and a contextual right rail. All tiles/actions are wired to real authorized records. Dialogs are rendered outside transformed cards, with the background inert and keyboard focus contained.

## Admin removal and recovery

Use **Remove** beside a record in **Employees**, **Projects**, **All reports**, or **Settings > Teams / Departments**. The administrator must enter a reason and type the exact record name. **Recycle Bin** in the admin sidebar lists removed records by type and supports restoration. No records are automatically removed by this release.

- Removal is recoverable, not permanent erasure. It stores `deletedAt`, `deletedBy`, and `deletionReason` and appends an immutable audit event; restoration is audited too. Only the trusted API can mutate these fields. Managers and employees cannot use removal/restoration operations.
- Employees: access is denied immediately by the profile's inactive state, project memberships are removed, and normal directory entries are hidden. Existing report history and the Firebase Auth identity are retained. Reassign direct reports and owned projects first. An admin cannot remove their own account; concurrent operations cannot remove the acting administrator and then use stale privileges.
- Projects: removed from normal project views and selectors, memberships cleared, existing reporting history preserved. Removed projects cannot be reused even when the policy allows archived projects.
- Reports: excluded from normal history, dashboards, analytics and exports, with previous versions/comments preserved. The employee/date ID stays reserved; restoration is required instead of creating a duplicate. Existing authorized readers can still inspect a preserved report by direct link; removal is not a confidentiality-revocation operation.
- Teams/departments: first reassign or remove associated users/projects. Historical report references remain intact.
- Restore employees as **inactive employees**, with no team/department/manager assignment; administrators explicitly review role and activation afterward. Restore projects **archived and unassigned**, with no automatic return of old members. Restore reports with another revision snapshot.
- A removal handles at most 150 memberships/project assignments atomically. Larger cases require reducing assignments first; the server refuses rather than partially removing. Recycle Bin lists the latest 500 removed records per type. Ordinary list query limits include removed documents and still show truncation warnings; no destructive migration or new composite indexes are required.
- Permanent account/data erasure, audit deletion, and a bulk empty-bin action are intentionally not offered. These need a separate retention/privacy procedure; removing an account from WorkPulse is not deleting its Firebase identity.

## Run locally

Use Node 24. Install dependencies with `npm ci`. Copy [.env.example](.env.example) to a locally ignored `.env` and fill in the approved Firebase project's identifiers and server credentials. Never paste administrative credentials into source or public environment variables. For local development set `APP_ORIGIN=http://127.0.0.1:5173`; the production value must remain the exact production hostname.

Run in two terminals:

```sh
npm run dev:api
npm run dev
```

Vite proxies `/api` to the local Node API on port 3000. Vite alone cannot perform trusted writes. Alternatively use `npx vercel dev` with a correctly linked, authorized Vercel project.

Without Firebase web configuration the sign-in screen explicitly reports that setup is required. There is no production demo mode, fallback database, fabricated reporting metric, or public administrator registration.

## Environment variables

Public browser configuration (Firebase project identifiers, not Admin credentials):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Server only, stored as sensitive Vercel environment variables:

- `FIREBASE_PROJECT_ID` — must match the browser project.
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY` — private key, with real newlines or escaped `\n`.
- `APP_ORIGIN` — exact application origin, e.g. `https://your-approved-domain.example`; no trailing slash.

Local tests only: `VITE_USE_EMULATORS=true`, optional emulator ports from the example file, `FIRESTORE_EMULATOR_HOST`, and `FIREBASE_AUTH_EMULATOR_HOST`. Production builds ignore the browser emulator flag. The test fixtures have hard guards against writing to production.

The server may use Application Default Credentials instead of a key in an appropriately configured operator environment. Vercel requires its own securely configured server identity. Give that identity only the necessary Firestore and Firebase Authentication administrative permissions. Do not commit service-account JSON files. GitHub access tokens are unrelated to Firebase/Vercel runtime configuration and must never enter the application or Vercel public variables.

## Firebase setup and initial administrator

1. Choose an explicitly authorized, dedicated Firebase project. Existing RoomSync and Forum configurations were inspected but not changed or reused. These are single-organization top-level collections: do not deploy these rules into an unrelated application database.
2. Enable Authentication → Email/Password. Configure the email templates and authorized domains for the production and approved preview origins. Create the default Firestore database in the approved region if it does not exist. Do not enable Storage or Firebase Cloud Functions; neither is used.
3. Review and deploy [firestore.rules](firestore.rules) and [firestore.indexes.json](firestore.indexes.json):

```sh
npx firebase login
npx firebase deploy --project YOUR_AUTHORIZED_PROJECT_ID --only firestore:rules,firestore:indexes
```

This does not delete documents. Rules replace the target's ruleset, so verify the project ID and compatibility first. Wait for indexes to finish building before production use. Emulator tests do not prove production indexes have finished provisioning.

4. In a trusted operator shell set `WORKPULSE_BOOTSTRAP_EMAIL` and `WORKPULSE_BOOTSTRAP_NAME` (or include them in the ignored operator environment file), and run:

```sh
node --env-file=.env --import tsx scripts/bootstrap-admin.ts
```

The bootstrap refuses to run if an administrator already exists, refuses to overwrite a profile, and uses a transactional one-time lock. It creates an initial profile and default policy without printing a password or activation link. No client endpoint can bootstrap an administrator.

5. Use **Forgot your password?** with the initial administrator's email to activate the account. After sign-in configure timezone, policies, departments and teams; invite managers and employees; assign project memberships. Share one-time employee activation links through a trusted work channel. No paid email service is a core dependency.

## Data architecture

- `users/{authUid}`: work identity, employee ID, role, active state, department/team/manager, created timestamp. Self-read is allowed for inactive users only so they can see the account-status screen; no inactive data access follows.
- `teams/{id}`, `departments/{id}`: named organization units.
- `projects/{id}`: owner, member IDs, team, status and dates; `memberships/{projectId}_{uid}`: queryable assignment relationship.
- `reports/{uid}_{YYYY-MM-DD}`: attendance, project entry array, secondary-task object, contextual fields, derived project IDs, employee/manager/team snapshot, status, version, timestamps, lateness and latest feedback.
- `reports/{id}/revisions/{version}`: immutable previous complete report, actor, action and timestamp. `reports/{id}/comments/{id}`: review discussion.
- `notifications/{stableHash}` and `notificationPreferences/{uid}`: recipient-only notices and opt-out preferences.
- `settings/organization`: validated reporting policy.
- `auditEvents/{id}`: append-only trusted events. No client writes or deletes.
- `operations/{stableHash}`: server-private idempotency receipts and fingerprinted results; `rateLimits/{uid}`: server-private request counter. `system/bootstrap`: one-time setup lock.

Project entries and secondary tasks are embedded to permit atomic whole-report validation and revision snapshots. Client mutation payloads are Zod-validated on the trusted server. Reports use ISO timestamps, organization-local report dates, server-derived identity and manager snapshots, and atomic transactions. Current project membership and project date windows are checked at every save/submit, including drafts. Firestore has no publicly readable employee, project or report collections. Provisioning refuses to grant privileges to an existing unverified, unmanaged Auth identity; server-managed deterministic identities permit safe invitation retries without trusting a public signup's password.

Managers are deliberately restricted to their direct reporting line, not everyone who shares a team. Project membership alone does not expose colleagues' reports. Historical report scope follows the manager snapshot on that report. Transfers are prospective; retroactive historical-access reassignment is not implemented.

## Tests

Local verification on 2026-10-16: **111 tests passed** — 48 domain/HTTP boundary tests, 16 Firestore rule tests, 31 backend emulator tests (including 15 removal/recovery tests), and 16 desktop/mobile browser workflows (including six lifecycle/theme checks). TypeScript and the production build passed. Lockfile installation validation passed. The runtime dependency audit reported zero vulnerabilities; upstream development-tool advisories remain. This is local/emulator evidence, not a production deployment or a security certification.

```sh
npm run check                  # Domain tests + TypeScript + production build
npm audit --omit=dev           # Runtime dependency audit
npx playwright install chromium
npm run test:firebase          # Auth/Firestore emulators; rules, API and browser suites
```

Java 21 is required by the current Firebase CLI/emulator. The local validation used an isolated Java runtime without changing the system Java installation. Use Node 24 and Java 21 in CI; [.github/workflows/ci.yml](.github/workflows/ci.yml) contains the full verification workflow and needs no production secrets.

With emulators already running, use `npm run test:rules:running`, `npm run test:integration`, and `npm run test:browser:running`. The browser driver resets **only** the loopback `demo-workpulse` emulator database, then creates clearly test-only identities. Never point it at production. The test password is an emulator fixture, not a production credential. Browser traces and reports are ignored by Git because they can contain test-session data.

## GitHub and Vercel deployment

The authorized repository is now pushed and connected to Vercel. Existing macOS Git credentials were used through the credential helper; the token previously pasted in chat was not used or stored. Revoke any token exposed in chat. The following procedure remains the redeployment/operator checklist.

1. Inspect the specified remote and branch before pushing. If it already contains work, fetch and integrate WorkPulse on a feature branch; do not force-push or replace unrelated commits. If it is a new empty authorized repository, add its remote and push the local application branch.
2. In Vercel link/import that authorized repository, select Vite, set the root to the application root, build command `npm run build`, install command `npm ci`, output `dist`, and Node 24. [vercel.json](vercel.json) includes SPA routing that preserves `/api`, security headers, and the trusted API function.
3. Configure public and server-only environment variables above for the correct deployment environments. Configure `APP_ORIGIN` separately for production and any stable approved preview domain. Do not wildcard origins. Do not put server keys in `VITE_*` variables.
4. Deploy Firestore rules/indexes to the approved project, activate the initial administrator, and ensure Firebase Auth authorized domains include the deployment domain.
5. Deploy using the authenticated Vercel integration or `npx vercel --prod`, then verify the reported URL. A successful local build is not proof of a successful deployment.
6. Verify HTTPS, sign-in, inactive-account denial, employee draft/submit, manager correction/resubmission/approval, administrator project assignment, exports, and unauthorized read/write denials **against production with authorized synthetic accounts**. Confirm deployment status in Vercel and commit/branch status in GitHub. Remove or deactivate synthetic accounts through an approved procedure; do not delete existing organizational data.

### Service-plan considerations

The architecture does not intrinsically need Firebase Blaze: Auth + Firestore + an externally hosted Admin SDK do not require Firebase Functions or Storage. Actual quotas and project settings still apply; monitor usage. Official references: [Firebase pricing](https://firebase.google.com/pricing/), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Authentication limits](https://firebase.google.com/docs/auth/limits).

**Vercel Hobby is restricted to personal, non-commercial use.** An internal business application needs an eligible business-use plan, generally Pro, even when resource usage is small. No billing-plan change is authorized or performed by this implementation. See [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) and [plans](https://vercel.com/docs/plans).

## Boundaries and operational limitations

- Production deployment and smoke checks are complete for the explicitly authorized targets above. Plan eligibility remains an owner responsibility; no business-use eligibility claim is made for Hobby.
- Vercel's Node runtime did not support the CommonJS-to-ESM import used by `jwks-rsa` 4.x / `jose` 6.x. The Firebase Admin dependency is narrowly overridden to `jwks-rsa` 3.2.2, tested against live Firebase token verification and audited with zero runtime vulnerabilities. Reevaluate this override when the upstream runtime/library compatibility changes.
- The lockfile includes cross-platform WASM transitive dependencies required by cloud npm 12. Older npm installations may prune them during lockfile rewrites: validate clean Linux-targeted `npm ci` with the deployment npm version before committing dependency changes.
- In-app reminders run while the application is open/visible; no background scheduler, email-notification service, or push delivery is configured. Existing notification records remain durable.
- Optional AI assistance is deliberately disabled: no WorkPulse-specific provider, employee-data consent or API credentials were authorized. RoomSync's AI configuration was not reused.
- Exports are UTF-8 BOM CSV readable by Excel, not native `.xlsx` workbooks.
- Views cap each query at 1,000 records and warn explicitly if reached. Date ranges are limited to 366 days. Larger organizations need server-side cursor pagination/aggregation before relying on complete organization analytics; client table pagination alone is not unlimited database pagination.
- Completion uses the currently active authorized roster and each employee's creation date; a historical employment/leave calendar and retroactive manager transfers are not modeled. Declare leave explicitly; attendance is never independently verified.
- Rate limiting is basic per-identity throttling; advanced abuse mitigation, SSO/MFA policy, backups, retention/deletion approvals and compliance review are operational follow-ups, not claims of certification.
- Previous versions, audit records and idempotency receipts intentionally have no automatic deletion. Set a retention policy and budget before large-scale adoption. Development-tool dependencies have upstream audit advisories; production/runtime dependencies were separately audited.
- Account deactivation is enforced from the profile on every database/API request. It does not remove the Firebase Auth identity or destroy historical reports.
