package app.habitgrove.android;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import java.util.TreeSet;

public final class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL = "grove-classic-reminders-v1";
    private static final String REMINDER = "app.habitgrove.android.REMINDER";
    private static final String TEST = "app.habitgrove.android.TEST";
    private static final long MAX_LATENESS = 15 * 60_000;
    private static final long[] VIBRATION = {0, 120, 95, 120, 160, 250};

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("habit-reminders", Context.MODE_PRIVATE);
    }

    static boolean enabled(Context context) {
        return preferences(context).getBoolean("enabled", false)
            && context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static void setEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean("enabled", enabled).apply();
        if (!enabled) context.getSystemService(AlarmManager.class).cancel(pending(context, TEST));
        reschedule(context);
    }

    static void saveDeadlines(Context context, JSONArray deadlines) {
        TreeSet<Long> unique = new TreeSet<>();
        long now = System.currentTimeMillis();
        for (int i = 0; i < deadlines.length(); i++) {
            long deadline = deadlines.optLong(i, 0);
            if (deadline < now - MAX_LATENESS || deadline > now + 31L * 86_400_000) continue;
            unique.add(deadline);
        }
        JSONArray schedule = new JSONArray();
        for (long deadline : unique) {
            if (schedule.length() == 8192) break;
            schedule.put(deadline);
        }
        preferences(context).edit().putString("deadlines", schedule.toString()).apply();
        reschedule(context);
    }

    private static JSONArray deadlines(Context context) {
        try {
            return new JSONArray(preferences(context).getString("deadlines", "[]"));
        } catch (JSONException exception) {
            return new JSONArray();
        }
    }

    static boolean exact(Context context) {
        return context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static PendingIntent pending(Context context, String action) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void schedule(Context context, PendingIntent pending, long when) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms.canScheduleExactAlarms()) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
                return;
            } catch (SecurityException ignored) {
                // Special access can be revoked between the check and scheduling.
            }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
    }

    static void reschedule(Context context) {
        PendingIntent reminder = pending(context, REMINDER);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.cancel(reminder);
        if (!enabled(context)) return;
        long now = System.currentTimeMillis();
        long delivered = preferences(context).getLong("deliveredThrough", 0);
        JSONArray next = deadlines(context);
        for (int i = 0; i < next.length(); i++) {
            long deadline = next.optLong(i, 0);
            if (deadline <= delivered || deadline < now - MAX_LATENESS) continue;
            schedule(context, reminder, Math.max(now + 250, deadline + 250));
            return;
        }
    }

    static void test(Context context) {
        schedule(context, pending(context, TEST), System.currentTimeMillis() + 10_000);
    }

    static void createChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL,
            "Habit reminders", NotificationManager.IMPORTANCE_HIGH);
        Uri tone = Uri.parse("android.resource://" + context.getPackageName() + "/raw/retro_alert");
        channel.setSound(tone, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.setVibrationPattern(VIBRATION);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private void show(Context context, boolean isTest) {
        createChannel(context);
        Intent open = new Intent(context, MainActivity.class).setAction(MainActivity.OPEN_CHECK_INS);
        PendingIntent link = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.notification)
            .setContentTitle(isTest ? "Habit Grove test" : "Habit Grove reminder")
            .setContentText(isTest ? "Your Android reminder sound and vibration are enabled."
                : "Open Habit Grove to view your check-ins.")
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(link)
            .setAutoCancel(true)
            .build();
        context.getSystemService(NotificationManager.class).notify(isTest ? 2 : 1, notification);
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (!enabled(context)) return;
        if (TEST.equals(intent.getAction())) {
            show(context, true);
            return;
        }
        if (REMINDER.equals(intent.getAction())) {
            long now = System.currentTimeMillis();
            long previous = preferences(context).getLong("deliveredThrough", 0);
            long delivered = previous;
            JSONArray next = deadlines(context);
            for (int i = 0; i < next.length(); i++) {
                long deadline = next.optLong(i, 0);
                if (deadline >= now - MAX_LATENESS && deadline < now)
                    delivered = Math.max(delivered, deadline);
            }
            if (delivered > previous) {
                preferences(context).edit().putLong("deliveredThrough", delivered).apply();
                show(context, false);
            }
        }
        reschedule(context);
    }
}
