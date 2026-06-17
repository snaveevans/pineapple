import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { getUserProfile, updateUserProfile, userProfileQueryKey } from "../api/userProfile";
import { ApiError } from "../api/client";
import { Icon } from "../design/Icon";
import { paths } from "../routes";
import {
  DISPLAY_NAME_MAX_LENGTH,
  toProfileFormError,
  validateDisplayName,
  type DisplayNameFieldError,
} from "../onboarding/onboardingForm";
import { profileAvatarInitial } from "./profilePresentation";
import { HFTopBar, HFBottomNav } from "./AppChrome";

import "../design/styles/hifi.css";
import "../design/styles/hifi-add-asset.css";
import "./styles/profile-edit.css";

function GoogleG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function ProfileLoading() {
  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />
      <div className="hf-aa-body">
        <div className="hf-aa-col pe-col">
          <p className="pe-field-sub">Loading your profile…</p>
        </div>
      </div>
    </div>
  );
}

export function AppProfileEdit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<DisplayNameFieldError | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [apiError, setApiError] = useState(false);

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
    if (profile?.name !== undefined) {
      setName(profile.name ?? "");
    }
  }, [profile?.name]);

  useEffect(() => {
    document.title = "FieldOps — Edit profile";
  }, []);

  const mutation = useMutation({
    mutationFn: (nextName: string) => updateUserProfile(nextName),
    onSuccess: async (updated) => {
      await queryClient.setQueryData(userProfileQueryKey, updated);
      setName(updated.name ?? "");
      setFieldError(null);
      setApiError(false);
      setShowSaved(true);
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiError && mutationError.status === 401) {
        void navigate(paths.login(), { replace: true });
        return;
      }
      const mapped =
        mutationError instanceof ApiError ? toProfileFormError(mutationError) : null;
      if (mapped) {
        setFieldError(mapped);
        setApiError(false);
      } else {
        setApiError(true);
      }
      setShowSaved(false);
    },
  });

  if (isLoading || !profile) {
    return <ProfileLoading />;
  }

  const savedName = profile.name ?? "";
  const trimmedName = name.trim();
  const trimmedSaved = savedName.trim();
  const hasChanges = trimmedName !== trimmedSaved;
  const charCount = name.length;
  const hasFieldError = fieldError !== null;

  const fieldSubText = hasFieldError
    ? null
    : showSaved
      ? "Your display name has been saved."
      : hasChanges
        ? "Changes haven't been saved yet."
        : "This name appears on your dashboard and in your profile avatar.";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateDisplayName(name);
    if (!result.ok) {
      setFieldError(result.error);
      setShowSaved(false);
      setApiError(false);
      return;
    }
    if (!hasChanges) {
      setShowSaved(true);
      return;
    }
    setFieldError(null);
    setApiError(false);
    setShowSaved(false);
    mutation.mutate(result.value);
  };

  const handleCancel = () => {
    void navigate(paths.appHome);
  };

  return (
    <form className="hf hf-app hf-aa-page" onSubmit={handleSubmit} noValidate>
      <HFTopBar />

      <div className="hf-aa-crumb">
        <Link to={paths.appHome}>Account</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">Edit profile</span>
      </div>

      <div className="hf-aa-body">
        <div className="hf-aa-col pe-col">
          <div className="hf-aa-head">
            <h1>Edit profile</h1>
            <p>Update the name that appears on your dashboard and profile.</p>
          </div>

          <div className="pe-identity">
            <div className="pe-avatar-lg">{profileAvatarInitial(savedName)}</div>
            <div className="pe-identity-info">
              <div className="pe-identity-name">{savedName || "—"}</div>
              <div className="pe-identity-email">
                <Icon name="lock" size={11} stroke={1.75} />
                {profile.email}
              </div>
            </div>
            <div className="pe-identity-google">
              <GoogleG size={13} />
              Google account
            </div>
          </div>

          <div className="hf-aa-rule" />

          <div className="hf-aa-section">
            <div className="hf-aa-section-head">
              <span className="hf-aa-section-title">Display name</span>
            </div>

            <div className={`hf-field${hasFieldError ? " has-error" : ""}`}>
              <label className="hf-field-label" htmlFor="pe-name-input">
                Display name
                <span className="hf-field-req">*</span>
                <span
                  className={
                    "hf-field-hint" +
                    (charCount > DISPLAY_NAME_MAX_LENGTH
                      ? " pe-hint-bad"
                      : charCount > 85
                        ? " pe-hint-warn"
                        : "")
                  }
                >
                  {charCount}/{DISPLAY_NAME_MAX_LENGTH}
                </span>
              </label>
              <input
                id="pe-name-input"
                className={`hf-input${hasFieldError ? " is-invalid" : ""}`}
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (fieldError) setFieldError(null);
                  if (apiError) setApiError(false);
                  if (showSaved) setShowSaved(false);
                }}
                placeholder="Your name"
                disabled={mutation.isPending}
                autoFocus
                autoComplete="name"
              />
              {hasFieldError ? (
                <span className="hf-field-error" role="alert">
                  <Icon name="alert" size={12} stroke={2} />
                  {fieldError === "empty"
                    ? "Name is required."
                    : "Name must be 100 characters or less."}
                </span>
              ) : (
                fieldSubText && <span className="pe-field-sub">{fieldSubText}</span>
              )}
            </div>
          </div>

          {showSaved && !hasFieldError && !apiError && (
            <div className="hf-aa-banner is-ok" role="status">
              <span className="hf-aa-banner-icon">
                <Icon name="check" size={15} stroke={2.5} />
              </span>
              <div className="hf-aa-banner-text">
                <div className="hf-aa-banner-title">Profile updated</div>
                <div className="hf-aa-banner-sub">
                  Your display name has been saved successfully.
                </div>
              </div>
            </div>
          )}

          {apiError && (
            <div className="hf-aa-banner is-error" role="alert">
              <span className="hf-aa-banner-icon">
                <Icon name="alert" size={15} stroke={2} />
              </span>
              <div className="hf-aa-banner-text">
                <div className="hf-aa-banner-title">Profile could not be saved</div>
                <div className="hf-aa-banner-sub">
                  Something went wrong — please try again in a moment.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hf-aa-footer">
        <div className="hf-aa-footer-note">
          {hasFieldError ? (
            <span className="hf-aa-footer-err">
              <Icon name="alert" size={13} stroke={2} />
              Fix the field above, then save again.
            </span>
          ) : (
            <>
              Fields marked <span className="hf-field-req">*</span> are required
            </>
          )}
        </div>
        <div className="hf-aa-footer-actions">
          <button
            type="button"
            className="hf-btn hf-btn-secondary hf-btn-lg"
            disabled={mutation.isPending}
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="hf-btn hf-btn-primary hf-btn-lg"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <span className="pe-btn-spinner" />
                Saving…
              </>
            ) : (
              <>
                <Icon name="check" size={15} stroke={2.2} color="white" />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>

      <HFBottomNav />
    </form>
  );
}