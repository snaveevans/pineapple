import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router";
import { getUserProfile, isOnboardingComplete, userProfileQueryKey } from "../api/userProfile";
import { ApiError } from "../api/client";
import { paths } from "../routes";
import { OnboardingLoading } from "./OnboardingLoading";
import { safeReturnTo } from "./returnTo";

import "../auth/styles/auth.css";

export function OnboardingGuard() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
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
    if (!profile || isLoading) return;
    if (!isOnboardingComplete(profile)) {
      const returnTo = safeReturnTo(`${location.pathname}${location.search}`);
      void navigate(paths.onboarding(returnTo), { replace: true });
    }
  }, [profile, isLoading, location.pathname, location.search, navigate]);

  if (isLoading || !profile) {
    return (
      <div className="au">
        <div className="au-form-side" style={{ minHeight: "100vh" }}>
          <OnboardingLoading />
        </div>
      </div>
    );
  }

  if (!isOnboardingComplete(profile)) {
    return null;
  }

  return <Outlet />;
}
