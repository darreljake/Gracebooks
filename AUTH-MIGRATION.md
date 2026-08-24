# GraceBooks Firebase Auth Migration

## Provisioning via GitHub Actions (recommended)

Repo → Actions → **Provision GraceBooks User** → Run workflow. Fill in the username
(without `@` for a `@gracebooks.local` account, or a full email), display name, and
role, then run. This uses the `FIREBASE_SERVICE_ACCOUNT` repository secret (the same
one the deploy workflow uses) to create the Firebase Auth user and the matching
`userProfiles/{uid}` Firestore document in one step — see `scripts/provision-user.js`.
If the account already exists, only the `userProfiles` doc is updated (name/role);
the existing password is left untouched. For a brand-new account, a temporary
password is generated (or your own can be supplied via the optional `password`
input) and printed once in the workflow run's summary — sign in with it and use the
dashboard's "Change Password" button immediately to set a permanent one.

The manual Firebase Console steps below remain the fallback if you don't have
access to trigger the Actions workflow.

## Required Firebase Console Setup

Before deploying the new rules, create Firebase Authentication users using Email/Password.

Suggested accounts:

- `treasurer@gracebooks.local`
- `pastor@gracebooks.local`
- `auditor@gracebooks.local`
- `financechair@gracebooks.local`
- `chairperson@gracebooks.local`
- `district@gracebooks.local`
- `counter@gracebooks.local`
- `financecommittee@gracebooks.local`

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
- `Finance Committee`

## Rules Behavior

- Firestore reads/writes now require a signed-in Firebase Auth user.
- The app still requires the signed-in user to have a `userProfiles/{uid}` document so the UI can load the correct role.
- Client-side writes to `userProfiles` are denied, so role profiles should be created from the Firebase Console or an admin environment.
- Receipt uploads are limited to image/PDF files up to 5 MB.

## Deployment Order

1. Enable Email/Password provider in Firebase Authentication.
2. Create Auth users.
3. Create `userProfiles/{uid}` documents.
4. Deploy hosting, Firestore rules, and Storage rules.
