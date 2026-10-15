# AIVOXFLOW — Phase One: Free Hosting and Free Domain

## Binding decision
Phase one uses free hosting and a free domain/subdomain. Build and test the project in that environment first. Only after testing and approval will the project move to paid hosting and a paid custom domain.

## Rules
1. Do not purchase, register, or activate paid hosting, domains, premium plugins, or API billing.
2. Inspect the exact free host first: supported PHP/WordPress versions, database, HTTPS, storage/bandwidth, outbound API access, cron/background jobs, backup/export, and terms.
3. Do not assume WordPress or autonomous background processing works on every free host. If the host cannot support the preferred stack, report the evidence and propose a compatible alternative before coding.
4. Keep all host/domain-specific values configurable. Never hardcode the temporary domain into application logic, canonical URLs, article content, or generated assets.
5. Use mock providers for repeatable AI workflow tests. Use real free-tier APIs only after checking current limits and terms. A paid chat subscription must not be assumed to include API credits.
6. If cron or outbound APIs are blocked, test with a manual queue runner or local worker and document the limitation. Do not claim unattended automation works until an actual scheduled job succeeds on the selected host.
7. Export files and database and verify restoration before considering phase one complete.
8. Do not deploy destructive changes or publish real content without approval.

## Acceptance checks
- Main site pages, navigation, search, article templates, and admin workflow work on the selected host.
- Desktop/mobile smoke tests completed.
- SEO metadata, canonical handling, sitemap, robots directives, and language URL strategy validated.
- Admin permissions, input validation, secret handling, duplicate-job prevention, bounded retries, budget limits, emergency stop, and draft-only publishing gate tested.
- AI workflow tested with mocks; real provider connectivity tested only if a permitted free integration exists.
- Scheduler tested on the actual host or documented as unsupported.
- Full backup exported and restore verified.
- Host limitations and migration plan documented.

## Later migration checklist
- Back up and verify database and uploaded files.
- Configure paid hosting and permanent domain.
- Apply platform-aware URL search-replace; avoid blind edits to serialized data.
- Configure HTTPS and redirects from the temporary URL where possible.
- Regenerate canonical URLs, hreflang, sitemap, robots directives, and social metadata.
- Update OAuth callbacks, webhooks, email settings, CORS/allowed origins, cookies, and integrations.
- Test login, admin actions, forms, article URLs, media, language switching, scheduled jobs, APIs, redirects, and 404s.
- Submit the sitemap to search tools when ready.
- Keep a rollback backup and switch traffic only after smoke tests pass.

## Limitation
Free hosting is suitable for development and validation but may restrict uptime, performance, storage, scheduling, and external API use. The project must remain portable and clearly distinguish real host-tested features from local simulations.
