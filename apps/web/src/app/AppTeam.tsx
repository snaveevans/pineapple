import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { createTeam, getMyTeam, teamQueryKey, type Team } from "../api/teams";
import { ApiError } from "../api/client";
import { Icon } from "../design/Icon";
import { paths } from "../routes";
import { HFTopBar, HFBottomNav } from "./AppChrome";
import { profileAvatarInitial } from "./profilePresentation";
import {
  DISPLAY_NAME_MAX_LENGTH,
  toTeamFormError,
  validateTeamName,
  TEAM_NAME_REQUIRED_MESSAGE,
  TEAM_NAME_TOO_LONG_MESSAGE,
  type TeamNameFieldError,
} from "./teamForm";

import "../design/styles/hifi.css";
import "./styles/team.css";

function TeamLoading() {
  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />
      <div className="hf-aa-body">
        <div className="hf-aa-col tm-col">
          <p className="pe-field-sub">Loading…</p>
        </div>
      </div>
      <HFBottomNav />
    </div>
  );
}

function CreateTeamForm({ onCreated }: { onCreated: (team: Team) => void }) {
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<TeamNameFieldError | null>(null);
  const [apiError, setApiError] = useState(false);
  const [conflictError, setConflictError] = useState(false);

  const mutation = useMutation({
    mutationFn: (teamName: string) => createTeam(teamName),
    onSuccess: (team) => {
      setFieldError(null);
      setApiError(false);
      setConflictError(false);
      onCreated(team);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) return;
      if (error instanceof ApiError && error.status === 409) {
        setConflictError(true);
        setApiError(false);
        setFieldError(null);
        return;
      }
      const mapped = error instanceof ApiError ? toTeamFormError(error) : null;
      if (mapped) {
        setFieldError(mapped);
        setApiError(false);
      } else {
        setApiError(true);
      }
      setConflictError(false);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateTeamName(name);
    if (!result.ok) {
      setFieldError(result.error);
      setApiError(false);
      setConflictError(false);
      return;
    }
    setFieldError(null);
    setApiError(false);
    setConflictError(false);
    mutation.mutate(result.value);
  };

  const hasFieldError = fieldError !== null;
  const charCount = name.length;

  return (
    <form className="tm-create" onSubmit={handleSubmit} noValidate>
      <div className="tm-create-icon">
        <Icon name="grid" size={28} stroke={1.5} />
      </div>
      <h2>Start a team</h2>
      <p className="tm-create-sub">
        A team is a shared space for you and a teammate to manage assets together. You can share
        individual assets with your team once it's created.
      </p>

      <div className={`hf-field${hasFieldError ? " has-error" : ""}`}>
        <label className="hf-field-label" htmlFor="tm-name-input">
          Team name
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
          id="tm-name-input"
          className={`hf-input${hasFieldError ? " is-invalid" : ""}`}
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (fieldError) setFieldError(null);
            if (apiError) setApiError(false);
            if (conflictError) setConflictError(false);
          }}
          placeholder="e.g. Field Ops"
          disabled={mutation.isPending}
          autoFocus
        />
        {hasFieldError ? (
          <span className="hf-field-error" role="alert">
            <Icon name="alert" size={12} stroke={2} />
            {fieldError === "empty" ? TEAM_NAME_REQUIRED_MESSAGE : TEAM_NAME_TOO_LONG_MESSAGE}
          </span>
        ) : (
          <span className="pe-field-sub">
            Choose a name for your team. You can share assets with your team once it's created.
          </span>
        )}
      </div>

      {conflictError && (
        <div className="hf-aa-banner is-error" role="alert">
          <span className="hf-aa-banner-icon">
            <Icon name="alert" size={15} stroke={2} />
          </span>
          <div className="hf-aa-banner-text">
            <div className="hf-aa-banner-title">You already belong to a team</div>
            <div className="hf-aa-banner-sub">
              You can only be in one team at a time. Your team is shown above.
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
            <div className="hf-aa-banner-title">Team could not be created</div>
            <div className="hf-aa-banner-sub">Something went wrong — please try again in a moment.</div>
          </div>
        </div>
      )}

      <div className="tm-create-actions">
        <button
          type="submit"
          className="hf-btn hf-btn-primary hf-btn-lg"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <span className="pe-btn-spinner" />
              Creating…
            </>
          ) : (
            <>
              <Icon name="plus" size={15} stroke={2.2} color="white" />
              Create team
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function TeamDetails({ team }: { team: Team }) {
  return (
    <div className="tm-details">
      <div className="tm-details-head">
        <div className="tm-details-icon">
          <Icon name="grid" size={24} stroke={1.5} />
        </div>
        <div className="tm-details-info">
          <h2>{team.name}</h2>
          <p className="tm-details-sub">
            {team.members.length} {team.members.length === 1 ? "member" : "members"}
          </p>
        </div>
      </div>

      <div className="tm-members">
        {team.members.map((member) => (
          <div key={member.userId} className="tm-member">
            <div className="tm-member-avatar">{profileAvatarInitial(member.name)}</div>
            <div className="tm-member-info">
              <div className="tm-member-name">{member.name}</div>
              <div className="tm-member-role">
                {member.role === "owner" ? "Owner" : "Member"}
              </div>
            </div>
            {member.role === "owner" && (
              <span className="tm-member-badge">Owner</span>
            )}
          </div>
        ))}
      </div>

      <div className="tm-info-note">
        <Icon name="info" size={14} stroke={1.75} />
        <span>
          Inviting teammates and managing membership will be available in a future update. For now,
          you can share individual assets to this team once that feature lands.
        </span>
      </div>
    </div>
  );
}

export function AppTeam() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: teamQueryKey,
    queryFn: getMyTeam,
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
    document.title = "FieldOps — Team";
  }, []);

  const handleCreated = async (team: Team) => {
    await queryClient.setQueryData(teamQueryKey, { team });
  };

  if (isLoading) {
    return <TeamLoading />;
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="hf hf-app hf-aa-page">
        <HFTopBar />
        <div className="hf-aa-body">
          <p className="pe-field-sub">Redirecting to sign in…</p>
        </div>
        <HFBottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="hf hf-app hf-aa-page">
        <HFTopBar />
        <div className="hf-aa-body">
          <div className="hf-aa-col tm-col">
            <div className="hf-aa-banner is-error" role="alert">
              <span className="hf-aa-banner-icon">
                <Icon name="alert" size={15} stroke={2} />
              </span>
              <div className="hf-aa-banner-text">
                <div className="hf-aa-banner-title">Could not load your team</div>
                <div className="hf-aa-banner-sub">
                  {error.message || "Something went wrong — please try again in a moment."}
                </div>
              </div>
            </div>
          </div>
        </div>
        <HFBottomNav />
      </div>
    );
  }

  const team = data?.team ?? null;

  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />

      <div className="hf-aa-crumb">
        <Link to={paths.profile}>Profile</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">Team</span>
      </div>

      <div className="hf-aa-body">
        <div className="hf-aa-col tm-col">
          <div className="hf-aa-head">
            <h1>Team</h1>
            <p>
              {team
                ? "Your team and its members."
                : "Create a team to share assets with a teammate."}
            </p>
          </div>

          {team ? <TeamDetails team={team} /> : <CreateTeamForm onCreated={handleCreated} />}
        </div>
      </div>

      <HFBottomNav />
    </div>
  );
}
