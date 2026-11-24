# GraceBooks Firebase Auth Migration

## Provisioning via GitHub Actions (recommended)

Repo → Actions → **Provision GraceBooks User** → Run workflow. Fill in the username
(without `@` for a `@gracebooks.local` account, or a full email), display name, and
role, then run. This uses the `FIREBASE_SERVICE_ACCOUNT` repository secret (the same
one the deploy workflow uses) to create the Firebase Auth user, the matching
`userProfiles/{uid}` document and the `role` custom claim (used by `storage.rules`) in
one step — see `scripts/provision-user.js`.

**Passwords never appear in the workflow.** This repository and its Actions logs are
public, so there is no password input and nothing secret is printed. A new account
(or an existing one run with `reset_password: yes`) gets a generated temporary
password stored in `pendingPasswords/{uid}`; the Treasurer sees it on the GraceBooks
dashboard under "New account passwords to hand out", gives it to the person
privately, then taps **Handed out** to erase it. The person changes it with the key
icon after signing in.

The manual Firebase Console steps below remain the fallback if you don't have
access to trigger the Actions workflow.

## Required Firebase Console Setup

Before deploying the new rules, create Firebase Authentication users using Email/Password.

Use usernames that are not easy to guess (not just the role name).

Then create a matching Firestore document for each account:

Collection: `userProfiles`

Document ID: the Firebase Auth `uid`

Example document:

```json
{
  "name": "Treasurer",
  "role": "Treasurer"
}
```

Valid current roles:

- `Treasurer`
- `Pastor`
- `Finance Chair`
- `Chairperson`
- `Deaconess`
- `Admin Assistant`
- `Auditor`
- `District`
- `Money Counter`
- `Membership Secretary`
- `Finance Committee`

## Rules Behavior

- Firestore reads/writes now require a signed-in Firebase Auth user.
- The app still requires the signed-in user to have a `userProfiles/{uid}` document so the UI can load the correct role.
- Client-side writes to `userProfiles` are denied, so role profiles should be created from the Firebase Console or an admin environment.
- Receipt uploads are limited to image/PDF files up to 5 MB.
- Storage rules read the role from the `role` custom claim; after adding a user by hand in the Console, run the deploy workflow (or `scripts/security-migration.js`) so the claim is set.

## Deployment Order

1. Enable Email/Password provider in Firebase Authentication.
2. Create Auth users.
3. Create `userProfiles/{uid}` documents.
4. Deploy hosting, Firestore rules, and Storage rules.
