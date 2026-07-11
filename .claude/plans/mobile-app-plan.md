# ULAB MMS Mobile App Implementation Plan

## Executive Summary

This plan outlines the implementation of a native Android mobile application for the ULAB Marks Management System. The app will focus on core mobile use cases for students and instructors, using a GraphQL API layer for optimized mobile data fetching.

## Project Scope

### Target Platform
- **Native Android** using Kotlin and Jetpack Compose
- Minimum SDK: API 24 (Android 7.0)
- Target SDK: API 34 (Android 14)

### Target Users
- **Students**: Attendance check-in, view marks, access resources, capstone submissions
- **Instructors/Faculty**: Enter marks, manage courses, track attendance, grade capstone

### Feature Scope
**Core mobile features only** - Focus on frequently-used mobile scenarios while keeping complex admin operations on the web platform.

## Architecture Overview

### 1. Backend: GraphQL Layer

**Why GraphQL:**
- Precise data fetching (no over-fetching)
- Single endpoint reduces complexity
- Better offline support with normalized cache
- Type-safe queries with code generation
- Flexible for mobile-specific payloads

**Implementation:**
- Add Apollo Server Express to existing Next.js API
- Mount at `/api/graphql`
- Reuse existing MongoDB models and business logic
- Implement dataloaders for N+1 query optimization
- Add authentication middleware using existing NextAuth sessions

**Technology Stack:**
- `apollo-server-micro` for Next.js integration
- `graphql` and `@graphql-tools/schema`
- Reuse existing Mongoose models
- JWT tokens for mobile auth (generated via existing NextAuth)

### 2. Mobile App: Native Android

**Technology Stack:**
- **Language**: Kotlin
- **UI**: Jetpack Compose (modern declarative UI)
- **Architecture**: MVVM with Clean Architecture
- **Networking**: Apollo Kotlin Client for GraphQL
- **Local Storage**: Room Database for offline caching
- **Authentication**: JWT tokens stored securely in EncryptedSharedPreferences
- **Dependency Injection**: Hilt (Dagger)
- **Image Loading**: Coil
- **Navigation**: Jetpack Navigation Compose

**Project Structure:**
```
ulab-mms-android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/bd/edu/ulab/mms/
│   │   │   │   ├── data/           # Data layer
│   │   │   │   │   ├── remote/     # GraphQL API
│   │   │   │   │   ├── local/      # Room database
│   │   │   │   │   ├── repository/ # Repository pattern
│   │   │   │   ├── domain/         # Business logic
│   │   │   │   │   ├── model/      # Domain models
│   │   │   │   │   ├── usecase/    # Use cases
│   │   │   │   ├── presentation/   # UI layer
│   │   │   │   │   ├── auth/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── attendance/
│   │   │   │   │   ├── marks/
│   │   │   │   │   ├── courses/
│   │   │   │   │   ├── capstone/
│   │   │   │   │   ├── resources/
│   │   │   │   ├── di/             # Dependency injection
│   │   │   │   ├── util/           # Utilities
│   │   │   ├── res/                # Resources
│   │   │   │   ├── layout/
│   │   │   │   ├── values/
│   │   │   │   ├── drawable/
│   │   │   ├── AndroidManifest.xml
│   ├── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Implementation Phases

### Phase 1: Backend GraphQL Layer (Week 1-2)

#### 1.1 GraphQL Server Setup
**Files to create:**
- `lib/graphql/schema.ts` - GraphQL type definitions
- `lib/graphql/resolvers/` - Query and mutation resolvers
- `lib/graphql/context.ts` - Authentication context
- `lib/graphql/dataloaders/` - Dataloader implementations
- `app/api/graphql/route.ts` - GraphQL endpoint

**Why:**
- Provides optimized data access for mobile
- Single endpoint simplifies mobile networking
- Type-safe contract between frontend and backend

**How to apply:**
1. Install dependencies: `apollo-server-micro`, `graphql`, `dataloader`
2. Define GraphQL schema matching mobile needs
3. Implement resolvers that reuse existing Mongoose models
4. Add JWT-based authentication using existing NextAuth logic
5. Test queries/mutations with GraphQL Playground

#### 1.2 Core Schema Definitions

**Student-focused types:**
```graphql
type User {
  id: ID!
  name: String!
  email: String!
  role: String!
}

type Course {
  id: ID!
  name: String!
  code: String!
  semester: String!
  year: Int!
  section: String!
  courseType: CourseType!
  instructor: User
}

