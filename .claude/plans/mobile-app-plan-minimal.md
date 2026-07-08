# ULAB MMS Mobile App Implementation Plan (Minimalistic)

## Executive Summary

This plan outlines the implementation of a **minimalistic native Android mobile application** for the ULAB Marks Management System. The app focuses exclusively on core marks viewing and attendance check-in functionality.

## Project Scope - MINIMALISTIC

### Target Platform
- **Native Android** using Kotlin and Jetpack Compose
- Minimum SDK: API 24 (Android 7.0)
- Target SDK: API 34 (Android 14)

### Target Users
**Students Only** - Simple, focused mobile experience

### Feature Scope
**Core Features Only**:
1. ✅ Login/Authentication
2. ✅ View my courses
3. ✅ View my marks per course
4. ✅ Attendance check-in via session code
5. ✅ View recent check-ins

### Out of Scope (Not Included)
❌ Capstone management
❌ Resources/file browsing
❌ Admin features
❌ Instructor features (mark entry, session creation)
❌ Course creation
❌ Bulk operations
❌ Notifications
❌ Offline mode (Phase 1)

## Architecture Overview

### Backend: GraphQL Layer (Simplified)

**Required Queries/Mutations Only:**

```graphql
# Authentication
mutation Login {
  login(input: { email: String!, password: String! }) {
    token
    user { id, name, email, role }
  }
}

# Student Marks
query MyMarks($courseId: ID!) {
  myMarks(courseId: $courseId) {
    examId
    examName
    mark
    maxMark
    percentage
  }
}

# Student Courses
query MyCourses {
  myCourses {
    id
    name
    code
    semester
    year
    section
  }
}

# Attendance Check-in
mutation CheckIn($sessionCode: String!) {
  checkIn(sessionCode: $sessionCode) {
    success
    message
    session {
      id
      date
      course { name }
    }
  }
}

# View Recent Check-ins
query MyRecentCheckIns {
  myRecentCheckIns(limit: 10) {
    id
    date
    courseName
    status
  }
}
```

### Mobile App: Native Android (Minimal UI)

**Technology Stack:**
- **Language**: Kotlin
- **UI**: Jetpack Compose (Material Design 3)
- **Architecture**: MVVM (simplified)
- **Networking**: Apollo Kotlin Client
- **Authentication**: JWT in EncryptedSharedPreferences
- **Dependency Injection**: Hilt

**Project Structure (Simplified):**
```
ulab-mms-android/
├── app/
│   ├── src/main/java/bd/edu/ulab/mms/
│   │   ├── data/
│   │   │   ├── api/          # GraphQL client
│   │   │   ├── repository/   # Data layer
│   │   │   └── TokenManager.kt
│   │   ├── ui/
│   │   │   ├── auth/         # Login screen
│   │   │   ├── courses/      # Course list
│   │   │   ├── marks/        # Marks view
│   │   │   └── attendance/   # Check-in screen
│   │   ├── MainActivity.kt
│   │   └── App.kt
│   └── build.gradle.kts
```

## Implementation Phases (4 Weeks Total)

### Phase 1: Backend GraphQL Updates (Week 1, Days 1-2)

#### 1.1 Add Missing Resolver
**File:** `lib/graphql/resolvers/attendance.ts`

Add `myRecentCheckIns` query:
```typescript
myRecentCheckIns: async (_: any, { limit = 10 }: { limit?: number }, context: GraphQLContext) => {
  const user = requireAuth(context);
  await dbConnect();
  
  const sessions = await AttendanceSession.find({
    'records.studentIdString': user.userId
  })
  .sort({ date: -1 })
  .limit(limit)
  .populate('courseId');
  
  return sessions.flatMap(session => 
    session.records
      .filter(r => r.studentIdString === user.userId)
      .map(record => ({
        id: session._id.toString(),
        date: session.date.toISOString(),
        courseName: session.courseId?.name || 'Unknown Course',
        status: record.status,
      }))
  );
}
```

