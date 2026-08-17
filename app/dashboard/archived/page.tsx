'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ArrowLeft, Archive, ArchiveRestore, BookOpen, FlaskConical } from 'lucide-react';
import { notify } from '@/app/utils/notifications';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { teacherSidebarItems } from '@/app/components/teacherNav';

interface Course {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  isArchived: boolean;
  archivedAt?: string;
  createdAt: string;
}

interface GroupedCourses {
  [key: string]: Course[];
}

export default function ArchivedCoursesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [unarchiving, setUnarchiving] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchArchivedCourses();
    }
  }, [status]);

  const fetchArchivedCourses = async () => {
    try {
      const response = await fetch('/api/courses?archived=true');
      const data = await response.json();
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Error fetching archived courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchive = async (courseId: string, courseName: string) => {
    setUnarchiving(courseId);
    try {
      const response = await fetch(`/api/courses/${courseId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      });

      if (response.ok) {
        notify.course.unarchived(courseName);
        setCourses(courses.filter(c => c._id !== courseId));
      } else {
        const data = await response.json();
        notify.course.unarchiveError(data.error);
      }
    } catch (err) {
      console.error('Error unarchiving course:', err);
      notify.course.unarchiveError();
    } finally {
      setUnarchiving(null);
    }
  };

  // Group courses by semester and year (e.g., "Fall 2025", "Summer 2025")
  const groupedCourses: GroupedCourses = courses.reduce((acc, course) => {
    const key = `${course.semester} ${course.year}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(course);
    return acc;
  }, {} as GroupedCourses);

  // Sort semesters by year (descending) then by semester order
  const semesterOrder = { Fall: 3, Summer: 2, Spring: 1 };
  const sortedSemesters = Object.keys(groupedCourses).sort((a, b) => {
    const [semesterA, yearA] = a.split(' ');
    const [semesterB, yearB] = b.split(' ');
    
    // First compare years (descending)
    const yearDiff = parseInt(yearB) - parseInt(yearA);
    if (yearDiff !== 0) return yearDiff;
    
    // Then compare semesters (descending)
    return semesterOrder[semesterB as keyof typeof semesterOrder] - 
           semesterOrder[semesterA as keyof typeof semesterOrder];
  });

  if (status === 'loading' || loading) {
    return (
      <div className="h-dvh bg-background flex overflow-hidden">
        <AdminSidebar items={teacherSidebarItems} title="Teacher Portal" />
        <div className="flex-1 flex flex-col">
          <div className="h-16 border-b px-4 sm:px-6 pl-16 md:pl-6 flex items-center">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex-1 overflow-auto p-4 pt-8">
            <div className="max-w-7xl mx-auto space-y-8">
              <Skeleton className="h-4 w-56" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border p-6 space-y-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      <AdminSidebar items={teacherSidebarItems} title="Teacher Portal" />

      <div className="flex-1 flex flex-col">
        <nav className="border-b bg-background sticky top-0 z-30">
          <div className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 pl-16 md:pl-6">
            <h1 className="text-base sm:text-lg font-bold">Archived Courses</h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="default" size="sm" asChild>
                <Link href="/capstone">
                  <FlaskConical className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Capstone</span>
                </Link>
              </Button>
            </div>
          </div>
        </nav>

        <main className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-muted-foreground">
              Past semester courses organized by term
            </p>
          </div>
        </div>

        {/* Archived Courses by Semester */}
        {courses.length === 0 ? (
          <Card className="text-center py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <CardContent>
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                <Archive className="h-8 w-8" />
              </div>
              <CardTitle className="mb-2">
                No Archived Courses
              </CardTitle>
              <CardDescription className="mb-6">
                Courses you archive will appear here, organized by semester
              </CardDescription>
              <Button asChild>
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {sortedSemesters.map((semesterKey) => (
              <div key={semesterKey}>
                <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                  <span className="text-primary">{semesterKey}</span>
                  <Badge variant="secondary">{groupedCourses[semesterKey].length} courses</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groupedCourses[semesterKey].map((course) => (
                    <Card
                      key={course._id}
                      className="hover:shadow-lg transition-shadow opacity-90"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            course.courseType === 'Theory' 
                              ? 'bg-gradient-to-br from-blue-600 to-cyan-600' 
                              : 'bg-gradient-to-br from-purple-600 to-pink-600'
                          }`}>
                            {course.courseType === 'Theory' ? (
                              <BookOpen className="h-6 w-6 text-white" />
                            ) : (
                              <FlaskConical className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnarchive(course._id, course.name)}
                            disabled={unarchiving === course._id}
                            title="Restore course"
                          >
                            {unarchiving === course._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArchiveRestore className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <CardTitle className="mt-4">{course.name}</CardTitle>
                        <CardDescription>{course.code}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Badge variant="secondary" className="mb-4">
                          {course.courseType} Course
                        </Badge>
                        <div className="flex items-center gap-2 text-sm mb-4">
                          <Badge variant="outline">{course.semester}</Badge>
                          <Badge variant="outline">{course.year}</Badge>
                        </div>
                        {course.archivedAt && (
                          <p className="text-xs text-muted-foreground">
                            Archived: {new Date(course.archivedAt).toLocaleDateString()}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full" variant="outline">
                          <Link href={`/course/${course._id}`}>
                            View Course →
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </main>
      </div>
    </div>
  );
}
