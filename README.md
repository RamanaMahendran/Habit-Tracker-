# Habit Grove

An installable personal habit tracker with a daily planner, a chat-style check-in feed, and Excel activity reports. The live app uses a private, authenticated Cloudflare D1 database. GitHub contains application source only.

## Use the app

Open [Habit Grove](https://habit-grove-planner.ramanan-portfolio93.chatgpt.site) and sign in. On Android, use Chrome’s **Install app** or **Add to Home screen**. The home-screen app opens the same production deployment on every launch. Use the footer’s **App updates** action to check for a new release while the app is open.

Add a habit manually or describe it to the planning assistant. Supported schedules include one-time, daily, weekdays and weekly. Review the parsed details before saving. Dictation uses browser speech recognition when available, or the microphone on the device keyboard. Check-in times use Asia/Kolkata. In-app prompts appear while the tracker is active. For closed-app alerts, open a saved habit, download its calendar reminder, and import it into the device calendar. Reimport after a schedule edit and remove obsolete events from the calendar.

The journal records plan versions and check-ins without automatic expiry. Analytics can export all scheduled dates, habit definitions and changes in a three-sheet XLSX workbook. Archived habits retain earlier history.

## Development and releases

Install the dependencies with Node 22 and the checked-in lockfile. Use the scripts in package.json to generate migrations and build the app. Hosting configuration lives in .openai/hosting.json. Platform authentication provides the user identity in production. Apply the committed migrations to the local D1 binding for development.

Keep future changes in this repository. Update public/version.json for releases, verify the app, and publish the corresponding source to the existing Habit Grove site. The hosting deployment is a separate step. Never commit database exports or credentials.
