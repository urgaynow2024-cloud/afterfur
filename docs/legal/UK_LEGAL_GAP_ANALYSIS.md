# AfterFur UK Legal Gap Analysis (Internal Draft)

Status: engineering/legal-readiness assessment, not legal advice or compliance certification.

## Official sources reviewed
- Online Safety Act 2023: https://www.legislation.gov.uk/ukpga/2023/50/contents
- Ofcom illegal content duties: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act
- Ofcom age assurance: https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance
- ICO privacy information: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
- ICO lawful basis: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/
- Consumer Rights Act 2015: https://www.legislation.gov.uk/ukpga/2015/15/contents
- Copyright, Designs and Patents Act 1988: https://www.legislation.gov.uk/ukpga/1988/48/contents

## Repository evidence
- User-generated posts, replies, profiles, media uploads, follows, search, notifications exist.
- Adult content features exist (`/after-dark`), but age assurance implementation is not verified.
- Reporting, moderation and appeals UI exists partially; backend workflows incomplete.
- Supabase auth/storage/database used; exact provider locations and retention unknown.
- Payments disabled.
- Terms acceptance tracking implemented locally (migrations 0016/0018).
- Policy pages render cleaned sections from public markdown.

## Key gaps
1. Adult-content age assurance: current implementation does not verify highly effective age assurance. Launch blocker if adult content is accessible to children.
2. Child safety: no verified age-verification provider or child-safety escalation workflow. Launch blocker.
3. Privacy notice completeness: operator identity, retention periods, providers, transfers and deletion behaviour not fully verified. Launch blocker.
4. Cookies/consent: actual cookie/local-storage usage not fully inventoried. Need verify before launch.
5. Reporting/moderation/appeals: UI exists but backend workflows incomplete. Launch blocker for safety duties.
6. Consumer/copyright terms: policies drafted but not legally reviewed. Solicitor review required.
7. Account deletion/data requests: implemented partially; backup/retention behaviour unverified.
8. Payments disabled: Prime policies correctly state disabled; no paid flows active.

## Recommended actions
- Complete age-assurance and child-safety implementation or restrict adult content until compliant.
- Verify actual data practices and providers before publishing retention/transfer claims.
- Complete reporting/moderation/appeals workflows.
- Obtain UK solicitor review before launch.
- Do not claim legal compliance.

This is not legal advice.
