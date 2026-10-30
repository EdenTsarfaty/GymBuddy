# Google Health integration — research notes

Researched 2026-10-24. **Not prioritized.** The plan is to build in-app cardio duration first (timer, popup, saved start + duration), and sync to Google Health later if it turns out to work. Nothing here is built.

Everything below is from Google's own docs unless marked otherwise. "Not documented" means I read the page and it doesn't say; it does not mean "unsupported". Re-verify before relying on any of it, since the API is new and its docs change often (release notes show changes through October 2026).

## What we'd want

- **Write** a finished cardio session (type, start, duration, pauses) to the user's Google Health account.
- **Maybe later, read** weight and height.
- Offline-first in-app: the record is saved locally and sent when online.

## Writing an exercise session

- Supported in Google's docs. Exercise create/update/delete launched 2026-03-24 ([release notes](https://developers.google.com/health/release-notes)).
- Endpoint: `POST https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints`.
- Scope: `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly` (renamed from the old activity scope on 2026-05-26). Reading needs the separate `.readonly` scope ([workouts guide](https://developers.google.com/health/data-types/workouts)).
- Exercise fields ([reference](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints)):
  - `interval` — start and end, with UTC offsets (required).
  - `exerciseType` — enum (required). Values we need exist: `SWIMMING`, `RUNNING`, `BIKING`, `ROCK_CLIMBING` / `INDOOR_CLIMBING`, `ROWING` / `ROWING_MACHINE`, `HIKING`. About 170 values in total ([RPC reference](https://developers.google.com/health/reference/rpc/google.devicesandservices.health.v4)). One REST excerpt omitted some of these, so confirm the exact names against the full enum.
  - `displayName` — required, but ignored unless the type is `OTHER`; for any other type Google generates the name.
  - `activeDuration` — time spent active, excluding pauses.
  - `exerciseEvents[]` — `START`, `STOP`, `PAUSE`, `RESUME`, `AUTO_PAUSE`, `AUTO_RESUME`. This is how pauses are recorded, so it matches a play/pause button.
  - `metricsSummary` — **listed as required.** Calories, distance, steps, heart rate and so on. We won't have these numbers. Unknown whether an empty or zeroed summary is accepted.
  - `exerciseMetadata` — `hasGps`, and `poolLengthMillimeters` for swimming.
- `create` returns an `Operation`, not the saved data point. Delete takes the data point's resource name (`users/{user}/dataTypes/{type}/dataPoints/{id}`, max 10,000 per call). Not documented: whether exercise points have client-supplied or returned names, and whether only the creating app can delete.
- Only the app that created a record can modify it ([data management](https://developers.google.com/health/data-management)).

**Conflicting source:** [Terra's teardown](https://tryterra.co/blog/everything-you-need-to-know-about-google-health-new-api) says write methods appear in the discovery doc "but aren't yet granted to third-party clients" and that every `googlehealth.*` scope is Restricted (needing Google's security review). I couldn't date that article. Google's own pages show a write scope and a worked example, and their setup page describes an unverified-app path (below). Treat writes as supported but unproven until a real call succeeds.

## Duplicates

- `list` returns every stored record, duplicates included, with the source on each point.
- `reconcile` collapses overlapping records from different devices into one winner and drops the rest. The winner keeps its original start and end; intervals are never merged ([data management](https://developers.google.com/health/data-management), [reconcile reference](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile)).
- `reconcile` takes `dataSourceFamily`: `all-sources` (default), `google-wearables` (Google/Fitbit trackers, excludes manual entries), `google-sources` (first-party Google data including manual entries and Health Connect), `self-sources` (only data written by the calling OAuth client).
- **Not documented:** how the winner is chosen, any priority between watch / manual / third-party app, and whether a session our app writes counts as a duplicate of a watch-recorded session for the same workout.
- An app holding only a write scope can read back only its own data (`self-sources`, added 2026-10-14). To see an overlapping watch session before writing, we'd also need the `.readonly` scope.
- Fitbit devices don't talk to third-party apps directly. Data reaches the API only after the tracker syncs to the Google Health app, so a watch session may show up some time after the workout.

Practical consequence: if the user wears a watch during a cardio session, expect a possible duplicate until proven otherwise.

## Signing in (OAuth)

From the [setup page](https://developers.google.com/health/setup) and the [redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server):

- New OAuth clients start in "Testing" and are unverified, capped at 100 users in testing and in production. More than 100 users needs a third-party security review.
- In Testing, refresh tokens expire after 7 days. Publishing the consent screen removes that (tokens then last until revoked or unused for about six months).
- Each user's email must be added to the Test users list while in Testing.
- Each user must first link their Google account in the Google Health mobile app. After token exchange, call `users.getIdentity`; `ACCOUNT_NOT_LINKED` means it isn't linked.
- Existing Fitbit tokens don't carry over. Users re-consent. A user shouldn't have both legacy Fitbit and Google Health connections active.
- The legacy Fitbit Web API is being turned off (Google's migration page gives 2026-11-02). We would build on the Google Health API only.
- **Redirect URI rules:** HTTPS required (localhost exempt, including `127.0.0.1`); host cannot be a raw IP; the top-level domain must be on the public suffix list; no wildcards.
- **Our situation:** the app runs on Tailscale. A raw `100.x` address is not allowed. Not verified: whether a Tailscale HTTPS name (`*.ts.net`) counts as being on the public suffix list. An untested workaround: do the one-time consent from the computer running the backend, using a localhost redirect, and store the tokens server-side.
- Not confirmed: whether the `googlehealth.*` scopes count as sensitive or restricted (Google's page doesn't classify them; Terra says restricted).

## Weight and height

- Weight: list, get, reconcile, rollup, create, update, batchDelete. Height: list, get, reconcile, create, update, batchDelete ([data types](https://developers.google.com/health/data-types)). Both under `health_metrics_and_measurements` (`.readonly` / `.writeonly`).

## Not yet established

1. Whether a real third-party write succeeds at all.
2. Whether an empty or zero `metricsSummary` is accepted.
3. How a written session interacts with a watch-recorded one (list vs reconcile, which wins, how Google's own app shows it).
4. Whether we can learn the written record's name, and whether delete works for exercises.
5. Whether the same payload sent twice creates two records (no idempotency documented).
6. What the source field (`recordingMethod`, `application`, `platform`) holds. Not read.
7. Whether `*.ts.net` redirect URIs are accepted.
8. Rate limits (not documented).

## Test checklist (throwaway, outside the app)

Use Google's [OAuth 2.0 Playground codelab](https://developers.google.com/health/codelabs/make-your-first-api-call-using-oauth2-playground) or plain HTTP calls so no app code is needed.

**Setup**
1. Create a Google Cloud project and enable the Google Health API.
2. Create a Web-server OAuth client; add yourself as a test user.
3. Request both scopes: `googlehealth.activity_and_fitness.writeonly` and `.readonly`.
4. Link your Google account in the Google Health app on the phone.
5. Note the day you did consent (testing tokens die after 7 days).

**Write behavior**
1. Write one `SWIMMING` session with start, end, `activeDuration`, and **no** `metricsSummary`. Record the exact response.
2. If rejected, retry with an empty `{}` and then with zeros. Note which works.
3. Check the response: do we get a data point name? If not, find it with a `list` using `self-sources`.
4. `batchDelete` that name. Confirm it's gone in `list` and in the Google Health app.
5. Send the identical payload twice. Count the records.
6. Try each of our six types and note which enum names are accepted. Try a custom `displayName` on a non-`OTHER` type to confirm it's ignored.
7. Write a session with `PAUSE` / `RESUME` events and check `activeDuration` against the wall-clock span.

**Duplicates (the important one)**
1. With a watch (or a manual log in the Google Health app) record a workout for a known interval.
2. Write an overlapping session through the API, same interval.
3. Compare, for that day: `list` with `all-sources`, `reconcile` with `all-sources`, with `google-sources`, and with `self-sources`.
4. Look at how Google's own app shows it: one entry or two, and which.
5. Repeat with the API session offset by a few minutes, in case overlap tolerance matters.

**Sign-in**
1. Try a localhost redirect with the flow run on the backend's machine.
2. Try a Tailscale HTTPS name as a redirect, if available; note whether Google accepts it.
3. After a week in Testing, confirm the refresh token died; then publish the consent screen and confirm it stops expiring.

**Read**
1. Read weight and height (needs `health_metrics_and_measurements.readonly`).

## Design implications for the in-app version

So the later sync needs no data migration, save per cardio session:

- start as an absolute timestamp plus the UTC offset (not a bare local time);
- active duration in seconds;
- pause and resume timestamps, if pausing is built;
- the cardio type (our id, mapped to Google's enum at send time);
- a sync status and, once sent, the returned record name (needed to delete it on revert).

Keep planned duration (the target) separate from the actual recorded duration.
