'use client';

import { Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const STEPS = [
  'Enter your complete Student ID in the search box above',
  'Click the "Search" button to retrieve your marks',
  'View all your courses by clicking on each course card',
  'See detailed marks including raw, weighted, and CO-wise breakdowns',
];

export function InstructionsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          How to Check Your Marks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {STEPS.map((step, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5 shrink-0">{idx + 1}</Badge>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ul>

        <Separator />

        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm">
            <strong>Note:</strong> Make sure you enter your Student ID exactly as it appears in your records
            (including hyphens or special characters if any).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
