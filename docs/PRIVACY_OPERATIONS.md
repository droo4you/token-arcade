# Privacy release and operations

Scope: app data, adults-only screening, providers, retention and deletion. This is an implementation record, not legal clearance. Intended audience confirmed by the owner: adults in crypto communities; no children.

## Implemented

- Neutral date-of-birth entry before loading Privy or game modules. Only a signed eligibility cookie is retained, never the birth date in the app database. Adults: 30 days; rejected eligibility: one day. Restart invalidates cookies. Production authenticated APIs require a valid cookie, including for existing accounts. A false birth date or cleared cookies can bypass self-reported screening; this is not identity verification.
- Privacy notice and unauthenticated email contact accessible without entering the arcade. Contact: droober.business@gmail.com (existing project contact).
- Guest run tracking disabled at client and server. Old clients receive HTTP 410. Legacy guest ID removed from arcade localStorage. Local saves and authenticated account-save sync continue.
- Removed remote Google Fonts requests from the entry page. Referrer-Policy: no-referrer and X-Content-Type-Options: nosniff added at the API/web server.
- Own-account JSON export and idempotent deletion-request queue; admin-only queue in Admin Tools. This is reviewed deletion, not instant erasure. The UI explicitly says so.
- Hourly/startup deletion of legacy analytics and diagnostics older than 30 days; expired wallet challenges older than one day. Completed request records expire after 30 days. Account history and saves remain until reviewed deletion. No blanket deletion of shared financial records.

## Before production release

1. Build/test and deploy this branch to staging. Confirm NODE_ENV=production. The production gate cannot be disabled through AuthSettings.
2. Test on the actual domain over HTTPS: pre-screen requests go only to the arcade origin; no Privy, fonts, RPC or cartridge traffic before eligibility. Inspect provider SDK traffic after eligibility and actual cookies/storage. Check mobile navigation, sign-in, progress sync and one existing game. Confirm expired screening returns to the form.
3. Verify Render's real log, backup, disk and retention settings. Do not log request bodies (the age form transports a date transiently). Determine provider log/backup retention; the app cannot enforce those settings. Record actual values before making specific provider-retention promises.
4. Review Privy project login methods, provider data collection, tracking configuration, retention and deletion procedures. The application can create an embedded wallet when opening Passport. Do not destroy a wallet or recovery access as a side effect of account deletion.
5. Confirm the privacy mailbox is monitored and check Admin Tools → Privacy requests daily. No automatic email delivery was configured.
6. Review intended/actual audience and visuals against COPPA criteria with qualified counsel if uncertain. An 18+ statement or this self-reported gate is not a substitute for that assessment. Do not market to children or add child-oriented features without reassessment. This release does not supply parental consent.
7. Test restore procedures: reapply retention and completed deletion decisions before reopening a restored database. Restrict access to backup copies; document provider expiry and any lawful retention exceptions.
8. Publish/deploy, then repeat the network/storage checks. A merged PR alone does not prove production is updated.

## Handling requests

- Verify ownership through the signed-in request or a proportionate email process. Never ask for private keys. For a parent/minor report, stop further account access/collection through the provider while reviewing; do not require the child to pass the adult gate or create an account.
- Export returns direct account rows; provider account data, shared event JSON, relevant logs and backups may need a supplemental manual response. Do not claim the download is a complete provider export.
- Review active events, creator ownership, public-chain records, custody/recovery and any necessary retention. Explain limitations and applicable response deadlines to the requester. Do not use indefinite "manual review" as a reason to leave requests unanswered.
- Complete appropriate Privy/provider deletion after securing the user's wallet/recovery wishes. The local script does not delete provider data. Record the provider result without retaining unnecessary personal information.
- Stop the API while doing local erasure (prevents in-flight requests recreating records). Set ARCADE_DB_PATH explicitly; run:

```sh
node --experimental-strip-types scripts/privacy-request.mjs list
node --experimental-strip-types scripts/privacy-request.mjs complete REQUEST_ID --provider-reviewed
```

- The script clears profile, identity link, progress, imports, operations, sessions, accepted results, wallet links/challenges, analytics and diagnostics. It anonymizes finalized nonfunded event entries and clears associated Coindle rapid state. It refuses creator-owned cabinets, active event participation or funded-event records: review those individually and retain/redact only what is necessary. Do not override the refusal blindly.
- Restart, verify no account records remain, deal with backups/provider records, then confirm the outcome to the requester. Keep public blockchain limitations explicit. Completed requests expire from the database after 30 days; maintain only the minimum separate evidence needed for actual obligations.

## Remaining limits

No live deployment/provider dashboard audit has been completed by this code change. Self-reported screening is not age assurance. No legal opinion is provided about COPPA, California privacy law, international users, tokens or contests. The code has no automatic inactive-account expiry; document the account-retention basis and revisit it as the service grows. The configured Render blueprint uses an ephemeral free-plan disk; verify production durability before relying on the queue. Production credentials, access logs and backups were not available for inspection.

References: FTC COPPA FAQ https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions ; FTC app security https://www.ftc.gov/business-guidance/resources/app-developers-start-security .

## Validation in this change

- Existing full automated suite: 166/166 passed after updating retired-analytics expectations.
- Additional erasure regression: passed (privacy suite now 3/3), including other-account preservation and a funded-record refusal.
- TypeScript check and production build passed.
- Browser smoke testing was attempted but could not run: the Chromium download returned an invalid/truncated archive. Mobile layout, real provider traffic, deployed cookies and live account flows remain release checks; do not mark them verified from this report.
