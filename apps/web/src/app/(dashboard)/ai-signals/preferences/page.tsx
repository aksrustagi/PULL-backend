"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";

// ============================================================================
// TYPES
// ============================================================================

interface SignalPreferences {
  emailAnalysisEnabled: boolean;
  socialAnalysisEnabled: boolean;
  marketAlertsEnabled: boolean;
  dailyInsightsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  minConfidenceThreshold: number;
  preferredUrgencyLevel: "all" | "medium_high" | "high_only";
  interests: string[];
  excludedMarkets: string[];
  timezone: string;
}

// ============================================================================
// TOGGLE COMPONENT
// ============================================================================

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${checked ? "bg-primary" : "bg-muted"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SignalPreferencesPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [preferences, setPreferences] = useState<SignalPreferences>({
    emailAnalysisEnabled: false,
    socialAnalysisEnabled: true,
    marketAlertsEnabled: true,
    dailyInsightsEnabled: true,
    pushNotificationsEnabled: true,
    minConfidenceThreshold: 50,
    preferredUrgencyLevel: "all",
    interests: ["technology", "crypto", "politics"],
    excludedMarkets: [],
    timezone: "America/New_York",
  });

  const [newInterest, setNewInterest] = useState("");

  const updatePreference = <K extends keyof SignalPreferences>(
    key: K,
    value: SignalPreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const addInterest = () => {
    if (newInterest.trim() && !preferences.interests.includes(newInterest.trim())) {
      updatePreference("interests", [...preferences.interests, newInterest.trim()]);
      setNewInterest("");
    }
  };

  const removeInterest = (interest: string) => {
    updatePreference(
      "interests",
      preferences.interests.filter((i) => i !== interest)
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Call API to save preferences
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Signal Preferences</h1>
            <p className="text-sm text-muted-foreground">
              Control how AI signals are generated and delivered
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Privacy & Data Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Privacy & Data Sources
            <Badge variant="outline" className="text-xs">
              Important
            </Badge>
          </CardTitle>
          <CardDescription>
            Control which data sources are used to generate signals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Analysis */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1">
              <p className="font-medium">Email Analysis</p>
              <p className="text-sm text-muted-foreground">
                Analyze connected email accounts for trading signals (travel
                bookings, financial alerts, event tickets)
              </p>
              {preferences.emailAnalysisEnabled && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  Your emails are analyzed locally and never shared with third
                  parties
                </p>
              )}
            </div>
            <Toggle
              checked={preferences.emailAnalysisEnabled}
              onChange={(checked) =>
                updatePreference("emailAnalysisEnabled", checked)
              }
            />
          </div>

          {/* Social Analysis */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1">
              <p className="font-medium">Social Sentiment Analysis</p>
              <p className="text-sm text-muted-foreground">
                Analyze chat room discussions for market sentiment signals
              </p>
            </div>
            <Toggle
              checked={preferences.socialAnalysisEnabled}
              onChange={(checked) =>
                updatePreference("socialAnalysisEnabled", checked)
              }
            />
          </div>

          {/* Market Alerts */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1">
              <p className="font-medium">Market Anomaly Detection</p>
              <p className="text-sm text-muted-foreground">
                Detect volume spikes, price movements, and order book imbalances
              </p>
            </div>
            <Toggle
              checked={preferences.marketAlertsEnabled}
              onChange={(checked) =>
                updatePreference("marketAlertsEnabled", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            How and when you want to receive signal notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Daily Insights */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1">
              <p className="font-medium">Daily Morning Briefing</p>
              <p className="text-sm text-muted-foreground">
                Receive a personalized AI briefing every morning at 6am in your
                timezone
              </p>
            </div>
            <Toggle
              checked={preferences.dailyInsightsEnabled}
              onChange={(checked) =>
                updatePreference("dailyInsightsEnabled", checked)
              }
            />
          </div>

          {/* Push Notifications */}
          <div className="flex items-start justify-between space-x-4">
            <div className="flex-1">
              <p className="font-medium">Push Notifications</p>
              <p className="text-sm text-muted-foreground">
                Get instant notifications for high-urgency signals
              </p>
            </div>
            <Toggle
              checked={preferences.pushNotificationsEnabled}
              onChange={(checked) =>
                updatePreference("pushNotificationsEnabled", checked)
              }
            />
          </div>

          {/* Urgency Level */}
          <div className="space-y-2">
            <label className="font-medium">Notification Urgency Level</label>
            <p className="text-sm text-muted-foreground">
              Only notify for signals at or above this urgency level
            </p>
            <select
              value={preferences.preferredUrgencyLevel}
              onChange={(e) =>
                updatePreference(
                  "preferredUrgencyLevel",
                  e.target.value as SignalPreferences["preferredUrgencyLevel"]
                )
              }
              className="w-full border rounded px-3 py-2 bg-background"
            >
              <option value="all">All signals</option>
              <option value="medium_high">Medium & High urgency only</option>
              <option value="high_only">High urgency only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Signal Filtering */}
      <Card>
        <CardHeader>
          <CardTitle>Signal Quality</CardTitle>
          <CardDescription>
            Filter signals by confidence level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Confidence Threshold */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <label className="font-medium">Minimum Confidence Threshold</label>
              <span className="text-sm text-muted-foreground">
                {preferences.minConfidenceThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={preferences.minConfidenceThreshold}
              onChange={(e) =>
                updatePreference("minConfidenceThreshold", parseInt(e.target.value))
              }
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Only show signals with confidence above this threshold. Higher
              values mean fewer but more reliable signals.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader>
          <CardTitle>Your Interests</CardTitle>
          <CardDescription>
            Help us personalize signals by adding your areas of interest
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current interests */}
          <div className="flex flex-wrap gap-2">
            {preferences.interests.map((interest) => (
              <Badge
                key={interest}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                {interest}
                <button
                  onClick={() => removeInterest(interest)}
                  className="ml-1 hover:text-destructive"
                >
                  x
                </button>
              </Badge>
            ))}
            {preferences.interests.length === 0 && (
              <p className="text-sm text-muted-foreground">No interests added yet</p>
            )}
          </div>

          {/* Add new interest */}
          <div className="flex space-x-2">
            <input
              type="text"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addInterest()}
              placeholder="Add an interest..."
              className="flex-1 border rounded px-3 py-2 bg-background"
            />
            <Button onClick={addInterest} variant="outline">
              Add
            </Button>
          </div>

          {/* Suggested interests */}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {["sports", "finance", "entertainment", "weather", "science"]
                .filter((s) => !preferences.interests.includes(s))
                .map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary"
                    onClick={() =>
                      updatePreference("interests", [
                        ...preferences.interests,
                        suggestion,
                      ])
                    }
                  >
                    + {suggestion}
                  </Badge>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle>Timezone</CardTitle>
          <CardDescription>
            Used for daily briefings and time-sensitive signals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={preferences.timezone}
            onChange={(e) => updatePreference("timezone", e.target.value)}
            className="w-full border rounded px-3 py-2 bg-background"
          >
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="UTC">UTC</option>
            <option value="Europe/London">London (GMT/BST)</option>
            <option value="Europe/Paris">Central European (CET)</option>
            <option value="Asia/Tokyo">Japan (JST)</option>
            <option value="Asia/Singapore">Singapore (SGT)</option>
          </select>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Data Management</CardTitle>
          <CardDescription>
            Manage your signal data and privacy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full">
            Export My Signal Data
          </Button>
          <Button variant="outline" className="w-full text-destructive">
            Delete All My Signals
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Deleting signals will remove all your signal history and preferences.
            This action cannot be undone.
          </p>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" asChild>
          <Link href="/ai-signals">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
