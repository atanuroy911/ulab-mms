'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ExternalLink, Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import { calculateLetterGrade } from '@/app/utils/grading';
import { calculateFinalGradeTotal } from '@/lib/finalGrade';

interface UrmsSubmitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: any;
  students: any[];
  marks: any[];
  exams: any[];
}

export default function UrmsSubmitModal({
  open,
  onOpenChange,
  course,
  students,
  marks,
  exams,
}: UrmsSubmitModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ studentId: string; status: 'success' | 'error'; message?: string }[]>([]);

  const getStudentGrade = (studentId: string) => {
    const totalScore = calculateFinalGradeTotal(studentId, exams, marks, course || {});
    return calculateLetterGrade(totalScore, course?.gradingScale);
  };

  const handleOpenUrms = () => {
    window.open('https://urms-awp.ulab.edu.bd/RMS_ggs_result/ResultEntryFromExcel', '_blank', 'width=1000,height=800');
  };

  const generateScript = () => {
    // Generate an array of { id: '...', grade: 'A' }
    const gradeData = students.filter(student => !student.withdrawn).map(student => ({
      id: student.studentId,
      grade: getStudentGrade(student._id) || 'F'
    }));

    return `(function() {
  const grades = ${JSON.stringify(gradeData)};
  let successCount = 0;
  let notFoundCount = 0;
  
  console.log("Starting Auto-Population for " + grades.length + " students...");
  
  // Find all table rows on the page
  const rows = Array.from(document.querySelectorAll('tr'));
  
  grades.forEach(record => {
    // Find the row that contains this student's ID
    const row = rows.find(r => r.textContent.includes(record.id));
    
    if (row) {
      // Find the input or select element in this row that likely holds the grade
      // We look for text inputs or selects that are not hidden or disabled
      const input = row.querySelector('input[type="text"]:not([disabled]), select:not([disabled])');
      
      if (input) {
        input.value = record.grade;
        // Dispatch events so React/Angular/Vue or native JS picks up the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log("Populated " + record.id + " with grade " + record.grade);
        successCount++;
        
        // Add a slight visual highlight to the row
        row.style.backgroundColor = '#e6ffe6';
        setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
      } else {
        console.warn("Found row for " + record.id + " but couldn't find an editable input/select field!");
        notFoundCount++;
      }
    } else {
      console.warn("Could not find student ID " + record.id + " on this page.");
      notFoundCount++;
    }
  });
  
  alert("Auto-Population Complete!\\nSuccessfully populated: " + successCount + "\\nNot found/Errors: " + notFoundCount + "\\n\\nPlease review the grades on the page, and then manually click the SAVE button.");
})();`;
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generateScript());
    alert("Script copied to clipboard!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Grades to URMS</DialogTitle>
          <DialogDescription>
            Automatically submit student grades directly to the URMS portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Step 1: Open URMS Portal</h4>
            <p className="text-sm text-muted-foreground">
              Click the button below to open the URMS portal in a new window. Please navigate to the Result Entry page.
            </p>
            <Button onClick={handleOpenUrms} variant="outline" className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open URMS Portal
            </Button>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Step 2: Copy the Auto-Populate Script</h4>
            <p className="text-sm text-muted-foreground">
              We've generated a smart script containing all your students' calculated grades. It will automatically find the students on the URMS page and fill in their grade inputs.
            </p>
            <Button onClick={handleCopyScript} variant="secondary" className="w-full">
              Copy Auto-Populate Script
            </Button>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Step 3: Run Script & Save</h4>
            <p className="text-sm text-muted-foreground">
              Go to the URMS page you opened in Step 1. Right-click anywhere and select <strong>Inspect</strong>, then go to the <strong>Console</strong> tab. 
              Paste the script you copied and press <strong>Enter</strong>.
            </p>
            <div className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto text-muted-foreground">
              <span className="text-green-600">// It will highlight the rows green and fill the inputs!</span><br/>
              <span className="text-green-600">// After it finishes, review the page and manually click the URMS Save button.</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
