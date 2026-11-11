import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Crosshair,
  Droplets,
  Info,
  Leaf,
  MapPin,
  Ruler,
  ShieldCheck,
  Sprout,
  Timer,
  Wand2,
} from "lucide-react";

import { ApiError } from "../api/client";
import { createProfile, updateProfile } from "../api/profiles";
import { LawnSizeIllustration } from "../components/greenflow/LawnSizeIllustration";
import { SelectOptionCard } from "../components/greenflow/SelectOptionCard";
import {
  areaLabel,
  FREQUENCY_OPTIONS,
  GRASS_OPTIONS,
  LAWN_SIZE_PRESETS,
  presetValueForUnit,
  SOIL_OPTIONS,
  SPRINKLER_OPTIONS,
  SQFT_PER_SQM,
  WATERING_DURATION_PRESETS,
  type LawnSizePreset,
} from "../data/lawnSetupOptions";
import {
  loadLawnProfile,
  saveLawnProfile,
} from "../lib/lawnProfileStorage";
import { addDays, toIsoDate } from "../lib/weatherFormat";
import {
  EVENTS_PER_WEEK,
  type GrassTypeId,
  type LawnProfile,
  type LawnSizeUnit,
  type LocationSource,
  type SoilTypeId,
  type SprinklerTypeId,
  type WateringFrequencyId,
} from "../types/lawnProfile";
import type { Screen } from "../types/screen";

import "./LawnSetupPage.css";

interface LawnSetupPageProps {
  onNavigate: (screen: Screen) => void;
}

type FieldKey =
  | "location"
  | "lawnSize"
  | "grassType"
  | "soilType"
  | "sprinklerType"
  | "precipitationRate"
  | "duration"
  | "frequency"
  | "eventsPerWeek"
  | "lastWateredDate"
  | "lastWateredMinutes";

type FormErrors = Partial<Record<FieldKey, string>>;
type SaveState = "idle" | "saving" | "saved" | "error";
type GeoState = "idle" | "loading";

const FIELD_ORDER: FieldKey[] = [
  "location",
  "lawnSize",
  "grassType",
  "soilType",
  "sprinklerType",
  "precipitationRate",
  "duration",
  "frequency",
  "eventsPerWeek",
  "lastWateredDate",
  "lastWateredMinutes",
];

const FOCUS_IDS: Record<FieldKey, string> = {
  location: "location-label",
  lawnSize: "lawn-area-input",
  grassType: "grass-bermuda",
  soilType: "soil-sandy",
  sprinklerType: "sprinkler-fixed-spray",
  precipitationRate: "precipitation-rate",
  duration: "watering-duration",
  frequency: "frequency-daily",
  eventsPerWeek: "events-per-week",
  lastWateredDate: "last-watered-date",
  lastWateredMinutes: "last-watered-minutes",
};

const DEMO_LOCATION = {
  label: "Demo location (Austin, TX)",
  latitude: 30.2672,
  longitude: -97.7431,
};

