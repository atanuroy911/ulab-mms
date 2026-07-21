'use client';

import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface AdminCourse {
  _id: string;
  courseCode: string;
  courseTitle: string;
  creditHour: number;
  prerequisite?: string;
  content?: string;
  unescoCode?: string;
}

interface CourseComboboxProps {
  selectedCourse: AdminCourse | null;
  onSelect: (course: AdminCourse | null) => void;
  disabled?: boolean;
}

export function CourseCombobox({ selectedCourse, onSelect, disabled = false }: CourseComboboxProps) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAdminCourses();
  }, []);

  const fetchAdminCourses = async () => {
    try {
      const response = await fetch('/api/admin/courses');
      const data = await response.json();
      setCourses(data.courses || []);
    } catch (error) {
      console.error('Error fetching admin courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fuzzySearch = (query: string, course: AdminCourse) => {
    const searchLower = query.toLowerCase();
    const codeLower = course.courseCode.toLowerCase();
    const titleLower = course.courseTitle.toLowerCase();
    
    return codeLower.includes(searchLower) || titleLower.includes(searchLower);
  };

  const filteredCourses = courses.filter(course => 
    searchQuery === '' || fuzzySearch(searchQuery, course)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedCourse ? (
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {selectedCourse.courseCode} - {selectedCourse.courseTitle}
            </span>
          ) : (
            "Select course from catalogue..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[630px] p-0" align="center">
        <div className="flex flex-col">
          <div className="border-b p-3">
            <Input
              placeholder="Search by code or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          
          <div 
            className="max-h-[300px] overflow-y-auto overscroll-contain"
            style={{ 
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            }}
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading courses...
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-2">No course found in catalogue</p>
                <Button 
                  variant="link" 
                  size="sm"
                  onClick={() => {
                    onSelect(null);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                >
                  Create custom course instead
                </Button>
              </div>
            ) : (
              <div className="p-1">
                {filteredCourses.map((course) => (
                  <div
                    key={course._id}
                    onClick={() => {
                      onSelect(course);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      selectedCourse?.courseCode === course.courseCode && "bg-accent"
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedCourse?.courseCode === course.courseCode ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center justify-between flex-1">
                      <div>
                        <p className="font-mono font-semibold">{course.courseCode}</p>
                        <p className="text-xs text-muted-foreground">{course.courseTitle}</p>
                        {course.unescoCode && (
                          <p className="text-xs text-muted-foreground font-mono">{course.unescoCode}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground ml-2">
                        {course.creditHour} cr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
