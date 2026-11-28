# Habit Grove

An installable personal habit tracker with a daily planner, a chat-style check-in feed, and Excel activity reports. The live app uses a private, authenticated Cloudflare D1 database. GitHub contains application source only.

## Use the app

Open [Habit Grove](https://habit-grove-planner.ramanan-portfolio93.chatgpt.site) to start immediately. The app creates a private journal key on your device. Use **Journal access → Save recovery code** to keep access across devices or browser resets. Existing users can import earlier habits under **Journal access**. On Android, use Chrome’s **Install app** or **Add to Home screen**. The home-screen app opens the same production deployment on every launch. Use **App updates** in the header to check for a new release while the app is open.

Add a habit manually or describe it to the planning assistant. Supported schedules include one-time, daily, weekdays and weekly. Enable **Repeat within the day** to set an hourly interval, a first check-in, and an end time or number of check-ins. Each time has its own status and calendar reminder. For example, say “Drink water every two hours from 8 am to 6 pm.” Review the parsed details before saving. Dictation uses browser speech recognition when available, or the microphone on the device keyboard. Check-in times use Asia/Kolkata. For a schedule based on what happened, choose **From last actual check-in** with a daily count. Mark the next entry done and confirm the actual time (IST). Later estimates move, while only the next pending entry is eligible to ring. The first reminder restarts the following day subject to the interval since the preceding day’s last completion.

In Planner’s **Check-ins** panel, **Enable sound alerts** unlocks the in-app chime and registers this device for optional Web Push. Background delivery checks the private journal on the server using a GitHub Actions schedule every five minutes. GitHub or the phone can delay delivery. Browser and Android notification settings control background sound. Notification text is generic. In-app prompts appear while the tracker is active. For fixed-time calendar alerts, open a saved habit, download its calendar reminder, and import it into the device calendar. Reimport after a schedule edit and remove obsolete events from the calendar.

The Planner’s check-in panel asks for a status only after the scheduled time passes. Forecasts for later rolling check-ins remain in Planner. The planning assistant answers schedule and progress questions inline and can propose a routine or reschedule a named habit. Use the review button to apply a suggested change.

The Knowledge Book lists categories, subcategories, examples and active habits. New habits use the task name first and the first reminder time as a fallback. You can select a category manually. Analytics includes a daily timeline, Monday–Sunday weeks, calendar months, and twelve-month trends ending in the chosen month. Current periods run through today in IST. Select a trend row to open that month or day. The activity log follows the dashboard dates by default. Select Work, Personal, or Wellbeing to focus the dashboard and activity log. Work uses the Work category. Wellbeing includes Health, Wellness, and Mindfulness. Personal includes Personal, Learning, and Routines.

The journal records plan versions and check-ins without automatic expiry. Analytics can export all scheduled dates, habit definitions and changes in a three-sheet XLSX workbook. Archived habits retain earlier history.

## Android and walking performance

In **Analytics**, select a habit and select **Day**, **1 month**, or another period. The progress dashboard and matching activity log show check-ins for that habit.

Download the Android app from **App updates** on Android 14 or newer. Use **Journal access** with the recovery code from your existing app to open the same journal. Select a walking habit in Analytics, then tap **Connect Health Connect**. Distance and active calories come from recorded walking workouts and their associated measurements. Your fitness app needs to sync those records to Health Connect. Activity measurements stay on the phone and are separate from the cloud journal.

In **Check-ins → Reminder sound**, enable Android alerts and allow **Alarms & reminders** for on-time delivery. Android uses the last synced schedule, updates it after habit changes while the app is open, and plays the bundled retro tone with vibration. The app stores up to 30 days of upcoming times on the phone. Reopen the Android app to sync changes made on another device.

## Development and releases

Install the dependencies with Node 22 and the checked-in lockfile. Use the scripts in package.json to generate migrations and build the app. Hosting configuration lives in .openai/hosting.json. Journal requests use a random 256-bit device-held key. Only its digest identifies records in the database. Legacy import also requires the original platform identity. Apply the committed migrations to the local D1 binding for development.

Keep future changes in this repository. Update public/version.json for releases, verify the app, and publish the corresponding source to the existing Habit Grove site. The hosting deployment is a separate step. Never commit database exports or credentials.

The reminder worker uses a secret P-256 private JWK in REMINDER_VAPID_JWK. The notification endpoint validates a short-lived GitHub OIDC token for the dedicated reminder workflow on main. The scheduler receives no journal contents. Keep the application-server key stable for existing subscriptions.

Rebuild the Android APK only when native code changes. With JDK 17 or newer, Node.js, Android SDK Platform 35, and Build Tools 35.0.0, set `ANDROID_HOME`, `GROVE_ANDROID_KEYSTORE` and `GROVE_ANDROID_KEY_PASSWORD` locally. Run `bash android/build-apk.sh public/android/habit-grove.apk` using the existing release signing key. Increment the Android manifest version code for native updates and keep the signing key outside Git. The Android app loads the live website and receives web updates when it opens.