type Mark {
  id: ID!
  studentId: String!
  studentName: String!
  courseId: ID!
  examId: ID!
  mark: Float
  status: String
}

type AttendanceSession {
  id: ID!
  courseId: ID!
  sessionCode: String!
  date: String!
  isActive: Boolean!
}

type CapstoneGroup {
  id: ID!
  semester: String!
  category: String!
  students: [String!]!
  supervisor: User
  evaluator: User
}
```

**Instructor-focused types:**
```graphql
type StudentMark {
  studentId: String!
  studentName: String!
  marks: [ExamMark!]!
}

type ExamMark {
  examId: ID!
  examName: String!
  mark: Float
  maxMark: Float!
}
```

**Key Queries:**
```graphql
type Query {
  # Student queries
  me: User!
  myCourses: [Course!]!
  myMarks(courseId: ID!): [Mark!]!
  courseDetails(courseId: ID!): Course
  checkAttendance(sessionCode: String!): AttendanceSession
  myCapstoneGroup: CapstoneGroup
  
  # Instructor queries
  instructorCourses: [Course!]!
  courseStudents(courseId: ID!): [StudentMark!]!
  attendanceSessions(courseId: ID!): [AttendanceSession!]!
  capstoneGroups(semester: String!, category: String!): [CapstoneGroup!]!
}

