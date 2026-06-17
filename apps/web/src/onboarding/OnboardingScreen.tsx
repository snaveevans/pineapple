import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  getUserProfile,
  isOnboardingComplete,
  updateUserProfile,
  userProfileQueryKey,
  type UserProfile,
} from "../api/userProfile";
import { ApiError } from "../api/client";
import { Icon } from "../design/Icon";
import { Brandmark } from "../design/Brandmark";
import { paths, routePaths } from "../routes";
import {
  DISPLAY_NAME_MAX_LENGTH,
  toProfileFormError,
  validateDisplayName,
  type DisplayNameFieldError,
} from "./onboardingForm";
import { OnboardingLoading } from "./OnboardingLoading";

import "../design/styles/hifi.css";
import "../auth/styles/auth.css";
import "./styles/onboarding.css";

const OB_VALUES = [
  "Every truck, property, and tool on one schedule",
  "Automatic reminders before each service is due",
  "See what's overdue the moment you log in",
];

function OnboardingCollage() {
  return (
    <div className="au-collage">
      <div className="au-float au-float-pill ob-pill-warn">
        <Icon name="clock-sm" size={13} stroke={2} />
        In 2 days
      </div>
      <div className="au-float au-float-card">
        <div className="ob-mini-thumb ob-mini-thumb-lawn">
          <Icon name="leaf" size={26} stroke={1.75} />
        </div>
        <div className="ob-mini-body">
          <div className="ob-mini-name">Riverside Lawn</div>
          <div className="ob-mini-meta">LAWN-A</div>
        </div>
      </div>
      <div className="au-float au-float-next">
        <span className="au-next-eyebrow">
          <Icon name="arrow-right" size={10} stroke={2.2} />
          Next up
        </span>
        <div className="au-next-head">
          <div className="ob-asset-icon-vehicle">
            <Icon name="truck" size={18} stroke={1.75} />
          </div>
          <div>
            <div className="au-next-name">Ford F-150 · #4</div>
            <div className="au-next-sub">48,210 mi</div>
          </div>
        </div>
        <div className="au-next-svc-lbl">Service due</div>
        <div className="au-next-svc">Oil change + tire rotation</div>
      </div>
    </div>
  );
}

function OnboardingBrand() {
  return (
    <div className="au-brand">
      <Link className="au-brand-logo" to={paths.home}>
        <span className="au-brand-mark">
          <Brandmark size={17} color="white" />
        </span>
        <span className="au-brand-name">FieldOps</span>
      </Link>
      <div className="au-brand-content">
        <div className="au-brand-body">
          <h2 className="au-brand-h2">Your dashboard is one step away.</h2>
          <ul className="au-brand-list">
            {OB_VALUES.map((value) => (
              <li key={value}>
                <span className="au-check">
                  <Icon name="check" size={12} stroke={3} />
                </span>
                {value}
              </li>
            ))}
          </ul>
        </div>
        <OnboardingCollage />
      </div>
    </div>
  );
}

function OnboardingCard({
  profile,
  returnTo,
}: {
  profile: UserProfile;
  returnTo: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPrefill = profile.name !== null && profile.name.length > 0;
  const [name, setName] = useState(profile.name ?? "");
  const [fieldError, setFieldError] = useState<DisplayNameFieldError | null>(null);

  const mutation = useMutation({
    mutationFn: (nextName: string) => updateUserProfile(nextName),
    onSuccess: async (updated) => {
      await queryClient.setQueryData(userProfileQueryKey, updated);
      void navigate(returnTo, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void navigate(paths.login(), { replace: true });
        return;
      }
      const mapped = error instanceof ApiError ? toProfileFormError(error) : null;
      if (mapped) setFieldError(mapped);
    },
  });

  const charCount = name.length;
  const helperText =
    fieldError === "empty"
      ? "Name is required."
      : fieldError === "too-long"
        ? "Name must be 100 characters or less."
        : hasPrefill
          ? "Imported from your Google account — keep it or change it."
          : "This is how you'll appear on your dashboard and profile.";

  const subText = hasPrefill
    ? "We imported a name from your Google account. Confirm it's right or enter a different one."
    : "Enter the name you'd like to use in FieldOps. You can update it any time.";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateDisplayName(name);
    if (!result.ok) {
      setFieldError(result.error);
      return;
    }
    setFieldError(null);
    mutation.mutate(result.value);
  };

  return (
    <form className="ob-card" onSubmit={handleSubmit} noValidate>
      <Link className="au-card-logo" to={paths.home}>
        <span className="au-brand-mark">
          <Icon name="wrench" size={15} color="white" stroke={2} />
        </span>
        <span className="au-brand-name">FieldOps</span>
      </Link>

      <div className="au-eyebrow">Account setup</div>
      <h1 className="au-h1">Set up your profile</h1>
      <p className="ob-sub">{subText}</p>

      <div className="ob-email-row">
        <span className="ob-email-icon">
          <Icon name="lock" size={12} stroke={1.75} />
        </span>
        <span className="ob-email-text">Signed in as</span>
        <span className="ob-email-addr">{profile.email}</span>
      </div>

      <div className="ob-field">
        <div className="ob-field-header">
          <label className="ob-label" htmlFor="ob-name-input">
            Display name
          </label>
          <span
            className={
              "ob-char-count" +
              (charCount > DISPLAY_NAME_MAX_LENGTH
                ? " ob-char-at-limit"
                : charCount > 85
                  ? " ob-char-near-limit"
                  : "")
            }
          >
            {charCount}/{DISPLAY_NAME_MAX_LENGTH}
          </span>
        </div>
        <input
          id="ob-name-input"
          className={"ob-input" + (fieldError ? " ob-input-error" : "")}
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (fieldError) setFieldError(null);
          }}
          placeholder="Your name"
          disabled={mutation.isPending}
          autoFocus
          autoComplete="name"
        />
        <p className={"ob-helper" + (fieldError ? " ob-helper-error" : "")}>{helperText}</p>
      </div>

      <button className="ob-submit" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? (
          <>
            <span className="ob-btn-spinner" />
            Setting up your account…
          </>
        ) : (
          <>
            {hasPrefill ? "Confirm & get started" : "Get started"}
            <Icon name="arrow-right" size={16} stroke={2} color="white" />
          </>
        )}
      </button>
    </form>
  );
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return paths.appHome;
  }
  if (value.startsWith(routePaths.onboarding)) {
    return paths.appHome;
  }
  return value;
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    document.title = "FieldOps — Set up your profile";
  }, []);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: userProfileQueryKey,
    queryFn: getUserProfile,
    retry: (failureCount, queryError) => {
      if (queryError instanceof ApiError && queryError.status === 401) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      void navigate(paths.login(), { replace: true });
    }
  }, [error, navigate]);

  useEffect(() => {
    if (profile && isOnboardingComplete(profile)) {
      void navigate(returnTo, { replace: true });
    }
  }, [profile, returnTo, navigate]);

  return (
    <div className="au">
      <div className="au-split">
        <OnboardingBrand />
        <div className="au-form-side">
          {isLoading || !profile ? (
            <OnboardingLoading />
          ) : (
            <OnboardingCard profile={profile} returnTo={returnTo} />
          )}
        </div>
      </div>
    </div>
  );
}