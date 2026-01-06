# Cloud API Recommendations

This document summarizes issues discovered during API documentation testing that should be addressed in the cloud repo.

## 1. OpenAPI Spec: JobStatusResponse Status Enum Mismatch

**Location:** `cloud/services/ingest/openapi.yaml` line 3393-3396

**Issue:** The `JobStatusResponse` schema defines status enum as:
```yaml
enum: [waiting_to_dispatch, pending, in_progress, completed, error, cancelled]
```

But the actual `GetJobStatus` implementation (line 369 in `job.go`) directly casts the internal state:
```go
Status: ingest.JobStatusResponseStatus(jobEntity.Status)
```

This means the API returns raw internal states like `success`, `queued_limited`, `executing`, etc. — none of which are in the OpenAPI enum.

**Recommendation:** Either:
1. Update OpenAPI to list all actual internal states returned, OR
2. Transform the status in `GetJobStatus` using `toFilterStatus()` like `GetJobDetail` does

The latter would make both endpoints consistent, but would be a breaking change for any clients relying on the current behavior.

---

## 2. Different Status Values Between Endpoints

| Endpoint | Status for successful job | Includes outputs? |
|----------|---------------------------|-------------------|
| `GET /api/jobs/{id}` | `completed` | ✅ Yes |
| `GET /api/job/{id}/status` | `success` | ❌ No |

**Current behavior:**
- `/api/jobs/{id}` uses `toFilterStatus()` which maps `StateSuccess` → `completed`
- `/api/job/{id}/status` returns raw `jobEntity.Status` directly

The API docs use `/api/job/{id}/status` for polling (lighter weight) and check for `success` status.

---

## 3. Internal State Mapping Reference

For documentation purposes, here's how internal states map to user-friendly statuses:

### Pending States → `pending`
- `submitted`
- `queued_limited`
- `queued_waiting`
- `allocated`
- `preparing`
- `pending_execution`

### In Progress States → `in_progress`
- `executing`
- `executed`

### Success State → `completed`
- `success`

### Failed States → `failed`
- `error`
- `non_retryable_error`
- `erroring`
- `lost`

### Cancelled States → `cancelled`
- `cancelled`
- `cancel_requested`
- `cancel_pending`
- `cancelling_preparing`

---

## 4. Suggested OpenAPI Fix

If choosing to document actual behavior (option 1), update `JobStatusResponse.status` enum to:

```yaml
status:
  type: string
  enum:
    # Pending states
    - submitted
    - queued_limited
    - queued_waiting
    - allocated
    - preparing
    - pending_execution
    # In progress states
    - executing
    - executed
    # Terminal states
    - success
    - error
    - non_retryable_error
    - erroring
    - lost
    - cancelled
    - cancel_requested
    - cancel_pending
    - cancelling_preparing
  description: |
    Raw internal job state. For user-friendly status values, use GET /api/jobs/{id} instead
    which returns: pending, in_progress, completed, failed, cancelled.
```

---

## 5. Related Files

- `cloud/services/ingest/openapi.yaml` - OpenAPI spec
- `cloud/services/ingest/server/implementation/job.go` - GetJobStatus, GetJobDetail implementations
- `cloud/common/jobstate/state.go` - State definitions and groupings
