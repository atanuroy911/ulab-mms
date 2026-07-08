# Next Steps for Minimalistic Mobile App

## Current Status
✅ GraphQL API implemented with core features
✅ Minimalistic mobile app plan created
✅ Backend ready for mobile integration

## What You Have Now

### GraphQL API (Already Built)
- ✅ Authentication (`login`, `me`)
- ✅ Course queries (`myCourses`, `courseDetails`)
- ✅ Mark queries (`myMarks`)
- ✅ Attendance (`checkIn`, `attendanceSessions`)

### What's Missing for Minimal App
- ❌ `myRecentCheckIns` query (needs to be added)

## Immediate Next Steps

### Step 1: Add Missing GraphQL Query (30 minutes)

**File to update:** `lib/graphql/schema.ts`

Add to Query type:
```graphql
type RecentCheckIn {
  id: ID!
  date: String!
  courseName: String!
  status: String!
}

type Query {
  # ... existing queries
  myRecentCheckIns(limit: Int): [RecentCheckIn!]!
}
```

**File to update:** `lib/graphql/resolvers/attendance.ts`

Add resolver:
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
  
  const checkIns = sessions.flatMap(session => {
    const course = session.courseId as any;
    return session.records
      .filter((r: any) => r.studentIdString === user.userId)
      .map((record: any) => ({
        id: session._id.toString() + '_' + record._id.toString(),
        date: session.date.toISOString(),
        courseName: course?.name || 'Unknown Course',
        status: record.status,
      }));
  });
  
  return checkIns.slice(0, limit);
}
```

**Commit:** `feat(graphql): add myRecentCheckIns query for mobile`

### Step 2: Test GraphQL API (15 minutes)

Start dev server:
```bash
npm run dev
```

Open GraphQL Playground: `http://localhost:3000/api/graphql`

Test the queries:
```graphql
# Test login
mutation {
  login(input: { email: "student@ulab.edu.bd", password: "password" }) {
    token
    user { id, name, email }
  }
}

# Test with token in Authorization header: Bearer <token>
query {
  myCourses {
    id
    name
    code
    semester
  }
}

query {
  myMarks(courseId: "course_id_here") {
    examName
    mark
    maxMark
    percentage
  }
}

mutation {
  checkIn(sessionCode: "ABC123") {
    success
    message
  }
}

query {
  myRecentCheckIns(limit: 5) {
    id
    date
    courseName
    status
  }
}
```

### Step 3: Begin Android Development (Next Phase)

#### 3.1 Setup Android Studio
1. Install Android Studio (latest stable)
2. Create new project:
   - Template: Empty Activity (Compose)
   - Package: `bd.edu.ulab.mms`
   - Language: Kotlin
   - Minimum SDK: API 24

#### 3.2 Add Dependencies (build.gradle.kts)
```kotlin
dependencies {
    // Compose
    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.6")
    
    // Apollo GraphQL
    implementation("com.apollographql.apollo3:apollo-runtime:4.0.0")
    
    // Hilt
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-compiler:2.50")
    
    // Security (for token storage)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

#### 3.3 Configure Apollo Client
Create `apollo` folder and add schema:
```bash
# In your Android project
mkdir -p app/src/main/graphql
# Download schema from your running server
```

**apollo.config.js:**
```javascript
module.exports = {
  client: {
    service: {
      name: 'ulab-mms',
      url: 'http://10.0.2.2:3000/api/graphql' // Android emulator
    }
  }
}
```

#### 3.4 Create Basic Screens
1. **LoginScreen.kt** - Email/password login
2. **CoursesScreen.kt** - List of courses
3. **MarksScreen.kt** - Course marks detail
4. **CheckInScreen.kt** - Attendance check-in
5. **MainActivity.kt** - Navigation setup

## Development Timeline

### Week 1: Backend + Setup
- [ ] Day 1-2: Add `myRecentCheckIns` query, test API
- [ ] Day 3-4: Setup Android project, dependencies, Apollo
- [ ] Day 5: Create project structure, Hilt setup

### Week 2: Core Features
- [ ] Day 1-2: Authentication (Login + Token storage)
- [ ] Day 3: Course list screen
- [ ] Day 4-5: Marks viewing screen

### Week 3: Attendance + Polish
- [ ] Day 1-2: Attendance check-in screen
- [ ] Day 3: Recent check-ins list
- [ ] Day 4-5: Navigation, theming, polish

### Week 4: Testing + Release
- [ ] Day 1-2: UI polish, error handling
- [ ] Day 3: Testing on devices
- [ ] Day 4: Bug fixes
- [ ] Day 5: Release build, documentation

## Features Checklist

### Must Have ✅
- [x] GraphQL API for courses, marks, attendance
- [ ] `myRecentCheckIns` query
- [ ] Android login screen
- [ ] Course list
- [ ] Marks detail view
- [ ] Attendance check-in
- [ ] Recent check-ins list

### Nice to Have (Phase 2)
- [ ] Pull to refresh
- [ ] Empty states
- [ ] Loading skeletons
- [ ] QR code scanner
- [ ] Dark mode
- [ ] Biometric login

### Not Included
- ❌ Capstone features
- ❌ Resources/files
- ❌ Admin features
- ❌ Instructor mark entry
- ❌ Offline mode
- ❌ Push notifications

## Quick Start Commands

### Backend
```bash
# Start dev server
npm run dev

# Test GraphQL
open http://localhost:3000/api/graphql
```

### Android (After Setup)
```bash
# Open in Android Studio
studio .

# Run on emulator
./gradlew installDebug

# Run tests
./gradlew test
```

## Resources

### Documentation
- Mobile App Plan: `.claude/plans/mobile-app-plan-minimal.md`
- GraphQL Summary: `.claude/graphql-implementation-summary.md`

### GraphQL Endpoint
- Local: `http://localhost:3000/api/graphql`
- Production: `https://your-domain.com/api/graphql`

### Android Resources
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Apollo Kotlin](https://www.apollographql.com/docs/kotlin/)
- [Material Design 3](https://m3.material.io/)

## Questions to Answer Before Starting

1. **Backend Hosting**: Where will the GraphQL API be deployed? (Vercel, AWS, etc.)
2. **App Distribution**: Google Play Store or internal distribution?
3. **Design Assets**: Do you have ULAB logo, colors, branding guidelines?
4. **Test Users**: Do you have test student accounts for development?
5. **Timeline**: Is 4 weeks acceptable or do you need faster/slower?

## Success Criteria

### MVP Definition
A working Android app where a student can:
1. ✅ Log in with their email/password
2. ✅ See their list of courses
3. ✅ View marks for each course
4. ✅ Check in to attendance using a session code
5. ✅ See their recent check-ins

### Technical Requirements
- App runs on Android 7.0+ devices
- No crashes on basic operations
- GraphQL API response < 2 seconds
- APK size < 15 MB
- Works on 3G/4G networks

### User Experience
- Clear error messages
- Loading indicators for all operations
- Simple, clean interface
- ULAB branding consistent

---

**Ready to start?** 

The immediate next step is to add the `myRecentCheckIns` GraphQL query (30 minutes of work). After that, you can begin Android development or I can help you with that query first.