type Mutation {
  # Auth
  login(email: String!, password: String!): AuthPayload!
  
  # Student mutations
  checkIn(sessionCode: String!): CheckInResult!
  
  # Instructor mutations
  createAttendanceSession(courseId: ID!, date: String!): AttendanceSession!
  updateMark(studentId: String!, examId: ID!, mark: Float!): Mark!
  bulkUpdateMarks(marks: [MarkInput!]!): BulkMarkResult!
  createCourse(input: CourseInput!): Course!
}
```

**Why:**
- Schema focuses on mobile use cases
- Nested types reduce round trips
- Batch operations for mark entry

#### 1.3 Authentication Flow

**Implementation:**
1. Mobile app sends email/password to `/api/auth/callback/credentials` (existing NextAuth)
2. Receive session token
3. Exchange session for JWT at `/api/graphql/auth/mobile-token`
4. Include JWT in `Authorization: Bearer <token>` header for GraphQL requests
5. GraphQL context validates JWT and attaches user to context

**Files to create:**
- `app/api/graphql/auth/mobile-token/route.ts` - JWT generation
- `lib/graphql/auth.ts` - JWT validation middleware

### Phase 2: Android Project Setup (Week 2)

#### 2.1 Project Initialization
- Create new Android Studio project with Kotlin + Compose
- Configure package: `bd.edu.ulab.mms`
- Set up version catalogs for dependency management
- Configure ProGuard/R8 for release builds

#### 2.2 Core Dependencies
```kotlin
// build.gradle.kts (app)
dependencies {
    // Jetpack Compose
    implementation("androidx.compose.ui:ui:1.6.0")
    implementation("androidx.compose.material3:material3:1.2.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.6")
    
    // Apollo GraphQL
    implementation("com.apollographql.apollo3:apollo-runtime:4.0.0")
    
    // Hilt DI
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-compiler:2.50")
    
    // Room Database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
    
    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // Image Loading
    implementation("io.coil-kt:coil-compose:2.5.0")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

#### 2.3 Apollo Client Configuration
**File:** `app/src/main/graphql/schema.graphqls`
- Download schema from backend: `apollo schema:download`
- Configure code generation

**File:** `data/remote/ApolloClientProvider.kt`
```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideApolloClient(
        tokenManager: TokenManager
    ): ApolloClient {
        return ApolloClient.Builder()
            .serverUrl("https://ulab-mms.vercel.app/api/graphql")
            .addHttpHeader("Authorization", "Bearer ${tokenManager.getToken()}")
            .build()
    }
}
```

### Phase 3: Authentication Module (Week 3)

#### 3.1 Data Layer
**Files:**
- `data/remote/AuthApi.kt` - Login/logout GraphQL mutations
- `data/local/TokenManager.kt` - Secure token storage
- `data/repository/AuthRepositoryImpl.kt` - Auth repository implementation

**Token Storage:**
```kotlin
class TokenManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "ulab_auth",
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveToken(token: String) {
        sharedPreferences.edit().putString("jwt_token", token).apply()
    }
    
    fun getToken(): String? = sharedPreferences.getString("jwt_token", null)
    
    fun clearToken() {
        sharedPreferences.edit().remove("jwt_token").apply()
    }
}
```

#### 3.2 Domain Layer
**Files:**
- `domain/model/User.kt` - User domain model
- `domain/usecase/LoginUseCase.kt` - Login business logic
- `domain/usecase/LogoutUseCase.kt` - Logout business logic
- `domain/repository/AuthRepository.kt` - Auth repository interface

#### 3.3 Presentation Layer
**Files:**
- `presentation/auth/LoginScreen.kt` - Login UI
- `presentation/auth/LoginViewModel.kt` - Login state management
- `presentation/auth/AuthNavigation.kt` - Auth navigation graph

**UI Features:**
- Email/password input fields
- Remember me checkbox
- Forgot password link (deep link to web)
- Loading states
- Error handling with Snackbar
- ULAB branding and logo

### Phase 4: Student Features (Week 4-5)

#### 4.1 Dashboard
**Files:**
- `presentation/dashboard/StudentDashboardScreen.kt`
- `presentation/dashboard/DashboardViewModel.kt`

**Features:**
- Welcome message with user name
- Quick actions: Check Attendance, View Marks, Resources
- Current semester courses grid
- Recent attendance sessions
- Upcoming capstone deadlines

#### 4.2 Marks Viewing
**Files:**
- `presentation/marks/MarksScreen.kt`
- `presentation/marks/MarksViewModel.kt`
- `presentation/marks/CourseMarksDetailScreen.kt`

**Features:**
- List all courses
- Select course to view detailed marks
- Show exam breakdown (Midterm, Final, Quiz, Assignment, etc.)
- Display total marks and grade
- Visual progress indicators
- Export marks as PDF (future enhancement)

**GraphQL Query:**
```graphql
query GetMyMarks($courseId: ID!) {
  myMarks(courseId: $courseId) {
    id
    examName
    mark
    maxMark
    percentage
  }
  courseDetails(courseId: $courseId) {
    name
    code
    semester
    year
  }
}
```

#### 4.3 Attendance Check-in
**Files:**
- `presentation/attendance/AttendanceCheckInScreen.kt`
- `presentation/attendance/AttendanceViewModel.kt`

**Features:**
- Session code input field (large, easy to type)
- QR code scanner integration
- Submit check-in
- Success/error feedback
- Recent check-in history

**GraphQL Mutation:**
```graphql
mutation CheckIn($sessionCode: String!) {
  checkIn(sessionCode: $sessionCode) {
    success
    message
    session {
      courseName
      date
    }
  }
}
```

#### 4.4 Resources Browser
**Files:**
- `presentation/resources/ResourcesScreen.kt`
- `presentation/resources/ResourcesViewModel.kt`

**Features:**
- Folder/file tree navigation
- File download with progress indicator
- File preview for PDF, images
- Search functionality
- Offline access to downloaded files

#### 4.5 Capstone (Student View)
**Files:**
- `presentation/capstone/student/MyCapstoneScreen.kt`
- `presentation/capstone/student/CapstoneViewModel.kt`

**Features:**
- View assigned capstone group
- See supervisor and evaluator
- View group members
- Submission status
- Links to submission forms (can open web view)

### Phase 5: Instructor Features (Week 6-7)

#### 5.1 Instructor Dashboard
**Files:**
- `presentation/instructor/InstructorDashboardScreen.kt`
- `presentation/instructor/InstructorViewModel.kt`

**Features:**
- List of instructor's courses
- Quick stats: total students, pending marks
- Create attendance session
- Navigate to course details

#### 5.2 Course Management
**Files:**
- `presentation/instructor/course/CourseDetailScreen.kt`
- `presentation/instructor/course/CourseViewModel.kt`

**Features:**
- View course information
- Student list with marks
- Create/manage attendance sessions
- Quick mark entry

#### 5.3 Marks Entry
**Files:**
- `presentation/instructor/marks/MarkEntryScreen.kt`
- `presentation/instructor/marks/MarkEntryViewModel.kt`

**Features:**
- Select exam type
- List students with input fields
- Bulk mark entry
- Validation (0-max marks)
- Save individual or bulk
- Offline support with sync queue

**GraphQL Mutation:**
```graphql
mutation BulkUpdateMarks($marks: [MarkInput!]!) {
  bulkUpdateMarks(marks: $marks) {
    success
    updated
    failed
    errors
  }
}
```

#### 5.4 Attendance Management
**Files:**
- `presentation/instructor/attendance/AttendanceScreen.kt`
- `presentation/instructor/attendance/AttendanceViewModel.kt`

**Features:**
- Create new attendance session
- Generate session code
- Display session code (large, shareable)
- Generate QR code for students to scan
- View attendance list in real-time
- Close session

**GraphQL Mutation:**
```graphql
mutation CreateAttendanceSession($courseId: ID!, $date: String!) {
  createAttendanceSession(courseId: $courseId, date: $date) {
    id
    sessionCode
    isActive
  }
}
```

#### 5.5 Capstone Grading
**Files:**
- `presentation/instructor/capstone/CapstoneSupervisorScreen.kt`
- `presentation/instructor/capstone/CapstoneGradingScreen.kt`

**Features:**
- List assigned capstone groups
- View weekly journal submissions
- Grade peer evaluations
- Grade final reports
- Submit grades with comments

### Phase 6: Offline Support (Week 8)

#### 6.1 Room Database Setup
**Files:**
- `data/local/AppDatabase.kt` - Room database
- `data/local/dao/` - DAOs for each entity
- `data/local/entity/` - Room entities

**Entities:**
- CourseEntity
- MarkEntity
- AttendanceSessionEntity
- UserEntity

#### 6.2 Repository Pattern
**Implementation:**
- Check network connectivity
- Try remote fetch first
- Cache response in Room
- Return cached data if offline
- Implement sync queue for mutations

**Files:**
- `data/repository/CourseRepositoryImpl.kt`
- `data/repository/MarkRepositoryImpl.kt`
- `data/repository/AttendanceRepositoryImpl.kt`

#### 6.3 Sync Manager
**File:** `data/sync/SyncManager.kt`

**Features:**
- Queue offline mutations
- Auto-sync when network available
- Conflict resolution
- Background WorkManager for periodic sync

### Phase 7: UI/UX Polish (Week 9)

#### 7.1 Material Design 3
- Implement Material You dynamic theming
- Dark/light mode support
- Consistent color scheme matching ULAB branding
- Smooth animations and transitions

#### 7.2 Accessibility
- Content descriptions for screen readers
- Minimum touch target sizes (48dp)
- High contrast mode support
- Font scaling support

#### 7.3 Performance Optimization
- Lazy loading for lists
- Image caching with Coil
- Pagination for large datasets
- Optimize GraphQL queries with fragments

#### 7.4 Error Handling
- Graceful error messages
- Retry mechanisms
- Offline indicators
- Loading skeletons

### Phase 8: Testing & QA (Week 10)

#### 8.1 Unit Tests
- ViewModels with MockK
- Use cases
- Repository implementations
- GraphQL query builders

#### 8.2 Integration Tests
- Room database operations
- Apollo client queries
- Repository layer

#### 8.3 UI Tests
- Compose UI tests
- Navigation flow tests
- End-to-end critical paths

#### 8.4 Manual Testing
- Device compatibility (various Android versions)
- Network conditions (slow 3G, offline)
- Edge cases and error scenarios

### Phase 9: Deployment (Week 11)

#### 9.1 Release Build
- Configure ProGuard rules
- Optimize APK size
- Enable R8 full mode
- Generate signing key
- Build release APK/AAB

#### 9.2 Play Store Setup
- Create Google Play Console account
- Prepare store listing
- Screenshots and promotional graphics
- Privacy policy
- Content rating

#### 9.3 Beta Testing
- Internal testing track
- Closed beta with select users
- Gather feedback
- Fix critical issues

#### 9.4 Production Release
- Upload to Play Store
- Staged rollout (10% → 50% → 100%)
- Monitor crash reports (Firebase Crashlytics)
- Monitor analytics

## Technical Specifications

### Authentication Flow
1. User enters email/password
2. App sends credentials to `/api/auth/callback/credentials`
3. Backend validates and returns session
4. App exchanges session for mobile JWT at `/api/graphql/auth/mobile-token`
5. JWT stored in EncryptedSharedPreferences
6. JWT sent with every GraphQL request in Authorization header
7. Backend validates JWT and extracts user context

### Data Synchronization
1. **Online mode**: Fetch from GraphQL, cache in Room
2. **Offline mode**: Read from Room cache
3. **Mutation queue**: Store failed mutations in queue table
4. **Background sync**: WorkManager retries queue every 15 minutes when online
5. **Conflict resolution**: Last write wins (server timestamp)

### Security Measures
- JWT tokens stored in EncryptedSharedPreferences
- TLS/HTTPS for all network requests
- Certificate pinning (production)
- ProGuard/R8 code obfuscation
- No sensitive data in logs
- Biometric authentication option

### Performance Targets
- Cold start: < 3 seconds
- Screen navigation: < 500ms
- GraphQL query: < 2 seconds
- Offline mode: Instant from cache
- APK size: < 20 MB

## Dependencies

### Backend
```json
{
  "apollo-server-micro": "^4.0.0",
  "graphql": "^16.8.0",
  "dataloader": "^2.2.0",
  "jsonwebtoken": "^9.0.0",
  "@graphql-tools/schema": "^10.0.0"
}
```

### Android
- Kotlin 1.9.x
- Compose UI 1.6.x
- Apollo Kotlin 4.0.x
- Hilt 2.50
- Room 2.6.x
- Navigation Compose 2.7.x
- Coil 2.5.x
- Material3 1.2.x

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: GraphQL Backend | 2 weeks | GraphQL API with auth, queries, mutations |
| Phase 2: Android Setup | 1 week | Project structure, dependencies, base architecture |
| Phase 3: Authentication | 1 week | Login/logout with secure token storage |
| Phase 4: Student Features | 2 weeks | Dashboard, marks, attendance, resources, capstone |
| Phase 5: Instructor Features | 2 weeks | Course management, mark entry, attendance creation, capstone grading |
| Phase 6: Offline Support | 1 week | Room caching, sync manager, offline mutations |
| Phase 7: UI/UX Polish | 1 week | Material Design, animations, accessibility |
| Phase 8: Testing | 1 week | Unit tests, integration tests, UI tests, QA |
| Phase 9: Deployment | 1 week | Release build, Play Store, beta testing |

**Total Duration: 11 weeks**

## Success Metrics

### Technical Metrics
- App crash rate < 1%
- API response time < 2 seconds (p95)
- Offline mode functionality coverage > 80%
- Unit test coverage > 70%

### User Metrics
- Daily active users: Target 30% of student population
- Session duration: Average 5-10 minutes
- Attendance check-in success rate > 95%
- App rating > 4.0 stars

## Risk Mitigation

### Risk 1: GraphQL Learning Curve
**Mitigation**: Allocate extra time for Phase 1, provide team training, start with simple queries

### Risk 2: Android Fragmentation
**Mitigation**: Target API 24+, test on multiple devices, use Jetpack libraries for compatibility

### Risk 3: Offline Sync Conflicts
**Mitigation**: Implement last-write-wins strategy, add manual conflict resolution UI

### Risk 4: Large APK Size
**Mitigation**: Use App Bundle, enable R8 shrinking, lazy load features with dynamic delivery

### Risk 5: Backend Load
**Mitigation**: Implement dataloaders, add Redis caching, use CDN for static assets, rate limiting

## Future Enhancements (Post-Launch)

### Phase 2 Features
- Push notifications for new marks, attendance sessions
- In-app messaging between students and instructors
- Calendar integration for course schedules
- Mark prediction and grade calculator
- Dark mode schedule (auto-switch based on time)

### Phase 3 Features
- Biometric authentication
- Multi-language support (Bengali, English)
- Export marks/attendance as PDF
- Offline-first architecture improvements
- Widget for quick attendance check-in

### Advanced Features
- Machine learning for attendance pattern analysis
- Chatbot for common queries
- Video/audio lectures integration
- Discussion forums per course
- Parent portal for grade monitoring

## Conclusion

This implementation plan provides a structured approach to building a native Android app for ULAB MMS. The focus on core mobile features, combined with a GraphQL API layer and offline support, will deliver a performant and user-friendly mobile experience for students and instructors.

**Key advantages of this approach:**
1. **Native Android**: Best performance and user experience on Android devices
2. **GraphQL**: Optimized data fetching reduces bandwidth and improves speed
3. **Offline-first**: Students can view marks and courses without internet
4. **Clean Architecture**: Maintainable, testable, scalable codebase
5. **Focused Scope**: Core features first, complex admin tasks remain on web

**Next steps:**
1. Approve this plan
2. Set up GraphQL backend (Phase 1)
3. Initialize Android project (Phase 2)
4. Begin iterative development following the phase timeline