function parseNumericInput(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function LawnSetupPage({ onNavigate }: LawnSetupPageProps) {
  const [initialProfile] = useState<LawnProfile | null>(() =>
    loadLawnProfile(),
  );
  const [profileId, setProfileId] = useState<string | null>(
    () => initialProfile?.backendId ?? null,
  );

  const [locationLabel, setLocationLabel] = useState(
    () => initialProfile?.location.label ?? "",
  );
  const [latitudeText, setLatitudeText] = useState(() =>
    initialProfile ? String(initialProfile.location.latitude) : "",
  );
  const [longitudeText, setLongitudeText] = useState(() =>
    initialProfile ? String(initialProfile.location.longitude) : "",
  );
  const [locationSource, setLocationSource] = useState<LocationSource>(
    () => initialProfile?.location.source ?? "manual",
  );
  const [geoState, setGeoState] = useState<GeoState>("idle");

  const [areaValue, setAreaValue] = useState(() =>
    initialProfile ? String(initialProfile.lawnArea.value) : "",
  );
  const [areaUnit, setAreaUnit] = useState<LawnSizeUnit>(
    () => initialProfile?.lawnArea.unit ?? "sqft",
  );
  const [grassType, setGrassType] = useState<GrassTypeId | null>(
    () => initialProfile?.grassType ?? null,
  );
  const [soilType, setSoilType] = useState<SoilTypeId | null>(
    () => initialProfile?.soilType ?? null,
  );
  const [sprinklerType, setSprinklerType] =
    useState<SprinklerTypeId | null>(
      () => initialProfile?.sprinklerType ?? null,
    );

  const [precipitationRateText, setPrecipitationRateText] = useState(() =>
    initialProfile
      ? String(initialProfile.precipitationRateMmPerHour)
      : "",
  );
  const [duration, setDuration] = useState(() =>
    initialProfile ? String(initialProfile.wateringDurationMinutes) : "",
  );
  const [frequency, setFrequency] =
    useState<WateringFrequencyId | null>(
      () => initialProfile?.wateringFrequency ?? null,
    );
  const [eventsText, setEventsText] = useState(() =>
    initialProfile?.wateringFrequency === "custom"
      ? String(initialProfile.eventsPerWeek)
      : "",
  );
  const [lastWateredDate, setLastWateredDate] = useState(
    () => initialProfile?.lastWateredDate ?? "",
  );
  const [lastWateredMinutes, setLastWateredMinutes] = useState(() =>
    initialProfile ? String(initialProfile.lastWateredMinutes) : "",
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const saveResultRef = useRef<HTMLDivElement>(null);

  const todayIso = toIsoDate(new Date());
  const earliestWateredIso = toIsoDate(addDays(new Date(), -7));

  const areaNumber = parseNumericInput(areaValue);
  const durationNumber = parseNumericInput(duration);
  const precipitationRate = parseNumericInput(precipitationRateText);
  const latitude = parseNumericInput(latitudeText);
  const longitude = parseNumericInput(longitudeText);
  const lastWateredMinutesNumber = parseNumericInput(lastWateredMinutes);
  const customEvents = parseNumericInput(eventsText);
  const eventsPerWeek =
    frequency === "custom"
      ? customEvents
      : frequency
        ? EVENTS_PER_WEEK[frequency]
        : null;

  const activePreset: LawnSizePreset | undefined = LAWN_SIZE_PRESETS.find(
    (preset) =>
      areaNumber !== null &&
      areaNumber === presetValueForUnit(preset, areaUnit),
  );
  const areaCaption =
    areaNumber !== null && areaNumber > 0
      ? areaLabel(areaNumber, areaUnit)
      : "Not set yet";
  const errorCount = Object.keys(errors).length;

  useEffect(() => {
    if (saveState === "saved") {
      saveResultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [saveState]);

  function clearError(field: FieldKey) {
    setErrors((previous) => {
      if (!(field in previous)) return previous;

      const next = { ...previous };
      delete next[field];
      return next;
    });
    setSaveState("idle");
    setSaveError("");
  }

  function handleAreaChange(value: string) {
    setAreaValue(value);
    clearError("lawnSize");
  }

  function handleUnitChange(unit: LawnSizeUnit) {
    if (unit === areaUnit) return;

    if (areaNumber !== null && areaNumber > 0) {
      const converted =
        unit === "sqm"
          ? areaNumber / SQFT_PER_SQM
          : areaNumber * SQFT_PER_SQM;
      setAreaValue(String(Math.round(converted)));
    }

    setAreaUnit(unit);
    clearError("lawnSize");
  }

  function handlePresetSelect(preset: LawnSizePreset) {
    setAreaValue(String(presetValueForUnit(preset, areaUnit)));
    clearError("lawnSize");
  }

  function selectGrassType(value: string) {
    setGrassType(value as GrassTypeId);
    clearError("grassType");
  }

  function selectSoilType(value: string) {
    setSoilType(value as SoilTypeId);
    clearError("soilType");
  }

  function selectSprinklerType(value: string) {
    setSprinklerType(value as SprinklerTypeId);
    clearError("sprinklerType");
  }

  function selectFrequency(value: WateringFrequencyId) {
    setFrequency(value);
    setEventsText(
      value === "custom" ? "" : String(EVENTS_PER_WEEK[value]),
    );
    clearError("frequency");
    clearError("eventsPerWeek");
  }

  function useDeviceLocation() {
    setGeoState("loading");
    setAnnouncement("");

    if (!navigator.geolocation) {
      setGeoState("idle");
      setAnnouncement(
        "This browser does not provide location access. Enter the coordinates manually.",
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitudeText(position.coords.latitude.toFixed(5));
        setLongitudeText(position.coords.longitude.toFixed(5));
        setLocationSource("device");
        setLocationLabel((current) =>
          current.trim() ? current : "My location",
        );
        setGeoState("idle");
        clearError("location");
        setAnnouncement(
          "Coordinates filled from this device. You can edit them before saving.",
        );
      },
      () => {
        setGeoState("idle");
        setAnnouncement(
          "Location access was not granted. Enter the latitude and longitude manually.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function loadDemoProfile() {
    const yesterday = toIsoDate(addDays(new Date(), -1));

    setAreaValue("120");
    setAreaUnit("sqm");
    setGrassType("fescue");
    setSoilType("loamy");
    setSprinklerType("not-sure");
    setPrecipitationRateText("30");
    setDuration("30");
    setFrequency("two-three-times");
    setEventsText(String(EVENTS_PER_WEEK["two-three-times"]));
    setLastWateredDate(yesterday);
    setLastWateredMinutes("30");
    setLocationLabel(DEMO_LOCATION.label);
    setLatitudeText(String(DEMO_LOCATION.latitude));
    setLongitudeText(String(DEMO_LOCATION.longitude));
    setLocationSource("demo");
    setErrors({});
    setSubmitAttempted(false);
    setSaveState("idle");
    setSaveError("");
    setAnnouncement(
      "Demo profile filled: 120 m², fescue, loam, 30 mm/h, 30 minutes, 3 events per week, watered yesterday, and a labelled demo location. Review every value, then save. Nothing is saved yet.",
    );
  }

  function copyDurationToLastWatering() {
    if (durationNumber !== null && durationNumber > 0) {
      setLastWateredMinutes(String(durationNumber));
      clearError("lastWateredMinutes");
    }
  }

  function validateProfile(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!locationLabel.trim()) {
      nextErrors.location = "Name this location, for example “Home lawn”.";
    } else if (locationLabel.trim().length > 120) {
      nextErrors.location = "Keep the location name under 120 characters.";
    } else if (latitude === null || latitude < -90 || latitude > 90) {
      nextErrors.location = "Latitude must be a number between -90 and 90.";
    } else if (longitude === null || longitude < -180 || longitude > 180) {
      nextErrors.location = "Longitude must be a number between -180 and 180.";
    }

    if (!areaValue.trim()) {
      nextErrors.lawnSize = "Enter your lawn size.";
    } else if (areaNumber === null) {
      nextErrors.lawnSize = "Enter lawn size as a number.";
    } else if (areaNumber <= 0) {
      nextErrors.lawnSize = "Lawn size must be greater than 0.";
    } else {
      const areaM2 =
        areaUnit === "sqm" ? areaNumber : areaNumber / SQFT_PER_SQM;

      if (areaM2 > 100000) {
        nextErrors.lawnSize =
          "Please check this size — it is larger than a typical residential lawn.";
      }
    }

    if (!grassType) {
      nextErrors.grassType =
        "Choose a grass type, or select “Other / Not sure”.";
    }

    if (!soilType) {
      nextErrors.soilType = "Choose a soil type, or select “Not sure”.";
    }

    if (!sprinklerType) {
      nextErrors.sprinklerType =
        "Choose how you water, or select “Other / Not sure”.";
    }

    if (!precipitationRateText.trim()) {
      nextErrors.precipitationRate =
        "Enter your sprinkler's precipitation rate.";
    } else if (
      precipitationRate === null ||
      precipitationRate <= 0 ||
      precipitationRate > 200
    ) {
      nextErrors.precipitationRate =
        "Enter a precipitation rate above 0 and up to 200 mm/h.";
    }

    if (!duration.trim()) {
      nextErrors.duration = "Enter how long you normally water.";
    } else if (
      durationNumber === null ||
      !Number.isInteger(durationNumber)
    ) {
      nextErrors.duration = "Enter a whole number of minutes.";
    } else if (durationNumber <= 0 || durationNumber > 1440) {
      nextErrors.duration =
        "Enter a duration between 1 and 1,440 minutes.";
    }

    if (!frequency) {
      nextErrors.frequency = "Choose how often you water.";
    }

    if (frequency === "custom") {
      if (
        eventsPerWeek === null ||
        !Number.isInteger(eventsPerWeek) ||
        eventsPerWeek < 1 ||
        eventsPerWeek > 7
      ) {
        nextErrors.eventsPerWeek = "Enter 1 to 7 watering events per week.";
      }
    }

    if (!lastWateredDate) {
      nextErrors.lastWateredDate = "Enter the date of your last watering.";
    } else if (lastWateredDate > todayIso) {
      nextErrors.lastWateredDate = "The last watering date cannot be in the future.";
    } else if (lastWateredDate < earliestWateredIso) {
      nextErrors.lastWateredDate =
        "Use a date within the last 7 days — that is the weather history GreenFlow can retrieve.";
    }

    if (!lastWateredMinutes.trim()) {
      nextErrors.lastWateredMinutes =
        "Enter how many minutes that last watering ran.";
    } else if (
      lastWateredMinutesNumber === null ||
      !Number.isInteger(lastWateredMinutesNumber) ||
      lastWateredMinutesNumber <= 0 ||
      lastWateredMinutesNumber > 1440
    ) {
      nextErrors.lastWateredMinutes =
        "Enter a whole number between 1 and 1,440 minutes.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);

    const nextErrors = validateProfile();
    setErrors(nextErrors);

    const firstInvalidField = FIELD_ORDER.find((field) => nextErrors[field]);

    if (firstInvalidField) {
      setSaveState("idle");
      requestAnimationFrame(() => {
        const target = document.getElementById(FOCUS_IDS[firstInvalidField]);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (
      areaNumber === null ||
      durationNumber === null ||
      precipitationRate === null ||
      latitude === null ||
      longitude === null ||
      lastWateredMinutesNumber === null ||
      eventsPerWeek === null ||
      !grassType ||
      !soilType ||
      !sprinklerType ||
      !frequency
    ) {
      return;
    }

    const areaM2 =
      areaUnit === "sqm" ? areaNumber : areaNumber / SQFT_PER_SQM;

    const payload = {
      location_label: locationLabel.trim(),
      latitude,
      longitude,
      lawn_area_m2: Math.round(areaM2 * 10) / 10,
      grass_type: grassType,
      soil_type: soilType,
      sprinkler_type: sprinklerType,
      precipitation_rate_mm_per_hour: precipitationRate,
      baseline_minutes_per_event: durationNumber,
      events_per_week: eventsPerWeek,
      last_watered_date: lastWateredDate,
      last_watered_minutes: lastWateredMinutesNumber,
    };

    setSaveState("saving");
    setSaveError("");
    setAnnouncement("");

    try {
      let saved;
      if (profileId) {
        try {
          saved = await updateProfile(profileId, payload);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            saved = await createProfile(payload);
          } else {
            throw error;
          }
        }
      } else {
        saved = await createProfile(payload);
      }

      setProfileId(saved.id);

      const profile: LawnProfile = {
        backendId: saved.id,
        lawnArea: {
          value: areaNumber,
          unit: areaUnit,
          areaM2: Math.round(areaM2 * 10) / 10,
        },
        location: {
          label: payload.location_label,
          latitude,
          longitude,
          source: locationSource,
        },
        grassType,
        soilType,
        sprinklerType,
        precipitationRateMmPerHour: precipitationRate,
        wateringDurationMinutes: durationNumber,
        wateringFrequency: frequency,
        eventsPerWeek,
        lastWateredDate,
        lastWateredMinutes: lastWateredMinutesNumber,
        savedAt: new Date().toISOString(),
      };

      if (!saveLawnProfile(profile)) {
        setSaveState("error");
        setSaveError(
          "Your profile reached the GreenFlow server, but this browser could not keep a local copy. Allow local storage and save again.",
        );
        return;
      }

      setSaveState("saved");
      setAnnouncement(
        "Your lawn profile is saved and will be used for every recommendation.",
      );
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof ApiError
          ? error.message
          : "The profile could not be saved to the backend. Check the connection and try again.",
      );
    }
  }

  return (
    <div className="gf-shell gf-setup">
      <div className="gf-setup__page">
        <header className="gf-setup-topbar">
          <button
            type="button"
            className="gf-setup-brand"
            onClick={() => onNavigate("dashboard")}
            aria-label="Back to the GreenFlow dashboard"
          >
            <span className="gf-setup-brand__mark">
              <Leaf size={20} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="gf-setup-brand__text">
              <strong>GreenFlow</strong>
              <small>Smart irrigation</small>
            </span>
          </button>

          <div className="gf-setup-topbar__actions">
            <button
              type="button"
              className="gf-setup-back"
              onClick={() => onNavigate("dashboard")}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="gf-setup-back__full">Back to dashboard</span>
              <span className="gf-setup-back__short">Dashboard</span>
            </button>
            <span className="gf-setup-step-pill">
              <span aria-hidden="true" />
              Step 1 of 2
            </span>
          </div>
        </header>

        <main className="gf-setup-main">
          <section className="gf-setup-hero" aria-labelledby="gf-setup-title">
            <div className="gf-setup-hero__copy">
              <div className="gf-setup-hero__badges">
                <span className="gf-setup-eyebrow">
                  <Sprout size={14} aria-hidden="true" />
                  Lawn setup
                </span>
                {initialProfile ? (
                  <span className="gf-setup-saved-badge">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    Editing saved profile
                  </span>
                ) : null}
              </div>

              <h1 id="gf-setup-title">Let’s understand your lawn.</h1>
              <p className="gf-setup-subtitle">
                These details become the input for every live watering
                recommendation. GreenFlow stores them in its backend — not just
                in this browser.
              </p>

              <div className="gf-setup-progress">
                <div className="gf-setup-progress__label">
                  <span>Lawn details</span>
                  <strong>Step 1 of 2</strong>
                </div>
                <div
                  className="gf-setup-progress__track"
                  role="progressbar"
                  aria-label="Setup progress"
                  aria-valuemin={1}
                  aria-valuemax={2}
                  aria-valuenow={1}
                  aria-valuetext="Step 1 of 2"
                >
                  <span style={{ width: "50%" }} />
                </div>
              </div>

              <p className="gf-setup-advisory">
                <ShieldCheck size={15} aria-hidden="true" />
                Advisory only. You stay in control of your sprinkler timer.
              </p>
            </div>

            <figure className="gf-setup-hero__media">
              <img
                src="/images/hero-lawn.jpg"
                alt="Healthy green residential lawn in front of a home"
                width={1400}
                height={933}
              />
              <figcaption>
                <span aria-hidden="true" />
                A healthy lawn starts with the right details.
              </figcaption>
            </figure>
          </section>

          <form
            className="gf-setup-form"
            noValidate
            onSubmit={handleSubmit}
          >
            <div className="gf-setup-intro">
              <Info size={16} aria-hidden="true" />
              <p>
                All questions are required. Choose “Not sure” wherever you do
                not know — GreenFlow will say when a value cannot support a
                calculation instead of making one up.
              </p>
              <button
                type="button"
                className="gf-setup-demo"
                onClick={loadDemoProfile}
              >
                <Wand2 size={15} aria-hidden="true" />
                Fill demo profile
              </button>
            </div>

            {submitAttempted && errorCount > 0 ? (
              <div className="gf-error-summary" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <div>
                  <strong>Please complete the highlighted fields.</strong>
                  <p>
                    Your lawn profile was not saved. Check the {errorCount}{" "}
                    {errorCount === 1 ? "field" : "fields"} below.
                  </p>
                </div>
              </div>
            ) : null}

            <section
              className="gf-question-card"
              aria-labelledby="gf-location-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  01
                </span>
                <div>
                  <h2 id="gf-location-title">Where is your lawn?</h2>
                  <p id="gf-location-hint">
                    GreenFlow requests Open-Meteo weather for these coordinates.
                    Nothing is sent to your irrigation timer.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div className="gf-location-card">
                <div className="gf-location-grid">
                  <div className="gf-routine-block">
                    <label className="gf-field-label" htmlFor="location-label">
                      Location name
                    </label>
                    <div
                      className={[
                        "gf-duration-input",
                        errors.location ? "gf-duration-input--error" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <MapPin size={17} aria-hidden="true" />
                      <input
                        id="location-label"
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. Home lawn"
                        value={locationLabel}
                        onChange={(event) => {
                          setLocationLabel(event.target.value);
                          clearError("location");
                        }}
                        aria-invalid={errors.location ? true : undefined}
                        aria-describedby={
                          errors.location
                            ? "gf-location-hint gf-location-error"
                            : "gf-location-hint"
                        }
                      />
                    </div>
                  </div>

                  <div className="gf-coordinate-grid">
                    <div>
                      <label
                        className="gf-field-label"
                        htmlFor="latitude-input"
                      >
                        Latitude
                      </label>
                      <input
                        id="latitude-input"
                        className="gf-text-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 30.2672"
                        value={latitudeText}
                        onChange={(event) => {
                          setLatitudeText(event.target.value);
                          setLocationSource("manual");
                          clearError("location");
                        }}
                        aria-invalid={errors.location ? true : undefined}
                        aria-describedby={
                          errors.location
                            ? "gf-location-hint gf-location-error"
                            : "gf-location-hint"
                        }
                      />
                    </div>
                    <div>
                      <label
                        className="gf-field-label"
                        htmlFor="longitude-input"
                      >
                        Longitude
                      </label>
                      <input
                        id="longitude-input"
                        className="gf-text-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. -97.7431"
                        value={longitudeText}
                        onChange={(event) => {
                          setLongitudeText(event.target.value);
                          setLocationSource("manual");
                          clearError("location");
                        }}
                        aria-invalid={errors.location ? true : undefined}
                        aria-describedby={
                          errors.location
                            ? "gf-location-hint gf-location-error"
                            : "gf-location-hint"
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="gf-location-actions">
                  <button
                    type="button"
                    className="gf-location-button"
                    onClick={useDeviceLocation}
                    disabled={geoState === "loading"}
                  >
                    <Crosshair size={15} aria-hidden="true" />
                    {geoState === "loading"
                      ? "Requesting location…"
                      : "Use my location"}
                  </button>
                  {locationSource === "device" ? (
                    <span className="gf-location-source">
                      Filled from this device
                    </span>
                  ) : null}
                  {locationSource === "demo" ? (
                    <span className="gf-location-source gf-location-source--demo">
                      Demo coordinates — replace with your lawn before a real
                      recommendation
                    </span>
                  ) : null}
                </div>

                {errors.location ? (
                  <p
                    className="gf-field-error"
                    id="gf-location-error"
                    role="alert"
                  >
                    <AlertCircle size={14} aria-hidden="true" />
                    {errors.location}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-size-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  02
                </span>
                <div>
                  <h2 id="gf-size-title">How large is your lawn?</h2>
                  <p id="gf-size-hint">
                    A rough measurement is fine. You can adjust this later.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div className="gf-size-grid">
                <div className="gf-size-controls">
                  <label
                    className="gf-field-label"
                    htmlFor="lawn-area-input"
                  >
                    Lawn area
                  </label>

                  <div className="gf-size-input-row">
                    <div
                      className={[
                        "gf-size-input",
                        errors.lawnSize ? "gf-size-input--error" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Ruler size={18} aria-hidden="true" />
                      <input
                        id="lawn-area-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="e.g. 3,000"
                        value={areaValue}
                        onChange={(event) =>
                          handleAreaChange(event.target.value)
                        }
                        aria-invalid={errors.lawnSize ? true : undefined}
                        aria-describedby={
                          errors.lawnSize
                            ? "gf-size-hint gf-size-error"
                            : "gf-size-hint"
                        }
                      />
                    </div>

                    <div
                      className="gf-unit-toggle"
                      role="group"
                      aria-label="Lawn size unit"
                    >
                      <button
                        type="button"
                        aria-pressed={areaUnit === "sqft"}
                        onClick={() => handleUnitChange("sqft")}
                      >
                        sq ft
                      </button>
                      <button
                        type="button"
                        aria-pressed={areaUnit === "sqm"}
                        onClick={() => handleUnitChange("sqm")}
                      >
                        m²
                      </button>
                    </div>
                  </div>

                  <div className="gf-preset-block">
                    <span className="gf-field-label">
                      Or choose an approximate size
                    </span>
                    <div className="gf-size-presets">
                      {LAWN_SIZE_PRESETS.map((preset) => {
                        const selected = activePreset?.id === preset.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={[
                              "gf-size-preset",
                              selected ? "gf-size-preset--selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-pressed={selected}
                            onClick={() => handlePresetSelect(preset)}
                          >
                            <strong>{preset.label}</strong>
                            <span>
                              {areaLabel(
                                presetValueForUnit(preset, areaUnit),
                                areaUnit,
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {errors.lawnSize ? (
                    <p
                      className="gf-field-error"
                      id="gf-size-error"
                      role="alert"
                    >
                      <AlertCircle size={14} aria-hidden="true" />
                      {errors.lawnSize}
                    </p>
                  ) : null}
                </div>

                <div className="gf-size-visual">
                  <LawnSizeIllustration />
                  <div className="gf-size-visual__caption">
                    <span>Lawn area</span>
                    <strong>{areaCaption}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-grass-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  03
                </span>
                <div>
                  <h2 id="gf-grass-title">
                    What type of grass grows in your lawn?
                  </h2>
                  <p id="gf-grass-hint">
                    The grass class selects a cited FAO-56 crop coefficient.
                    Choose “Other / Not sure” if you are unsure — GreenFlow will
                    explain that it cannot calculate without a mapped class.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div
                className="gf-option-grid"
                role="radiogroup"
                aria-labelledby="gf-grass-title"
                aria-describedby={
                  errors.grassType
                    ? "gf-grass-hint gf-grass-error"
                    : "gf-grass-hint"
                }
                aria-required="true"
                aria-invalid={errors.grassType ? true : undefined}
              >
                {GRASS_OPTIONS.map((option) => (
                  <SelectOptionCard
                    key={option.id}
                    name="grass-type"
                    id={`grass-${option.id}`}
                    value={option.id}
                    checked={grassType === option.id}
                    title={option.label}
                    description={option.description}
                    image={option.image}
                    imageAlt={option.imageAlt}
                    tag={option.tag}
                    onChange={selectGrassType}
                  />
                ))}
              </div>

              {errors.grassType ? (
                <p
                  className="gf-field-error"
                  id="gf-grass-error"
                  role="alert"
                >
                  <AlertCircle size={14} aria-hidden="true" />
                  {errors.grassType}
                </p>
              ) : null}
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-soil-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  04
                </span>
                <div>
                  <h2 id="gf-soil-title">
                    What type of soil does your lawn have?
                  </h2>
                  <p id="gf-soil-hint">
                    The soil class selects cited FAO-56 water-holding values.
                    Not sure? Select “Not sure” — no guessing required.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div
                className="gf-option-grid gf-option-grid--soil"
                role="radiogroup"
                aria-labelledby="gf-soil-title"
                aria-describedby={
                  errors.soilType
                    ? "gf-soil-hint gf-soil-error"
                    : "gf-soil-hint"
                }
                aria-required="true"
                aria-invalid={errors.soilType ? true : undefined}
              >
                {SOIL_OPTIONS.map((option) => (
                  <SelectOptionCard
                    key={option.id}
                    name="soil-type"
                    id={`soil-${option.id}`}
                    value={option.id}
                    checked={soilType === option.id}
                    title={option.label}
                    description={option.description}
                    image={option.image}
                    imageAlt={option.imageAlt}
                    tag={option.tag}
                    onChange={selectSoilType}
                  />
                ))}
              </div>

              {errors.soilType ? (
                <p
                  className="gf-field-error"
                  id="gf-soil-error"
                  role="alert"
                >
                  <AlertCircle size={14} aria-hidden="true" />
                  {errors.soilType}
                </p>
              ) : null}
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-sprinkler-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  05
                </span>
                <div>
                  <h2 id="gf-sprinkler-title">
                    How do you water your lawn?
                  </h2>
                  <p id="gf-sprinkler-hint">
                    Choose the option that best matches how water reaches your
                    lawn. The precipitation rate below is what the calculation
                    uses.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div
                className="gf-option-grid"
                role="radiogroup"
                aria-labelledby="gf-sprinkler-title"
                aria-describedby={
                  errors.sprinklerType
                    ? "gf-sprinkler-hint gf-sprinkler-error"
                    : "gf-sprinkler-hint"
                }
                aria-required="true"
                aria-invalid={errors.sprinklerType ? true : undefined}
              >
                {SPRINKLER_OPTIONS.map((option) => (
                  <SelectOptionCard
                    key={option.id}
                    name="sprinkler-type"
                    id={`sprinkler-${option.id}`}
                    value={option.id}
                    checked={sprinklerType === option.id}
                    title={option.label}
                    description={option.description}
                    image={option.image}
                    imageAlt={option.imageAlt}
                    tag={option.tag}
                    onChange={selectSprinklerType}
                  />
                ))}
              </div>

              {errors.sprinklerType ? (
                <p
                  className="gf-field-error"
                  id="gf-sprinkler-error"
                  role="alert"
                >
                  <AlertCircle size={14} aria-hidden="true" />
                  {errors.sprinklerType}
                </p>
              ) : null}
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-rate-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  06
                </span>
                <div>
                  <h2 id="gf-rate-title">
                    How fast does your sprinkler apply water?
                  </h2>
                  <p id="gf-rate-hint">
                    Use your sprinkler chart or a catch-cup test. If you know
                    flow, precipitation rate = 60 × flow (L/min) ÷ lawn area
                    (m²).
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div className="gf-rate-grid">
                <div className="gf-routine-block">
                  <label
                    className="gf-field-label"
                    htmlFor="precipitation-rate"
                  >
                    Precipitation rate
                  </label>
                  <div
                    className={[
                      "gf-duration-input",
                      errors.precipitationRate
                        ? "gf-duration-input--error"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Droplets size={17} aria-hidden="true" />
                    <input
                      id="precipitation-rate"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="e.g. 30"
                      value={precipitationRateText}
                      onChange={(event) => {
                        setPrecipitationRateText(event.target.value);
                        clearError("precipitationRate");
                      }}
                      aria-invalid={
                        errors.precipitationRate ? true : undefined
                      }
                      aria-describedby={
                        errors.precipitationRate
                          ? "gf-rate-hint gf-rate-error"
                          : "gf-rate-hint"
                      }
                    />
                    <span>mm/h</span>
                  </div>

                  {errors.precipitationRate ? (
                    <p
                      className="gf-field-error"
                      id="gf-rate-error"
                      role="alert"
                    >
                      <AlertCircle size={14} aria-hidden="true" />
                      {errors.precipitationRate}
                    </p>
                  ) : null}
                </div>

                <div className="gf-rate-note">
                  <p>
                    This value converts a recommended water depth into run
                    time. It is not a measured flow reading, and GreenFlow does
                    not receive data from your sprinkler controller.
                  </p>
                </div>
              </div>
            </section>

            <section
              className="gf-question-card"
              aria-labelledby="gf-duration-title"
            >
              <div className="gf-question-head">
                <span className="gf-question-number" aria-hidden="true">
                  07
                </span>
                <div>
                  <h2 id="gf-duration-title">
                    What is your normal watering routine?
                  </h2>
                  <p id="gf-routine-hint">
                    Tell us your usual cycle length, weekly rhythm, and when
                    the lawn was last watered.
                  </p>
                </div>
                <span className="gf-question-required">Required</span>
              </div>

              <div className="gf-routine-grid">
                <div className="gf-routine-block">
                  <h3>Minutes per watering</h3>
                  <label
                    className="gf-field-label"
                    htmlFor="watering-duration"
                  >
                    Typical cycle length
                  </label>

                  <div
                    className={[
                      "gf-duration-input",
                      errors.duration
                        ? "gf-duration-input--error"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Timer size={17} aria-hidden="true" />
                    <input
                      id="watering-duration"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="e.g. 30"
                      value={duration}
                      onChange={(event) => {
                        setDuration(event.target.value);
                        clearError("duration");
                      }}
                      aria-invalid={errors.duration ? true : undefined}
                      aria-describedby={
                        errors.duration
                          ? "gf-routine-hint gf-duration-error"
                          : "gf-routine-hint"
                      }
                    />
                    <span>min</span>
                  </div>

                  <div
                    className="gf-duration-presets"
                    role="group"
                    aria-label="Suggested watering durations"
                  >
                    {WATERING_DURATION_PRESETS.map((minutes) => {
                      const selected = durationNumber === minutes;

                      return (
                        <button
                          key={minutes}
                          type="button"
                          className={[
                            "gf-duration-preset",
                            selected
                              ? "gf-duration-preset--selected"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-pressed={selected}
                          onClick={() => {
                            setDuration(String(minutes));
                            clearError("duration");
                          }}
                        >
                          {minutes} min
                        </button>
                      );
                    })}
                  </div>

                  {errors.duration ? (
                    <p
                      className="gf-field-error"
                      id="gf-duration-error"
                      role="alert"
                    >
                      <AlertCircle size={14} aria-hidden="true" />
                      {errors.duration}
                    </p>
                  ) : null}
                </div>

                <div className="gf-routine-block">
                  <h3 id="gf-frequency-title">How often do you water?</h3>
                  <div
                    className="gf-frequency-grid"
                    role="radiogroup"
                    aria-labelledby="gf-frequency-title"
                    aria-describedby={
                      errors.frequency
                        ? "gf-routine-hint gf-frequency-error"
                        : "gf-routine-hint"
                    }
                    aria-required="true"
                    aria-invalid={errors.frequency ? true : undefined}
                  >
                    {FREQUENCY_OPTIONS.map((option) => {
                      const selected = frequency === option.id;

                      return (
                        <label
                          key={option.id}
                          className={[
                            "gf-frequency",
                            selected ? "gf-frequency--selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <input
                            className="gf-frequency__input"
                            type="radio"
                            name="water-frequency"
                            id={`frequency-${option.id}`}
                            value={option.id}
                            checked={selected}
                            onChange={() => selectFrequency(option.id)}
                          />
                          <span
                            className="gf-frequency__dot"
                            aria-hidden="true"
                          />
                          <span className="gf-frequency__copy">
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {frequency === "custom" ? (
                    <div className="gf-custom-events">
                      <label
                        className="gf-field-label"
                        htmlFor="events-per-week"
                      >
                        Events per week
                      </label>
                      <div
                        className={[
                          "gf-duration-input",
                          errors.eventsPerWeek
                            ? "gf-duration-input--error"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <CalendarDays size={16} aria-hidden="true" />
                        <input
                          id="events-per-week"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="1–7"
                          value={eventsText}
                          onChange={(event) => {
                            setEventsText(event.target.value);
                            clearError("eventsPerWeek");
                          }}
                          aria-invalid={
                            errors.eventsPerWeek ? true : undefined
                          }
                        />
                        <span>per week</span>
                      </div>
                      {errors.eventsPerWeek ? (
                        <p className="gf-field-error" role="alert">
                          <AlertCircle size={14} aria-hidden="true" />
                          {errors.eventsPerWeek}
                        </p>
                      ) : null}
                    </div>
                  ) : eventsPerWeek !== null ? (
                    <p className="gf-events-summary">
                      {eventsPerWeek} watering{" "}
                      {eventsPerWeek === 1 ? "event" : "events"} per week — used
                      to set the decision horizon.
                    </p>
                  ) : null}

                  {errors.frequency ? (
                    <p
                      className="gf-field-error"
                      id="gf-frequency-error"
                      role="alert"
                    >
                      <AlertCircle size={14} aria-hidden="true" />
                      {errors.frequency}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="gf-last-watered">
                <div className="gf-last-watered__head">
                  <span className="gf-last-watered__icon">
                    <CalendarClock size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>Last watering</h3>
                    <p>
                      The calculation starts from the day you last watered.
                      Open-Meteo history covers the last 7 days.
                    </p>
                  </div>
                </div>

                <div className="gf-last-watered__grid">
                  <div>
                    <label
                      className="gf-field-label"
                      htmlFor="last-watered-date"
                    >
                      Date
                    </label>
                    <input
                      id="last-watered-date"
                      className={[
                        "gf-text-input",
                        errors.lastWateredDate
                          ? "gf-text-input--error"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="date"
                      min={earliestWateredIso}
                      max={todayIso}
                      value={lastWateredDate}
                      onChange={(event) => {
                        setLastWateredDate(event.target.value);
                        clearError("lastWateredDate");
                      }}
                      aria-invalid={
                        errors.lastWateredDate ? true : undefined
                      }
                    />
                    {errors.lastWateredDate ? (
                      <p className="gf-field-error" role="alert">
                        <AlertCircle size={14} aria-hidden="true" />
                        {errors.lastWateredDate}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      className="gf-field-label"
                      htmlFor="last-watered-minutes"
                    >
                      Minutes run
                    </label>
                    <div
                      className={[
                        "gf-duration-input",
                        errors.lastWateredMinutes
                          ? "gf-duration-input--error"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Timer size={16} aria-hidden="true" />
                      <input
                        id="last-watered-minutes"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="e.g. 30"
                        value={lastWateredMinutes}
                        onChange={(event) => {
                          setLastWateredMinutes(event.target.value);
                          clearError("lastWateredMinutes");
                        }}
                        aria-invalid={
                          errors.lastWateredMinutes ? true : undefined
                        }
                      />
                      <span>min</span>
                    </div>
                    {errors.lastWateredMinutes ? (
                      <p className="gf-field-error" role="alert">
                        <AlertCircle size={14} aria-hidden="true" />
                        {errors.lastWateredMinutes}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="gf-inline-link"
                        onClick={copyDurationToLastWatering}
                      >
                        Use my normal cycle length
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="gf-save-card" aria-label="Save lawn profile">
              <div className="gf-save-card__main">
                <div className="gf-save-card__copy">
                  <span className="gf-save-card__icon">
                    <ShieldCheck size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Ready when you are</strong>
                    <p>
                      Your profile is saved to the GreenFlow backend and cached
                      in this browser. GreenFlow only advises — it never
                      controls your sprinkler timer.
                    </p>
                  </div>
                </div>

                <div className="gf-save-card__actions">
                  <button
                    type="submit"
                    className="gf-save-button"
                    disabled={saveState === "saving"}
                  >
                    {saveState === "saving"
                      ? "Saving profile…"
                      : "Save Lawn Profile"}
                    <Check size={17} aria-hidden="true" />
                  </button>
                  <span className="gf-save-card__hint">
                    No account needed.
                  </span>
                </div>
              </div>

              {saveState === "saved" ? (
                <div
                  className="gf-save-result"
                  role="status"
                  ref={saveResultRef}
                >
                  <span className="gf-save-result__icon">
                    <CheckCircle2 size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Lawn profile saved to GreenFlow.</strong>
                    <p>
                      Live recommendations now use these values. You can update
                      them anytime.
                    </p>
                  </div>
                  <div className="gf-save-result__actions">
                    <button
                      type="button"
                      className="gf-save-result__action"
                      onClick={() => onNavigate("recommendation")}
                    >
                      Get today’s recommendation
                    </button>
                    <button
                      type="button"
                      className="gf-save-result__action gf-save-result__action--ghost"
                      onClick={() => onNavigate("dashboard")}
                    >
                      Back to dashboard
                    </button>
                  </div>
                </div>
              ) : null}

              {saveState === "error" ? (
                <div className="gf-save-error" role="alert">
                  <AlertCircle size={17} aria-hidden="true" />
                  <p>{saveError}</p>
                </div>
              ) : null}
            </section>
          </form>
        </main>

        <footer className="gf-setup-footer">
          <span>GreenFlow · Smart Lawn Irrigation Advisor</span>
          <span>
            <CalendarDays size={13} aria-hidden="true" />
            Residential lawn profile · Step 1 of 2
          </span>
        </footer>
      </div>

      <p className="gf-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
