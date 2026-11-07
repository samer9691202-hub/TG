Fayrouz 1.2.12 — AppMint package

Performance improvements in 1.2.12:
- Coalesces rapid vault changes into a single encrypted AES-GCM save, reducing repeated full-vault serialization and encryption while preserving encrypted storage.
- Flushes pending encrypted writes when the app moves to the background or is closed.
- Removes redundant full-vault encryption during startup migration and removes legacy plaintext only after the encrypted snapshot is committed successfully.
- Keeps decrypted photo/video object URLs cached while the app is open, avoiding repeated media decryption when refreshing the gallery or changing filters.
- Displays the media gallery immediately and decrypts media in small concurrent batches.
- Skips repeated legacy-media migration after it has completed successfully once.
- Updates the clock once per minute and immediately when the app returns to the foreground.
- Applies a lightweight visual fallback on low-resource devices while preserving the existing layout and color palette.


What's new in 1.2.10:
- Replaced the task-page 'Overdue outside today' statistic card with 'All tasks', showing the total number of saved tasks.

Package contents:
- index.html
- style.css
- app.js

What's new in 1.2.6:
- Added the ability to remove a task occurrence from a past calendar day directly in the task history. For weekly/monthly tasks, this excludes only the selected past date and preserves all other dates; a one-day task is deleted normally. Future and current-day occurrences cannot be removed through this history-only action.

Previous changes:
- Weekly and monthly task occurrences now have independent completion states for each calendar date. Completing a task on one day no longer marks the same task complete on every other day in its duration. The completion state is stored with the encrypted task record.
- Removed the task change-events panel, daily journal card, and undated-task panel from the task calendar view. Existing encrypted task history and journal data are preserved; only their visible sections were removed.
- Task change history now retains up to 10,000 events instead of 1,000.
- Quran wird goal, daily pages, completion state, last reading position, and reading history are migrated into the encrypted vault.
- Legacy plaintext Quran progress keys are removed only after the encrypted vault write succeeds.
- Personal content and encrypted media use the same AES-256-GCM vault key.
- Removed the built-in founder/master unlock path; only the user's password and recovery code can unwrap the vault key.
- Photo/video access now relies on the same unlocked vault instead of a separate plaintext-stored PIN verifier.
- Dashboard now summarizes today's tasks, notes, and Quran progress.
- The task page shows only tasks scheduled for today (including active week/month duration tasks).
- Opening the task calendar selects today; selecting any calendar date displays only the tasks scheduled for that day.

Security and migration notes:
- Existing encrypted vault data is retained.
- Existing Quran progress stored under legacy fayrouz_wird_* keys is migrated on the next successful unlock.
- Migration encrypts the imported data before removing legacy plaintext progress keys.
- Theme and accessibility preferences are also migrated into the encrypted vault.
- Password/recovery key-wrapping records remain outside the vault by design so they can unlock the encrypted data key.
- The vault and media remain local to this device; no cloud sync is included.

Import the ZIP into AppMint as an HTML project. This package does not include a native Android bridge. The resulting APK still requires testing on a physical Android device.
