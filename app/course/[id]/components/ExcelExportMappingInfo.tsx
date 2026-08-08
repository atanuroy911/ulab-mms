'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_EXCEL_EXPORT_MAPPING, EXCEL_EXPORT_FIELD_OPTIONS } from '../lib/excelExportMapping';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

export default function ExcelExportMappingInfo() {
  const getFieldLabel = (value: string) => {
    return EXCEL_EXPORT_FIELD_OPTIONS.find(opt => opt.value === value)?.label || value;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Alert className="bg-blue-500/10 border-blue-500/50">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-sm text-blue-700 dark:text-blue-300">
          The Excel Export feature automatically fills a pre-defined Excel template with your course data. 
          Below is the static mapping of which data goes into which Excel cells.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Target Sheet: {DEFAULT_EXCEL_EXPORT_MAPPING.sheetName}</CardTitle>
          <CardDescription>
            The system looks for a worksheet named <strong>{DEFAULT_EXCEL_EXPORT_MAPPING.sheetName}</strong> in your template file.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Single Cell Mappings</CardTitle>
            <CardDescription>Data written to specific individual cells.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Data Field</th>
                    <th className="px-4 py-2 text-left font-medium">Excel Cell</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DEFAULT_EXCEL_EXPORT_MAPPING.singleCells?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 font-medium">{getFieldLabel(item.field)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{item.cell}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Range Mappings</CardTitle>
            <CardDescription>Data written down a column for each student.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Data Field</th>
                    <th className="px-4 py-2 text-left font-medium">Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DEFAULT_EXCEL_EXPORT_MAPPING.rangeMappings?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 font-medium">
                        {getFieldLabel(item.field)}
                        {item.sheetName && item.sheetName !== DEFAULT_EXCEL_EXPORT_MAPPING.sheetName && (
                          <div className="text-xs text-muted-foreground mt-0.5">Sheet: {item.sheetName}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {item.from} - {item.to}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
