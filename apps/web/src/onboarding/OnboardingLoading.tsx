import "../auth/styles/auth.css";
import "./styles/onboarding.css";

export function OnboardingLoading() {
  return (
    <div className="ob-loading">
      <div className="ob-loading-spinner" />
      <p className="ob-loading-text">Loading your profile…</p>
    </div>
  );
}
