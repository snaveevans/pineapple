// Generated from docs/reference/openapi.json — do not edit by hand.
// Regenerate with: pnpm --filter @snaveevans/pineapple-web api:types
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health check
         * @description Reports the deployed Worker version, the latest applied D1 migration, and a D1 round-trip result. No authentication. Exposes no configuration values.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service is healthy and D1 is reachable */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Health"];
                    };
                };
                /** @description D1 is unreachable */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Health"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List my assets
         * @description Returns the caller's active (non-archived) assets — owned and shared with their team — and category counts over that set. Each asset includes a computed `sharing` descriptor.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's visible assets */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AssetListResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /** Create an asset */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateAssetBody"];
                };
            };
            responses: {
                /** @description Asset created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreatedAsset"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get an asset by id
         * @description Returns an asset the caller owns or that is shared with their team, including a computed `sharing` descriptor.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The asset */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Asset"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset is not visible to the caller */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search my assets
         * @description Returns up to 20 active assets visible to the caller (owned or shared with their team) that match the free-text query. Each result includes a computed `sharing` descriptor.
         */
        get: {
            parameters: {
                query: {
                    q: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Matching assets */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SearchAssetsResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Unexpected server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{assetId}/maintenance-records": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List maintenance records for an asset
         * @description Returns records newest first by performed date, then creation time. Archived asset history remains readable.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The asset's maintenance records */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaintenanceRecordListResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset belongs to another user */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /** Create a maintenance record */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateMaintenanceRecordBody"];
                };
            };
            responses: {
                /** @description Maintenance record created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaintenanceRecord"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset belongs to another user */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset is archived */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{assetId}/maintenance-tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List maintenance tasks for an asset
         * @description Returns tasks ordered by nextDue ascending (soonest due first). Archived asset tasks remain readable.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The asset's maintenance tasks */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaintenanceTaskListResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset belongs to another user */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        /** Create a maintenance task */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateMaintenanceTaskBody"];
                };
            };
            responses: {
                /** @description Maintenance task created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MaintenanceTask"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset belongs to another user */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The asset is archived */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{assetId}/maintenance-tasks/{taskId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a maintenance task
         * @description Permanently removes the task. Linked maintenance records are preserved with taskId set to null.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                    taskId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Task deleted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description The task belongs to another user */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such task */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get my dashboard
         * @description Returns fleet totals, maintenance health counts, and the cross-asset maintenance queue for the authenticated user in a single response.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's dashboard read model */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DashboardResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List my activity history
         * @description Returns the caller's durable cross-asset activity feed with server-side filters and cursor pagination.
         */
        get: {
            parameters: {
                query?: {
                    type?: "asset_added" | "maintenance_logged" | "task_completed" | "task_scheduled" | "task_deleted";
                    assetId?: string;
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's activity read model */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ActivityResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get my profile
         * @description Returns the authenticated domain user's profile, including email, display name, and onboarding state.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's profile */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserProfile"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update my profile
         * @description Updates the caller's display name. Completes onboarding on the first successful update.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UpdateUserProfileBody"];
                };
            };
            responses: {
                /** @description Updated profile */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserProfile"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/users/me/notification-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set my contact / notification email
         * @description Stores the caller's contact email. When it matches the provider-verified auth email it is stored verified immediately; otherwise it is stored unverified and a verification email is requested. Returns the updated profile.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SetNotificationEmailBody"];
                };
            };
            responses: {
                /** @description Updated profile */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserProfile"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Verification send rejected by a rate limit */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Remove my contact / notification email
         * @description Clears the caller's contact email and its verified state. Idempotent: succeeds with the unchanged profile when none is set. Returns the updated profile.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Updated profile */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserProfile"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/notification-email/verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resend my contact-email verification
         * @description Requests a fresh verification email for the caller's current, still-unverified contact email. Subject to per-address cooldown and per-address / per-user daily caps.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Verification send accepted */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RequestEmailVerificationResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No contact email is set to verify */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Rejected by a verification-send rate limit */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm a contact-email verification token
         * @description Public, session-optional endpoint that confirms a verification token from the emailed link. Returns a generic `invalid` outcome for any unknown, expired, used, superseded, or address-changed token without revealing which case applied.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ConfirmEmailVerificationBody"];
                };
            };
            responses: {
                /** @description Confirmation outcome */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConfirmEmailVerificationResponse"];
                    };
                };
                /** @description Malformed request body */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List my notifications
         * @description Returns the caller's durable notification inbox with unread count and cursor pagination. Rows include self-contained asset and task snapshots.
         */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's notification inbox */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationListResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/{notificationId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark one notification read
         * @description Marks a single caller-owned notification read and returns the updated notification. Unknown or foreign ids return 404.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    notificationId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Updated notification */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Notification"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such caller-owned notification */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mark all my notifications read
         * @description Marks all unread notifications owned by the caller read and returns unreadCount.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unread count after marking all read */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MarkAllNotificationsReadResponse"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/teams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a team
         * @description Creates a team with the caller as owner and sole member. Fails with 409 if the caller already belongs to a team.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateTeamBody"];
                };
            };
            responses: {
                /** @description Team created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Team"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Caller already belongs to a team */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Validation failed */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/teams/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get my team
         * @description Returns the caller's team with its members, or an explicit null when the caller has no team.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's team, or null */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MyTeam"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{assetId}/share": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Share an asset to my team
         * @description Shares the asset to the caller's team. Asset-owner only. Idempotent when already shared to that team.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Asset shared (or already shared) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Asset"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Caller is not the asset owner */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Caller does not belong to a team */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        /**
         * Unshare an asset
         * @description Returns the asset to personal. Asset-owner only. Idempotent when already personal.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    assetId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Asset unshared (or already personal) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Asset"];
                    };
                };
                /** @description Not authenticated */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Caller is not the asset owner */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description No such asset */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Health: {
            /**
             * @description `ok` when D1 answered; `error` (with a 503) when it did not
             * @enum {string}
             */
            status: "ok" | "error";
            /**
             * @description Identifier of the deployed Worker version serving this request
             * @example 8c4c9a2e-1f3b-4d5e-9a6b-2c7d8e9f0a1b
             */
            version: string;
            /**
             * @description Filename of the latest applied D1 migration; null when no migration state is recorded (database never migrated) or when D1 is unreachable — `database` distinguishes the two
             * @example 0015_activity_actor_display_name.sql
             */
            latestMigration: string | null;
            /**
             * @description Result of a D1 round trip
             * @enum {string}
             */
            database: "reachable" | "unreachable";
        };
        CreatedAsset: {
            /** @example 195d0ef0-47f5-439f-abfd-29f892c9a040 */
            id: string;
        };
        Error: {
            /** @example Asset not found */
            error: string;
            /** @example metadata.year */
            field?: string;
        };
        CreateAssetBody: {
            /** @example My Truck */
            name: string;
            metadata: components["schemas"]["AssetMetadata"];
        };
        AssetMetadata: components["schemas"]["VehicleMetadata"] | components["schemas"]["PropertyMetadata"] | components["schemas"]["EquipmentMetadata"];
        VehicleMetadata: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "vehicle";
            /** @example Ram */
            make: string;
            /** @example 2500 */
            model: string;
            /** @example 2016 */
            year: number;
            /** @example 1C6RR7LT4GS123456 */
            vin?: string;
        };
        PropertyMetadata: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "property";
            /** @example Lake cabin */
            nickname?: string;
            address: components["schemas"]["Address"];
        };
        Address: {
            street: string;
            city: string;
            state: string;
            postalCode: string;
            country: string;
        };
        EquipmentMetadata: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "equipment";
            /** @example Honda */
            manufacturer?: string;
            /** @example EU2200i */
            modelNumber?: string;
            /** @example EAMT-1234567 */
            serialNumber?: string;
        };
        AssetListResponse: {
            assets: components["schemas"]["Asset"][];
            counts: components["schemas"]["AssetCategoryCounts"];
        };
        Asset: {
            /** @example 195d0ef0-47f5-439f-abfd-29f892c9a040 */
            id: string;
            /** @example My Truck */
            name: string;
            /**
             * @example vehicle
             * @enum {string}
             */
            type: "vehicle" | "property" | "equipment";
            metadata: components["schemas"]["AssetMetadata"];
            /**
             * Format: date-time
             * @example null
             */
            archivedAt: string | null;
            /**
             * Format: date-time
             * @example 2026-05-29T03:25:24.887Z
             */
            createdAt: string;
            /**
             * Format: date-time
             * @example 2026-05-29T03:25:24.887Z
             */
            updatedAt: string;
            sharing: components["schemas"]["AssetSharing"];
        };
        AssetSharing: {
            /**
             * @example personal
             * @enum {string}
             */
            scope: "personal" | "team";
            /** @example true */
            isOwner: boolean;
            /** @example Dale */
            ownerDisplayName?: string;
        };
        AssetCategoryCounts: {
            /** @example 6 */
            all: number;
            /** @example 1 */
            vehicle: number;
            /** @example 1 */
            property: number;
            /** @example 1 */
            equipment: number;
        };
        SearchAssetsResponse: {
            results: components["schemas"]["SearchResult"][];
        };
        SearchResult: {
            /** @example 195d0ef0-47f5-439f-abfd-29f892c9a040 */
            id: string;
            /** @example My Truck */
            name: string;
            /**
             * @example vehicle
             * @enum {string}
             */
            type: "vehicle" | "property" | "equipment";
            /** @example 2016 Ram 2500 */
            summary: string;
            sharing: components["schemas"]["AssetSharing"];
        };
        MaintenanceRecord: {
            /**
             * Format: uuid
             * @example e914b960-772f-46a7-b6fb-f333dcfc7fc9
             */
            id: string;
            /**
             * Format: uuid
             * @example 195d0ef0-47f5-439f-abfd-29f892c9a040
             */
            assetId: string;
            /** @example Changed oil */
            title: string;
            /**
             * Format: date
             * @example 2026-06-09
             */
            performedAt: string;
            /** @example Used 7 quarts of synthetic oil. */
            notes: string | null;
            /**
             * Format: uuid
             * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
             */
            taskId: string | null;
            /**
             * Format: date-time
             * @example 2026-06-09T18:25:24.887Z
             */
            createdAt: string;
        };
        CreateMaintenanceRecordBody: {
            /** @example Changed oil */
            title: string;
            /**
             * Format: date
             * @example 2026-06-09
             */
            performedAt: string;
            /** @example Used 7 quarts of 5W-20 synthetic oil. */
            notes?: string;
            /**
             * Format: uuid
             * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
             */
            taskId?: string;
        };
        MaintenanceRecordListResponse: {
            maintenanceRecords: components["schemas"]["MaintenanceRecord"][];
        };
        MaintenanceTask: {
            /**
             * Format: uuid
             * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
             */
            id: string;
            /**
             * Format: uuid
             * @example 195d0ef0-47f5-439f-abfd-29f892c9a040
             */
            assetId: string;
            /** @example Replace furnace filter */
            title: string;
            /** @example 2 */
            intervalValue: number;
            /**
             * @example month
             * @enum {string}
             */
            intervalUnit: "day" | "week" | "month" | "year";
            /**
             * Format: date
             * @example 2026-04-11
             */
            lastCompletedDate: string | null;
            /**
             * Format: date
             * @example 2026-06-11
             */
            nextDue: string;
            /**
             * @description Derived from nextDue and todayUtc using calendar-day rules
             * @example soon
             * @enum {string}
             */
            status: "overdue" | "soon" | "ok";
            /**
             * @description Signed calendar-day distance from todayUtc to nextDue; negative means overdue
             * @example 5
             */
            daysDue: number;
            /**
             * Format: date-time
             * @example 2026-06-11T18:25:24.887Z
             */
            createdAt: string;
        };
        CreateMaintenanceTaskBody: {
            /** @example Replace furnace filter */
            title: string;
            /** @example 2 */
            intervalValue: number;
            /**
             * @example month
             * @enum {string}
             */
            intervalUnit: "day" | "week" | "month" | "year";
            /**
             * Format: date
             * @example 2026-04-11
             */
            lastCompletedDate?: string;
        };
        MaintenanceTaskListResponse: {
            maintenanceTasks: components["schemas"]["MaintenanceTask"][];
        };
        DashboardResponse: {
            /**
             * @description Authenticated user's display name when available
             * @example Dale
             */
            viewerDisplayName: string | null;
            /**
             * Format: date
             * @description Server-side UTC calendar date used for urgency calculations
             * @example 2026-06-16
             */
            todayUtc: string;
            fleetTotals: components["schemas"]["DashboardFleetTotals"];
            fleetHealth: components["schemas"]["DashboardFleetHealth"];
            queueCountsByCategory: components["schemas"]["DashboardQueueCounts"];
            queue: components["schemas"]["DashboardQueueItem"][];
        };
        DashboardFleetTotals: {
            /** @example 6 */
            total: number;
            /** @example 2 */
            vehicle: number;
            /** @example 2 */
            equipment: number;
            /** @example 2 */
            property: number;
        };
        DashboardFleetHealth: {
            /** @example 1 */
            overdue: number;
            /** @example 2 */
            soon: number;
            /** @example 2 */
            onTrack: number;
            /** @example 1 */
            unscheduled: number;
        };
        DashboardQueueCounts: {
            /** @example 5 */
            all: number;
            /** @example 2 */
            vehicle: number;
            /** @example 2 */
            equipment: number;
            /** @example 1 */
            property: number;
        };
        DashboardQueueItem: {
            /**
             * Format: uuid
             * @example a1b2c3d4-e5f6-7890-abcd-ef1234567890
             */
            taskId: string;
            /** @example Oil change + tire rotation */
            taskTitle: string;
            /**
             * Format: date
             * @example 2026-06-09
             */
            nextDue: string;
            /**
             * @description Derived from nextDue and todayUtc using calendar-day rules
             * @example soon
             * @enum {string}
             */
            status: "overdue" | "soon" | "ok";
            /**
             * @description Signed calendar-day distance from todayUtc to nextDue; negative means overdue
             * @example -3
             */
            daysDue: number;
            /** @example 3 */
            intervalValue: number;
            /**
             * @example month
             * @enum {string}
             */
            intervalUnit: "day" | "week" | "month" | "year";
            /**
             * Format: date
             * @example 2026-03-14
             */
            lastCompletedDate: string | null;
            /**
             * Format: date-time
             * @example 2026-01-15T12:00:00.000Z
             */
            createdAt: string;
            /**
             * Format: uuid
             * @example 195d0ef0-47f5-439f-abfd-29f892c9a040
             */
            assetId: string;
            /** @example Ford F-150 · Truck #4 */
            assetName: string;
            /**
             * @example vehicle
             * @enum {string}
             */
            assetType: "vehicle" | "property" | "equipment";
            sharing: components["schemas"]["AssetSharing"];
        };
        ActivityResponse: {
            /**
             * Format: uuid
             * @description Caller's domain user id for attributing 'you' vs teammate in the client
             * @example 7d914909-c903-41a4-a13a-82cbd0f61851
             */
            viewerUserId: string;
            entries: components["schemas"]["ActivityEntry"][];
            availableFilters: components["schemas"]["ActivityAvailableFilters"];
            /** @example null */
            nextCursor: string | null;
        };
        ActivityEntry: {
            /**
             * Format: uuid
             * @example d5b3b826-2d77-494a-b99d-0d9fcf7c47c0
             */
            id: string;
            /**
             * @example maintenance_logged
             * @enum {string}
             */
            type: "asset_added" | "maintenance_logged" | "task_completed" | "task_scheduled" | "task_deleted";
            /**
             * Format: date-time
             * @example 2026-06-09T18:25:24.887Z
             */
            occurredAt: string;
            asset: components["schemas"]["ActivityAssetSnapshot"];
            actor: components["schemas"]["ActivityActorSnapshot"];
            /** @example Changed oil */
            title?: string;
            /**
             * Format: date
             * @example 2026-06-09
             */
            performedAt?: string;
        };
        ActivityAssetSnapshot: {
            /**
             * Format: uuid
             * @example 195d0ef0-47f5-439f-abfd-29f892c9a040
             */
            id: string;
            /** @example My Truck */
            name: string;
            /**
             * @example vehicle
             * @enum {string}
             */
            type: "vehicle" | "property" | "equipment";
        };
        ActivityActorSnapshot: {
            /**
             * Format: uuid
             * @description Stable acting-user id (never an email or auth-provider identifier)
             * @example 71afbc20-f2e0-4fc8-a989-278437cf792c
             */
            id: string;
            /**
             * @description Display-name snapshot of the actor at the time of the action
             * @example Pat Rivera
             */
            displayName: string;
        };
        ActivityAvailableFilters: {
            types: components["schemas"]["ActivityTypeFilter"][];
            assets: components["schemas"]["ActivityAssetFilter"][];
        };
        ActivityTypeFilter: {
            /**
             * @example maintenance_logged
             * @enum {string}
             */
            type: "asset_added" | "maintenance_logged" | "task_completed" | "task_scheduled" | "task_deleted";
            /** @example 4 */
            count: number;
        };
        ActivityAssetFilter: {
            asset: components["schemas"]["ActivityAssetSnapshot"];
            /** @example 6 */
            count: number;
        };
        UserProfile: {
            /**
             * Format: email
             * @example dale@example.com
             */
            email: string;
            /** @example Dale */
            name: string | null;
            /**
             * Format: date-time
             * @example 2026-06-11T12:00:00.000Z
             */
            onboardingCompletedAt: string | null;
            /**
             * Format: email
             * @description User-controlled contact email reminders may be sent to. Null when unset; distinct from the read-only provider auth email.
             * @example contact@example.com
             */
            notificationEmail: string | null;
            /**
             * @description Whether the contact email is verified. Reminder emails are only delivered when true.
             * @example false
             */
            notificationEmailVerified: boolean;
        };
        UpdateUserProfileBody: {
            /** @example DIYer Dale */
            name: string;
        };
        SetNotificationEmailBody: {
            /**
             * Format: email
             * @example contact@example.com
             */
            email: string;
        };
        RequestEmailVerificationResponse: {
            /**
             * @example accepted
             * @enum {string}
             */
            status: "accepted";
        };
        ConfirmEmailVerificationResponse: {
            /**
             * @description `verified` when the address is now confirmed; `invalid` is the single non-leaking outcome for any unknown, expired, used, superseded, or address-changed token.
             * @example verified
             * @enum {string}
             */
            status: "verified" | "invalid";
        };
        ConfirmEmailVerificationBody: {
            /** @example kQ8s2f...opaque-token */
            token: string;
        };
        NotificationListResponse: {
            notifications: components["schemas"]["Notification"][];
            /** @example 2 */
            unreadCount: number;
            /** @example null */
            nextCursor: string | null;
        };
        Notification: {
            /**
             * Format: uuid
             * @example d5b3b826-2d77-494a-b99d-0d9fcf7c47c0
             */
            id: string;
            /**
             * @example maintenance_due_soon
             * @enum {string}
             */
            type: "maintenance_due_soon";
            /**
             * Format: date-time
             * @example 2026-07-13T00:00:00.000Z
             */
            createdAt: string;
            /**
             * Format: date-time
             * @example null
             */
            readAt: string | null;
            asset: components["schemas"]["NotificationAssetSnapshot"];
            task: components["schemas"]["NotificationTaskSnapshot"];
        };
        NotificationAssetSnapshot: {
            /**
             * Format: uuid
             * @example 195d0ef0-47f5-439f-abfd-29f892c9a040
             */
            id: string;
            /** @example My Truck */
            name: string;
            /**
             * @example vehicle
             * @enum {string}
             */
            type: "vehicle" | "property" | "equipment";
        };
        NotificationTaskSnapshot: {
            /**
             * Format: uuid
             * @example a1b2c3d4-e5f6-4890-abcd-ef1234567890
             */
            id: string;
            /** @example Oil change */
            title: string;
            /**
             * Format: date
             * @example 2026-07-20
             */
            nextDue: string;
        };
        MarkAllNotificationsReadResponse: {
            /** @example 0 */
            unreadCount: number;
        };
        Team: {
            /** @example aaa11100-0000-0000-0000-000000000001 */
            id: string;
            /** @example Field Ops */
            name: string;
            /** @example 7d914909-c903-41a4-a13a-82cbd0f61851 */
            ownerId: string;
            members: components["schemas"]["TeamMember"][];
            /**
             * Format: date-time
             * @example 2026-07-10T12:00:00.000Z
             */
            createdAt: string;
        };
        TeamMember: {
            /** @example 7d914909-c903-41a4-a13a-82cbd0f61851 */
            userId: string;
            /** @example Dale */
            name: string;
            /**
             * @example owner
             * @enum {string}
             */
            role: "owner" | "member";
        };
        CreateTeamBody: {
            /** @example Field Ops */
            name: string;
        };
        MyTeam: {
            team: components["schemas"]["Team"] | null;
            /**
             * @description The authenticated caller's user id (for client-side 'you' labels).
             * @example 7d914909-c903-41a4-a13a-82cbd0f61851
             */
            viewerUserId: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