**Commit**: `feat(graphql): add myRecentCheckIns query for mobile`

### Phase 2: Android Project Setup (Week 1, Days 3-5)

#### 2.1 Create Android Project
- New Android Studio project
- Package: `bd.edu.ulab.mms`
- Configure Kotlin + Compose
- Set up Hilt dependency injection

#### 2.2 Add Dependencies
```kotlin
dependencies {
    // Compose
    implementation("androidx.compose.ui:ui:1.6.0")
    implementation("androidx.compose.material3:material3:1.2.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.6")
    
    // Apollo GraphQL
    implementation("com.apollographql.apollo3:apollo-runtime:4.0.0")
    
    // Hilt
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-compiler:2.50")
    
    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

#### 2.3 Configure Apollo
Download GraphQL schema and configure code generation

**Commit**: `feat(android): initialize project with dependencies`

### Phase 3: Core Features Implementation (Week 2-3)

#### 3.1 Authentication (2 days)
**Screens:**
1. Login screen (email/password)
2. Token storage

**Files:**
- `ui/auth/LoginScreen.kt`
- `ui/auth/LoginViewModel.kt`
- `data/TokenManager.kt`
- `data/api/ApolloClient.kt`

**Commit**: `feat(android): add authentication`

#### 3.2 Course List (1 day)
**Screens:**
1. Dashboard with course list

**Files:**
- `ui/courses/CoursesScreen.kt`
- `ui/courses/CoursesViewModel.kt`

**Commit**: `feat(android): add courses list`

#### 3.3 Marks Viewing (2 days)
**Screens:**
1. Marks detail screen per course
2. Show exams with marks/percentage

**Files:**
- `ui/marks/MarksScreen.kt`
- `ui/marks/MarksViewModel.kt`

**Commit**: `feat(android): add marks viewing`

#### 3.4 Attendance Check-in (2 days)
**Screens:**
1. Check-in screen with session code input
2. Recent check-ins list
3. Success/error feedback

**Files:**
- `ui/attendance/CheckInScreen.kt`
- `ui/attendance/CheckInViewModel.kt`
- `ui/attendance/RecentCheckInsScreen.kt`

**Commit**: `feat(android): add attendance check-in`

#### 3.5 Navigation & Layout (1 day)
**Setup:**
- Bottom navigation (Courses, Marks, Attendance)
- Navigation graph
- App theme

**Files:**
- `MainActivity.kt`
- `ui/navigation/NavGraph.kt`
- `ui/theme/Theme.kt`

**Commit**: `feat(android): add navigation and theming`

### Phase 4: Polish & Testing (Week 4)

#### 4.1 UI/UX Polish (2 days)
- Material Design 3 theming
- Loading states
- Error handling
- Empty states
- ULAB branding colors

**Commit**: `feat(android): polish UI/UX`

#### 4.2 Testing (2 days)
- Basic unit tests for ViewModels
- Manual testing on devices
- Fix bugs

**Commit**: `test(android): add unit tests`

#### 4.3 Build Release (1 day)
- Configure ProGuard
- Generate signed APK
- Test release build

**Commit**: `build(android): configure release build`

## Detailed Feature Specifications

### 1. Login Screen
**UI:**
- ULAB logo
- Email input field
- Password input field
- Login button
- Loading indicator
- Error message display

**Flow:**
1. User enters email/password
2. Call `login` mutation
3. Store JWT token securely
4. Navigate to courses screen

### 2. Courses Screen (Dashboard)
**UI:**
- List of enrolled courses
- Course cards showing:
  - Course code
  - Course name
  - Semester/Year
  - Section
- Pull to refresh
- Tap to view marks

**Flow:**
1. Load `myCourses` query on screen load
2. Display in list
3. Tap course → navigate to marks screen

### 3. Marks Screen
**UI:**
- Course header (name, code)
- List of exams with:
  - Exam name
  - Mark (if available)
  - Max marks
  - Percentage
  - Visual progress bar
- Total marks summary at bottom

**Flow:**
1. Load `myMarks(courseId)` query
2. Display exam breakdown
3. Calculate total percentage

### 4. Attendance Check-in Screen
**UI:**
- Large session code input field
- "Check In" button
- Recent check-ins list below
- Success/error feedback

**Flow:**
1. User enters session code
2. Call `checkIn` mutation
3. Show success message
4. Refresh recent check-ins list

### 5. Recent Check-ins List
**UI:**
- List of recent check-ins showing:
  - Course name
  - Date/time
  - Status indicator (present)

**Flow:**
1. Load `myRecentCheckIns` query
2. Display in reverse chronological order

## Security & Performance

### Security
- JWT tokens in EncryptedSharedPreferences
- HTTPS only
- Certificate pinning (production)
- No sensitive data in logs

### Performance
- Apollo client caching
- Pull to refresh
- Error retry with backoff
- APK size < 15 MB

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Backend Updates | 2 days | GraphQL queries ready |
| Android Setup | 3 days | Project initialized |
| Authentication | 2 days | Login working |
| Courses List | 1 day | View courses |
| Marks Viewing | 2 days | View marks per course |
| Attendance | 2 days | Check-in + history |
| Navigation | 1 day | Navigation complete |
| Polish | 2 days | UI refined |
| Testing | 2 days | QA complete |
| Release Build | 1 day | APK ready |

**Total: 4 weeks (20 working days)**

## Success Metrics

### Technical
- App crash rate < 1%
- API response time < 2 seconds
- APK size < 15 MB

### User Experience
- Login success rate > 95%
- Attendance check-in success rate > 95%
- App rating goal: 4.0+ stars

## Screen Flow

```
[Splash] → [Login]
              ↓
         [Dashboard: Courses List]
              ↓
         ┌────┴────┬────────────┐
         ↓         ↓            ↓
    [Marks]  [Check-in]  [Recent Check-ins]
