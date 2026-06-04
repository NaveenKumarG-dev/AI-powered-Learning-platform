# Authentication Error Handling - Test Plan & Verification Guide

## Overview
This document provides comprehensive testing procedures for the authentication error handling fixes implemented across the frontend and backend.

---

## Test Environment Setup

### Frontend Requirements
- Run: `cd frontend && npm run dev`
- Browser DevTools open (F12) to view console logs
- Network tab active to monitor requests

### Backend Requirements
- Run: `python manage.py runserver`
- Ensure Django settings.py has:
  - `DEBUG = True` (for development)
  - CORS properly configured
  - `ALLOWED_HOSTS` includes localhost

---

## Test Scenario 1: Invalid Email/Username

### Test Steps
1. Navigate to login page
2. Enter non-existent email: `nonexistent@example.com`
3. Enter any password: `password123`
4. Click Login

### Expected Results
✅ **User-Facing:**
- Red error alert appears below form title
- Message: "Invalid email/username or password. Please check your email/username and password."
- Login button returns to normal state
- User remains on login page

✅ **Console Logs (F12 → Console):**
```
[AUTH ERROR] {
  timestamp: "2026-06-04T...",
  error: {...},
  type: "AxiosError",
  message: "Request failed with status code 401",
  status: 401
}
```

---

## Test Scenario 2: Wrong Password

### Test Steps
1. Create test account: `test@example.com` / `TestPassword123`
2. Navigate to login page
3. Enter correct email: `test@example.com`
4. Enter wrong password: `WrongPassword123`
5. Click Login

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Invalid email/username or password. Please check your email/username and password."
- Submit button briefly shows "Logging in..." with spinner
- Error message is dismissible (X button in top right of alert)

✅ **Behavior:**
- User can retry login with different password
- No page redirect
- Error state clears when user starts typing again (optional enhancement)

---

## Test Scenario 3: Missing Required Fields

### Test Steps
1. Navigate to login page
2. Leave email field empty
3. Leave password field empty
4. Click Login

### Expected Results
✅ **User-Facing:**
- Browser default HTML5 validation shows ("Please fill out this field")
- No request sent to backend

### Test Steps (Backend Validation)
1. Use browser DevTools Network tab to send raw POST to `/auth/login/`
2. Send: `POST /auth/login/` with empty JSON `{}`

### Expected Results
✅ **User-Facing:**
- Error alert shows: "Bad request. Please check your input and try again."
- Additional field errors: "Email: This field is required."

---

## Test Scenario 4: Network Error (Server Offline)

### Test Steps
1. Start with frontend and backend running
2. Stop backend server (Ctrl+C)
3. Navigate to login page
4. Enter valid credentials
5. Click Login immediately (before backend restart)

### Expected Results
✅ **User-Facing:**
- Red error alert appears after ~30 seconds (timeout)
- Message: "Unable to connect to the server. Please check your internet connection."
- Loading spinner stops
- User can retry

✅ **Console Logs:**
```
[NETWORK ERROR] {
  timestamp: "...",
  message: "Network Error",
  code: "ERR_NETWORK"
}
```

---

## Test Scenario 5: Request Timeout

### Test Steps
1. Add artificial delay in backend (optional):
   ```python
   # In views.py CustomTokenObtainPairView.post()
   import time
   time.sleep(60)  # Simulate 60 second delay
   ```
2. Navigate to login
3. Enter credentials and click Login
4. Wait for timeout (~30 seconds based on configured timeout)

### Expected Results
✅ **User-Facing:**
- After 30 seconds: Red error alert appears
- Message: "Request timed out. Please check your internet connection and try again."
- Loading state clears
- User can retry

---

## Test Scenario 6: Registration Form Validation Errors

### Test Steps
1. Navigate to Sign Up page
2. Enter:
   - First Name: `John`
   - Last Name: `Doe`
   - Email: `invalidemail`  (invalid format)
   - Password: `pass`  (too short)
   - Confirm: `pass`
3. Click Create Account

### Expected Results
✅ **User-Facing:**
- Red error alert shows multiple errors:
  - "Email: Enter a valid email address."
  - "Password: Password must be at least 8 characters long."
- Form remains on page
- User can correct and retry

---

## Test Scenario 7: Email Already Exists

