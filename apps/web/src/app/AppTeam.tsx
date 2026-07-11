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
  TEAM_NAME_REQUIRED_MESSAGE,
  TEAM_NAME_TOO_LONG_MESSAGE,
  toTeamFormError,
  validateTeamName,
  type TeamNameFieldError,
} from "./teamForm";

import "../design/styles/hifi.css";
import "../design/styles/hifi-add-asset.css";
import "./styles/team.css";

type ViewState = "loading" | "empty" | "form" | "created" | "error" | "unauthorized";

function TeamLoading() {
  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />
      <div className="hf-aa-body">
        <div className="hf-aa-col">
          <p className="hf-field-sub">Loading…</p>
        </div>
      </div>
      <HFBottomNav />
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="tm-empty tm-fade-enter">
      <div className="tm-empty-icon">
        <Icon name="grid" size={26} stroke={1.6} />
      </div>
      <div className="tm-empty-title">You don't have a team yet</div>
      <div className="tm-empty-sub">
        Create a team, then invite the one teammate you work with. You'll decide which assets to
        share — the rest stay yours alone.
      </div>
      <button className="hf-btn hf-btn-primary hf-btn-lg" onClick={onStart}>
        <Icon name="plus" size={15} stroke={2} color="white" />
        Create a team
      </button>
    </div>
  );
}

function CreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (team: Team) => void;
}) {
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
    <form className="tm-create-form" onSubmit={handleSubmit} noValidate>
      <div className="hf-aa-col tm-form-inner tm-fade-enter">
        <div className="hf-aa-section">
          <div className="hf-aa-section-head">
            <span className="hf-aa-section-title">Team details</span>
          </div>
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
              placeholder="e.g. The Ortega Household"
              disabled={mutation.isPending}
              autoFocus
              autoComplete="off"
            />
            {hasFieldError ? (
              <span className="hf-field-error" role="alert">
                <Icon name="alert" size={12} stroke={2} />
                {fieldError === "empty"
                  ? TEAM_NAME_REQUIRED_MESSAGE
                  : TEAM_NAME_TOO_LONG_MESSAGE}
              </span>
            ) : (
              <span className="hf-field-sub">
                This is what your teammate will see once you invite them.
              </span>
            )}
          </div>
        </div>

        <div className="hf-aa-next">
          <div className="hf-aa-next-icon">
            <Icon name="grid" size={16} stroke={1.75} />
          </div>
          <div className="hf-aa-next-text">
            <div className="hf-aa-next-title">Invites and sharing come next</div>
            <div className="hf-aa-next-sub">
              Creating a team just sets its name and makes you the owner. Inviting your teammate and
              choosing which assets to share are the next steps, right here on this page.
            </div>
          </div>
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
              <div className="hf-aa-banner-sub">
                Something went wrong — please try again in a moment.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hf-aa-footer">
        <div className="hf-aa-footer-note">
          {hasFieldError ? (
            <span className="hf-aa-footer-err">
              <Icon name="alert" size={13} stroke={2} />
              Fix the field above, then try again.
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
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className="hf-btn hf-btn-primary hf-btn-lg" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <span className="pe-btn-spinner" />
                Creating…
              </>
            ) : (
              <>
                <Icon name="check" size={15} stroke={2.2} color="white" />
                Create team
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function CreatedState({ team, currentUserId }: { team: Team; currentUserId: string }) {
  const memberCount = team.members.length;
  const createdDate = new Date(team.createdAt);
  const isToday = new Date().toDateString() === createdDate.toDateString();
  const createdLabel = isToday ? "today" : createdDate.toLocaleDateString();

  return (
    <div className="hf-aa-col tm-form-inner tm-fade-enter">
      <div className="hf-aa-banner is-ok">
        <span className="hf-aa-banner-icon">
          <Icon name="check" size={15} stroke={2.5} />
        </span>
        <div className="hf-aa-banner-text">
          <div className="hf-aa-banner-title">Team created</div>
          <div className="hf-aa-banner-sub">
            You're the owner. Invite your teammate whenever you're ready.
          </div>
        </div>
      </div>

      <div className="tm-identity">
        <div className="tm-team-mark">
          <Icon name="grid" size={22} stroke={1.6} />
        </div>
        <div className="tm-identity-info">
          <div className="tm-identity-name">{team.name}</div>
          <div className="tm-identity-meta">
            Created {createdLabel} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </div>
        </div>
      </div>

      <div className="hf-aa-section">
        <div className="hf-aa-section-head">
          <span className="hf-aa-section-title">Members</span>
        </div>
        <div className="tm-members">
          {team.members.map((member) => (
            <div key={member.userId} className="tm-member-row">
              <div className="tm-member-avatar">{profileAvatarInitial(member.name)}</div>
              <div className="tm-member-info">
                <div className="tm-member-name">
                  {member.name}
                  {member.userId === currentUserId ? " (you)" : ""}
                </div>
              </div>
              <span className="tm-role-pill">
                {member.role === "owner" ? "Owner" : "Member"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="hf-aa-section">
        <div className="hf-aa-section-head">
          <span className="hf-aa-section-title">Invite a teammate</span>
        </div>
        <div className="tm-invite-row">
          <div className="tm-invite-text">
            <div className="tm-invite-title">Bring in your one teammate</div>
            <div className="tm-invite-sub">
              Invite links, roles, and per-asset sharing are landing here next.
            </div>
          </div>
          <span className="tm-soon-badge">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

export function AppTeam() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>("loading");
  const [createdTeam, setCreatedTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: teamQueryKey,
    queryFn: getMyTeam,
    retry: (failureCount, queryError) => {
      if (queryError instanceof ApiError && queryError.status === 401) return false;
      return failureCount < 1;
    },
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (isLoading) {
      setView("loading");
      return;
    }
    if (error instanceof ApiError && error.status === 401) {
      setView("unauthorized");
      void navigate(paths.login(), { replace: true });
      return;
    }
    if (error) {
      setView("error");
      return;
    }
    if (data?.viewerUserId) {
      setCurrentUserId(data.viewerUserId);
    }
    if (data?.team) {
      setCreatedTeam(data.team);
      setView("created");
      return;
    }
    if (view !== "form") {
      setView("empty");
    }
  }, [data, isLoading, error, navigate, view]);

  useEffect(() => {
    document.title = "FieldOps — My team";
  }, []);

  const handleCreated = async (team: Team) => {
    const viewerUserId = team.ownerId;
    await queryClient.setQueryData(teamQueryKey, { team, viewerUserId });
    setCurrentUserId(viewerUserId);
    setCreatedTeam(team);
    setView("created");
  };

  if (view === "loading") {
    return <TeamLoading />;
  }

  return (
    <div className="hf hf-app hf-aa-page">
      <HFTopBar />

      <div className="hf-aa-crumb">
        <Link to={paths.appHome}>Dashboard</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <Link to={paths.profile}>Profile</Link>
        <span className="hf-aa-crumb-sep">
          <Icon name="chevron-right" size={13} />
        </span>
        <span className="hf-aa-crumb-here">My team</span>
      </div>

      <div className="hf-aa-body">
        <div className="hf-aa-col">
          <div className="hf-aa-head">
            <h1>My team</h1>
            <p>
              Share select assets with one teammate. Nothing changes until you choose to share
              something — everything you own stays personal by default.
            </p>
          </div>

          {view === "empty" && <EmptyState onStart={() => setView("form")} />}

          {view === "form" && (
            <CreateForm onCancel={() => setView("empty")} onCreated={handleCreated} />
          )}

          {view === "created" && createdTeam && currentUserId && (
            <CreatedState team={createdTeam} currentUserId={currentUserId} />
          )}

          {view === "error" && (
            <div className="hf-aa-banner is-error" role="alert">
              <span className="hf-aa-banner-icon">
                <Icon name="alert" size={15} stroke={2} />
              </span>
              <div className="hf-aa-banner-text">
                <div className="hf-aa-banner-title">Could not load your team</div>
                <div className="hf-aa-banner-sub">
                  {error instanceof Error
                    ? error.message
                    : "Something went wrong — please try again in a moment."}
                </div>
              </div>
            </div>
          )}

          {view === "unauthorized" && (
            <p className="hf-field-sub">Redirecting to sign in…</p>
          )}
        </div>
      </div>

      {view !== "form" && <HFBottomNav />}
    </div>
  );
}
