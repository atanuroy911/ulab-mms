export const typeDefs = `#graphql
  # Enums
  enum Role {
    user
    admin
    instructor
    student
  }

  enum CourseType {
    Theory
    Lab
  }

  enum Semester {
    Spring
    Summer
    Fall
  }

  # User Types
  type User {
    id: ID!
    name: String!
    email: String!
    role: Role!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  # Course Types
  type Course {
    id: ID!
    name: String!
    code: String!
    semester: String!
    year: Int!
    section: String!
    courseType: CourseType!
    classTime: String
    classRoom: String
    numberOfStudents: Int
    isArchived: Boolean!
    instructor: User
    exams: [Exam!]!
  }

  # Exam Types
  type Exam {
    id: ID!
    courseId: ID!
    name: String!
    maxMarks: Float!
    weight: Float
    course: Course
  }

  # Mark Types
  type Mark {
    id: ID!
    studentId: String!
    studentName: String!
    courseId: ID!
    examId: ID!
    mark: Float
    status: String
    exam: Exam
    course: Course
  }

  type ExamMark {
    examId: ID!
    examName: String!
    mark: Float
    maxMark: Float!
    percentage: Float
  }

  type StudentMarkSummary {
    studentId: String!
    studentName: String!
    marks: [ExamMark!]!
    totalMarks: Float
    totalMaxMarks: Float
    percentage: Float
  }

  # Attendance Types
  type AttendanceSession {
    id: ID!
    courseId: ID!
    sessionCode: String!
    date: String!
    open: Boolean!
    course: Course
    records: [AttendanceRecord!]!
  }

  type AttendanceRecord {
    studentId: String!
    status: String!
    recordedAt: String!
    markedBy: String
  }

  type AttendanceStats {
    courseId: ID!
    courseName: String!
    courseCode: String!
    totalSessions: Int!
    attendedSessions: Int!
    percentage: Float!
    sessions: [AttendanceSessionDetail!]!
  }

  type AttendanceSessionDetail {
    id: ID!
    date: String!
    attended: Boolean!
  }

  type CheckInResult {
    success: Boolean!
    message: String!
    session: AttendanceSession
    stats: AttendanceStats
  }

  # Capstone Types
  type CapstoneGroup {
    id: ID!
    courseId: ID!
    groupName: String!
    groupNumber: Int
    description: String
    semester: String
    studentIds: [ID!]!
    supervisorId: ID!
    supervisor: User
    evaluatorAssignments: [EvaluatorAssignment!]!
  }

  type EvaluatorAssignment {
    evaluatorId: ID!
    assignedAt: String!
    status: String!
    evaluator: User
  }

  type CapstoneMarks {
    id: ID!
    groupId: ID!
    studentId: String!
    category: String!
    marks: Float
    comments: String
    group: CapstoneGroup
  }

  # Input Types
  input LoginInput {
    email: String!
    password: String!
  }

  input CourseInput {
    name: String!
    code: String!
    semester: String!
    year: Int!
    section: String!
    courseType: CourseType!
    classTime: String
    classRoom: String
  }

  input MarkInput {
    studentId: String!
    studentName: String!
    examId: ID!
    mark: Float!
  }

  input AttendanceSessionInput {
    courseId: ID!
    date: String!
  }

  # Result Types
  type BulkMarkResult {
    success: Boolean!
    updated: Int!
    failed: Int!
    errors: [String!]
  }

  # Query Types
  type Query {
    # Auth
    me: User!

    # Student Queries
    myCourses: [Course!]!
    myMarks(courseId: ID!): [ExamMark!]!
    courseDetails(courseId: ID!): Course
    myCapstoneGroups: [CapstoneGroup!]!
    myAttendanceStats(courseId: ID!): AttendanceStats!
    studentAttendanceStats(courseId: ID!, studentId: String!): AttendanceStats!

    # Instructor Queries
    instructorCourses: [Course!]!
    courseStudents(courseId: ID!): [StudentMarkSummary!]!
    attendanceSessions(courseId: ID!): [AttendanceSession!]!
    capstoneGroupsBySupervisor: [CapstoneGroup!]!
    capstoneGroupsByEvaluator: [CapstoneGroup!]!

    # Shared Queries
    course(id: ID!): Course
    attendanceSession(sessionCode: String!): AttendanceSession
  }

  # Mutation Types
  type Mutation {
    # Auth
    login(input: LoginInput!): AuthPayload!

    # Student Mutations
    checkIn(sessionCode: String!): CheckInResult!

    # Instructor Mutations
    createCourse(input: CourseInput!): Course!
    createAttendanceSession(input: AttendanceSessionInput!): AttendanceSession!
    closeAttendanceSession(sessionId: ID!): AttendanceSession!
    updateMark(studentId: String!, examId: ID!, mark: Float!): Mark!
    bulkUpdateMarks(courseId: ID!, marks: [MarkInput!]!): BulkMarkResult!
  }
`;
