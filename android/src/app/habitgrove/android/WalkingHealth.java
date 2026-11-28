package app.habitgrove.android;

import android.content.Context;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.DataOrigin;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Length;
import android.os.OutcomeReceiver;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

final class WalkingHealth {
    static final String HISTORY = "android.permission.health.READ_HEALTH_DATA_HISTORY";
    static final String[] BASIC = {
        "android.permission.health.READ_EXERCISE",
        "android.permission.health.READ_DISTANCE",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
    };
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    static boolean hasAccess(Context context) {
        for (String permission : BASIC)
            if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED)
                return false;
        return true;
    }

    static JSONObject read(Context context, String from, String through) throws Exception {
        LocalDate requestedStart = LocalDate.parse(from);
        LocalDate endDay = LocalDate.parse(through);
        long span = ChronoUnit.DAYS.between(requestedStart, endDay);
        if (span < 0 || span > 366) throw new IllegalArgumentException("Invalid walking date range.");
        boolean history = context.checkSelfPermission(HISTORY) == PackageManager.PERMISSION_GRANTED;
        // The default window is measured from the first permission grant. A recent
        // 29-day local-date window is safe even for an installation granted access today.
        LocalDate recent = LocalDate.now(IST).minusDays(29);
        boolean limited = !history && requestedStart.isBefore(recent);
        LocalDate startDay = limited ? recent : requestedStart;
        JSONArray result = new JSONArray();
        if (!startDay.isAfter(endDay)) {
            HealthConnectManager manager = context.getSystemService(HealthConnectManager.class);
            if (manager == null) throw new IllegalStateException("Health Connect is unavailable.");
            Instant start = startDay.atStartOfDay(IST).toInstant();
            Instant end = endDay.plusDays(1).atStartOfDay(IST).toInstant();
            Instant lookupStart = history ? start.minus(1, ChronoUnit.DAYS) : start;
            Map<LocalDate, List<Window>> days = walkingWindows(manager, lookupStart, start, end);
            for (Map.Entry<LocalDate, List<Window>> day : days.entrySet())
                result.put(dailyTotal(manager, day.getKey(), day.getValue()));
        }
        return new JSONObject().put("access", "connected").put("days", result)
            .put("historyLimited", limited);
    }

    private static Map<LocalDate, List<Window>> walkingWindows(
        HealthConnectManager manager, Instant lookupStart, Instant start, Instant end
    ) throws Exception {
        Map<LocalDate, List<Window>> days = new TreeMap<>();
        TimeInstantRangeFilter range = filter(lookupStart, end);
        long page = -1;
        do {
            ReadRecordsRequestUsingFilters.Builder<ExerciseSessionRecord> builder =
                new ReadRecordsRequestUsingFilters.Builder<>(ExerciseSessionRecord.class)
                    .setTimeRangeFilter(range);
            if (page != -1) builder.setPageToken(page);
            ReadRecordsResponse<ExerciseSessionRecord> response = await(
                callback -> manager.readRecords(builder.build(), Runnable::run, callback));
            for (ExerciseSessionRecord exercise : response.getRecords()) {
                if (exercise.getExerciseType() != ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING)
                    continue;
                Instant a = later(start, exercise.getStartTime());
                Instant b = earlier(end, exercise.getEndTime());
                while (a.isBefore(b)) {
                    LocalDate day = a.atZone(IST).toLocalDate();
                    Instant next = earlier(day.plusDays(1).atStartOfDay(IST).toInstant(), b);
                    days.computeIfAbsent(day, key -> new ArrayList<>())
                        .add(new Window(a, next, exercise.getMetadata().getDataOrigin()));
                    a = next;
                }
            }
            page = response.getNextPageToken();
        } while (page != -1);
        return days;
    }

    private static JSONObject dailyTotal(
        HealthConnectManager manager, LocalDate date, List<Window> windows
    ) throws Exception {
        // Merge overlapping workout time before querying so a walk logged by two
        // fitness apps cannot count the same time twice. Health Connect applies
        // its Activity source priorities inside each aggregate.
        windows.sort(Comparator.comparing(window -> window.start));
        List<Window> merged = new ArrayList<>();
        for (Window window : windows) {
            Window previous = merged.isEmpty() ? null : merged.get(merged.size() - 1);
            if (previous != null && window.start.isBefore(previous.end)) {
                previous.end = later(previous.end, window.end);
                previous.sources.addAll(window.sources);
            } else {
                merged.add(window);
            }
        }
        Double meters = null;
        Double kcal = null;
        for (Window window : merged) {
            TimeInstantRangeFilter range = filter(window.start, window.end);
            Length distance = aggregate(manager, range, window.sources, DistanceRecord.DISTANCE_TOTAL);
            Energy energy = aggregate(manager, range, window.sources, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
            if (distance != null) meters = (meters == null ? 0 : meters) + distance.getInMeters();
            if (energy != null) kcal = (kcal == null ? 0 : kcal) + energy.getInCalories() / 1000.0;
        }
        return new JSONObject().put("date", date.toString())
            .put("meters", meters == null ? JSONObject.NULL : meters)
            .put("kcal", kcal == null ? JSONObject.NULL : kcal);
    }

    private static <T> T aggregate(
        HealthConnectManager manager, TimeInstantRangeFilter filter,
        Set<DataOrigin> sources, android.health.connect.datatypes.AggregationType<T> metric
    ) throws Exception {
        AggregateRecordsRequest.Builder<T> builder = new AggregateRecordsRequest.Builder<T>(filter)
            .addAggregationType(metric);
        for (DataOrigin source : sources) builder.addDataOriginsFilter(source);
        AggregateRecordsResponse<T> response = await(
            callback -> manager.aggregate(builder.build(), Runnable::run, callback));
        return response.get(metric);
    }

    private static <T> T await(Consumer<OutcomeReceiver<T, HealthConnectException>> action)
        throws Exception {
        CompletableFuture<T> result = new CompletableFuture<>();
        action.accept(new OutcomeReceiver<>() {
            @Override public void onResult(T value) { result.complete(value); }
            @Override public void onError(HealthConnectException error) {
                result.completeExceptionally(error);
            }
        });
        return result.get(10, TimeUnit.SECONDS);
    }

    private static TimeInstantRangeFilter filter(Instant start, Instant end) {
        return new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(end).build();
    }
    private static Instant later(Instant a, Instant b) { return a.isAfter(b) ? a : b; }
    private static Instant earlier(Instant a, Instant b) { return a.isBefore(b) ? a : b; }

    private static final class Window {
        final Instant start;
        Instant end;
        final Set<DataOrigin> sources = new HashSet<>();
        Window(Instant start, Instant end, DataOrigin source) {
            this.start = start;
            this.end = end;
            sources.add(source);
        }
    }
}