```

## What's NOT Included (Future Phases)

These features are **excluded** from Phase 1:

### Phase 2 (Future):
- Push notifications
- Offline mode
- QR code scanner for attendance
- Dark mode
- Profile settings
- Password reset
- Biometric login

### Phase 3 (Future):
- Mark prediction calculator
- Attendance statistics
- Grade trends
- Calendar integration
- Export marks as PDF

### Never Planned:
- Instructor features (mark entry, course creation)
- Admin features
- Capstone management
- Resources/file browsing
- Bulk operations
- Complex analytics

## Dependencies

### Backend
No new dependencies needed - GraphQL API already has everything except `myRecentCheckIns` query.

### Android
- Kotlin 1.9.x
- Compose 1.6.x
- Apollo Kotlin 4.0.x
- Hilt 2.50
- Material3 1.2.x

## Risk Mitigation

### Risk 1: GraphQL Schema Changes
**Mitigation**: Lock schema version, test before updating

### Risk 2: Token Expiration
**Mitigation**: Implement automatic token refresh or re-login prompt

### Risk 3: Network Errors
**Mitigation**: Clear error messages, retry mechanism

### Risk 4: Testing Coverage
**Mitigation**: Focus on critical paths (login, marks, attendance)

## Conclusion

This **minimalistic mobile app** provides core value to students:
1. Quick mark checking on the go
2. Easy attendance check-in via session code
3. Clean, simple interface

By focusing on these essentials, we can deliver a working app in **4 weeks** that solves the most common student needs without complexity.

**Key Advantages:**
- ✅ Fast development (4 weeks vs 11 weeks)
- ✅ Simple to maintain
- ✅ Clear user value
- ✅ Easy to test
- ✅ Room to expand later

**Next Steps:**
1. Review and approve this simplified plan
2. Add `myRecentCheckIns` GraphQL query (2 hours)
3. Start Android project setup (Week 1)
4. Iterative development with weekly demos
