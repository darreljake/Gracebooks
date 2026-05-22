# GraceBooks Firebase Auth Migration

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