### Test Steps
1. Create first account: `user@example.com` / `Password123`
2. Logout
3. Try registering again with same email
4. Fill form with new details but same email
5. Click Create Account

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Email: User with this email already exists."
- Form preserved (user doesn't lose data)
- Can try different email

---

## Test Scenario 8: Server Internal Error (500)

### Test Steps
1. Deliberately cause 500 error in backend:
   ```python
   # Temporarily in views.py
   raise Exception("Test error")
   ```
2. Try to login with valid credentials

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Internal server error. Please try again later."
- User knows it's not their fault (friendly message)

✅ **Console Logs:**
```
[AUTH ERROR] {
  timestamp: "...",
  status: 500,
  message: "..."
}
```

---

## Test Scenario 9: Rate Limiting (429)

### Test Steps
1. Modify backend to simulate rate limiting:
   ```python
   # In CustomTokenObtainPairView
   if some_condition:
       return Response(
           {"detail": "Too many login attempts"},
           status=429
       )
   ```
2. Try login multiple times rapidly

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Too many login attempts. Please wait a few minutes and try again."
- User knows they need to wait

---

## Test Scenario 10: CSRF Error (403)

### Test Steps
1. Try to login without CSRF token (if implemented)
2. Send login request missing CSRF token

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Access forbidden. You do not have permission to perform this action."
- Request rejected

---

## Test Scenario 11: Service Unavailable (503)

### Test Steps
1. Backend temporarily unavailable:
   ```bash
   # Simulate with:
   # iptables -A INPUT -p tcp --dport 8000 -j DROP
   # Then restore: iptables -D INPUT -p tcp --dport 8000 -j DROP
   ```
2. Or modify to return 503:
   ```python
   return Response({"detail": "Service temporarily unavailable"}, status=503)
   ```
3. Try to login

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Service unavailable. Please try again later."
- Can retry after service is back

---

## Test Scenario 12: Bad Gateway (502)

### Test Steps
1. If using reverse proxy (nginx/Apache), restart it incorrectly
2. Or return 502 from backend

### Expected Results
✅ **User-Facing:**
- Red error alert appears
- Message: "Bad gateway. The server is temporarily unavailable."
- User knows to wait

---

## Test Scenario 13: Expired/Invalid Token (After Login)

### Test Steps
1. Login successfully - navigate to dashboard
2. Manually clear/corrupt `access_token` in localStorage (DevTools → Application → Local Storage)
3. Try to access protected route

### Expected Results
✅ **User-Facing:**
- User redirected to login page
- (Optional) Show: "Your session has expired. Please login again."

✅ **Behavior:**
- No page flash or white screen
- Graceful redirect

---

## Test Scenario 14: Successful Login with Loading State

### Test Steps
1. Enter valid credentials
2. Click Login
3. Observe button during request

### Expected Results
✅ **User-Facing:**
- Button shows: 
  - Animated spinner icon
  - "Logging in..." text
  - Button is disabled (can't click multiple times)
- After 1-2 seconds: User redirected to dashboard
- Session stored in localStorage

✅ **Accessibility:**
- Screen readers announce "Logging in..." state
- Button aria-labels are updated

---

## Test Scenario 15: Accessibility & Error Display

### Test Steps
1. Use keyboard only (Tab, Enter)
2. Leave form empty
3. Tab to Login button
4. Press Enter

### Expected Results
✅ **Accessibility:**
- Error alert has `role="alert"` and `aria-live="polite"`
- Error message is announced to screen readers
- Focus moved to error alert (or visible focus indicator)
- Can dismiss with keyboard

✅ **Visual:**
- Error text has sufficient contrast (WCAG AA)
- Error icon clearly visible
- Button disabled state obvious

---

## Console Log Verification Checklist

When testing, open DevTools (F12) and check Console tab for appropriate error logging:

### For Invalid Credentials:
```
✓ [AUTH ERROR] logged
✓ Includes: timestamp, status: 401, message
✓ Shows full error details for debugging
```

### For Network Errors:
```
✓ [NETWORK ERROR] logged
✓ Includes: error code (ERR_NETWORK, ECONNREFUSED, etc.)
✓ Shows: timestamp, message
```

### For Timeout:
```
✓ [NETWORK TIMEOUT] logged
✓ Includes: timeout details, request info
```

### Browser Console Should Show:
```
✗ No unhandled promise rejection errors
✗ No "Uncaught TypeError" messages
✗ No undefined variable references
```

---

## UI/UX Verification Checklist

- [ ] Error messages are clear and actionable
- [ ] Error alert is visually prominent (red, good contrast)
- [ ] Loading spinner is smooth and noticeable
- [ ] Error can be dismissed with X button
- [ ] Multiple errors listed clearly (bulleted list)
- [ ] Button disabled during request (prevents double-click)
- [ ] Focus management works (tab navigation)
- [ ] Mobile responsive (test on small screen)
- [ ] Dark mode (if applicable) error alert still readable
- [ ] No console errors or warnings

---

## Automated Test Commands (Optional)

If using Jest/Vitest:

```bash
# Run error handler tests
npm test -- errorHandler.ts

# Run auth slice tests
npm test -- authSlice.ts

# Run integration tests
npm test -- auth.integration.ts
```

---

## Regression Testing

After fixes, verify these scenarios still work:

1. ✅ Successful login → redirect to dashboard
2. ✅ Successful registration → redirect to dashboard
3. ✅ OAuth login (if implemented) → no errors
4. ✅ Logout → clear localStorage, redirect to login
5. ✅ Protected routes → redirect if unauthenticated
6. ✅ Token refresh → happens automatically
7. ✅ User profile loading → no errors on authenticated pages

---

## Performance Verification

- [ ] Login request completes in < 3 seconds (on good connection)
- [ ] Error display appears instantly (no lag)
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] Network waterfall looks normal (one request, not cascading)
- [ ] No duplicate requests sent

---

## Browser Compatibility Testing

Test on:
- [ ] Chrome/Edge (Latest)
- [ ] Firefox (Latest)
- [ ] Safari (Latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

Ensure:
- [ ] Error messages display correctly
- [ ] Spinner animation is smooth
- [ ] No layout shifts
- [ ] Touch targets appropriate size

---

## Summary of Fixed Issues

| Issue | Status | Fix |
|-------|--------|-----|
| 401 redirect during login | ❌ BROKEN → ✅ FIXED | Exclude auth endpoints from redirect |
| Network errors silently fail | ❌ BROKEN → ✅ FIXED | Explicit network error handling |
| Generic "Login failed" message | ⚠️ POOR → ✅ IMPROVED | Detailed status-code mapping |
| No loading state feedback | ⚠️ MISSING → ✅ ADDED | Animated spinner + disabled button |
| Error details lost | ❌ LOST → ✅ CAPTURED | Console logging + UI display |
| Inaccessible error display | ⚠️ POOR → ✅ IMPROVED | Added ARIA labels and focus management |

