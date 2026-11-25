# Habit Grove

An installable personal habit tracker with a daily planner, a chat-style check-in feed, and Excel activity reports. The live app uses a private, authenticated Cloudflare D1 database. GitHub contains application source only.

## Use the app

Open [Habit Grove](https://habit-grove-planner.ramanan-portfolio93.chatgpt.site) to start immediately. The app creates a private journal key on your device. Use **Journal access → Save recovery code** to keep access across devices or browser resets. Existing users can import earlier habits under **Journal access**. On Android, use Chrome’s **Install app** or **Add to Home screen**. The home-screen app opens the same production deployment on every launch. Use the footer’s **App updates** action to check for a new release while the app is open.

Add a habit manually or describe it to the planning assistant. Supported schedules include one-time, daily, weekdays and weekly. Enable **Repeat within the day** to set an hourly interval, a first check-in, and an end time or number of check-ins. Each time has its own status and calendar reminder. For example, say “Drink water every two hours from 8 am to 6 pm.” Review the parsed details before saving. Dictation uses browser speech recognition when available, or the microphone on the device keyboard. Check-in times use Asia/Kolkata. For a schedule based on what happened, choose **From last actual check-in** with a daily count. Mark the next entry done and confirm the actual time (IST). Later estimates move, while only the next pending entry is eligible to ring. The first reminder restarts the following day subject to the interval since the preceding day’s last completion.

In Check-in chat, **Enable sound alerts** unlocks the in-app chime and registers this device for optional Web Push. Background delivery checks the private journal on the server using a GitHub Actions schedule every five minutes. GitHub or the phone can delay delivery. Browser and Android notification settings control background sound. Notification text is generic. In-app prompts appear while the tracker is active. For fixed-time calendar alerts, open a saved habit, download its calendar reminder, and import it into the device calendar. Reimport after a schedule edit and remove obsolete events from the calendar.

Check-in chat asks for a status only after the scheduled time passes. Forecasts for later rolling check-ins remain in Planner. The planning assistant answers schedule and progress questions inline and can propose a routine or reschedule a named habit. Use the review button to apply a suggested change.

The Knowledge Book lists categories, subcategories, examples and active habits. New habits use the task name first and the first reminder time as a fallback. You can select a category manually. Analytics includes a daily timeline, time-of-day totals and actual check-in times.

The journal records plan versions and check-ins without automatic expiry. Analytics can export all scheduled dates, habit definitions and changes in a three-sheet XLSX workbook. Archived habits retain earlier history.

## Development and releases

Install the dependencies with Node 22 and the checked-in lockfile. Use the scripts in package.json to generate migrations and build the app. Hosting configuration lives in .openai/hosting.json. Journal requests use a random 256-bit device-held key. Only its digest identifies records in the database. Legacy import also requires the original platform identity. Apply the committed migrations to the local D1 binding for development.

Keep future changes in this repository. Update public/version.json for releases, verify the app, and publish the corresponding source to the existing Habit Grove site. The hosting deployment is a separate step. Never commit database exports or credentials.

The reminder worker uses a secret P-256 private JWK in REMINDER_VAPID_JWK. The notification endpoint validates a short-lived GitHub OIDC token for the dedicated reminder workflow on main. The scheduler receives no journal contents. Keep the application-server key stable for existing subscriptions.
