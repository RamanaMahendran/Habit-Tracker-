package app.habitgrove.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

public final class HealthPrivacyActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        TextView policy = new TextView(this);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        policy.setPadding(padding, padding * 2, padding, padding);
        policy.setTextSize(16);
        policy.setText("Habit Grove and Health Connect\n\n"
            + "When you connect Health Connect, Habit Grove reads walking workouts, "
            + "distance and active calories to display your selected period in Analytics. "
            + "Health Connect history access extends the available dates. "
            + "These measurements stay on your device and are never uploaded to your journal. "
            + "You can revoke access in Health Connect under App permissions.");
        setContentView(policy);
    }
}
