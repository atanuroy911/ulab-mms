'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Edit2, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface RubricCriterion {
  key: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
  label: string;
  co?: string;
  descriptions: string[];
}

interface RubricTemplate {
  _id: string;
  name: string;
  slug: string;
  criteria: RubricCriterion[];
  isSystem: boolean;
}

const EMPTY_CRITERIA: RubricCriterion[] = (['c1', 'c2', 'c3', 'c4', 'c5'] as const).map(key => ({
  key,
  label: '',
  co: '',
  descriptions: ['', '', '', ''],
}));

export default function RubricManagement() {
  const [rubrics, setRubrics] = useState<RubricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [criteria, setCriteria] = useState<RubricCriterion[]>(EMPTY_CRITERIA);

  useEffect(() => {
    fetchRubrics();
  }, []);

  const fetchRubrics = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/rubrics');
      if (!res.ok) throw new Error('Failed to fetch rubrics');
      const data = await res.json();
      setRubrics(data);
    } catch (error) {
      console.error('Error fetching rubrics:', error);
      toast.error('Failed to load rubrics');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (rubric?: RubricTemplate) => {
    if (rubric) {
      setIsEditMode(true);
      setEditingId(rubric._id);
      setName(rubric.name);
      setSlug(rubric.slug);
      setCriteria(rubric.criteria.map(c => ({ ...c, descriptions: [...c.descriptions] })));
    } else {
      setIsEditMode(false);
      setEditingId(null);
      setName('');
      setSlug('');
      setCriteria(EMPTY_CRITERIA.map(c => ({ ...c, descriptions: [...c.descriptions] })));
    }
    setShowDialog(true);
  };

  const updateCriterionField = (index: number, field: 'label' | 'co', value: string) => {
    setCriteria(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const updateDescription = (index: number, level: number, value: string) => {
    setCriteria(prev =>
      prev.map((c, i) =>
        i === index
          ? { ...c, descriptions: c.descriptions.map((d, li) => (li === level ? value : d)) }
          : c
      )
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Rubric name is required');
      return;
    }
    if (!isEditMode && !slug.trim()) {
      toast.error('Rubric slug is required');
      return;
    }
    if (criteria.some(c => !c.label.trim())) {
      toast.error('All 5 criteria need a label');
      return;
    }

    setSubmitting(true);
    try {
      const url = isEditMode ? `/api/admin/rubrics/${editingId}` : '/api/admin/rubrics';
      const method = isEditMode ? 'PUT' : 'POST';
      const body = isEditMode
        ? { name: name.trim(), criteria }
        : { name: name.trim(), slug: slug.trim(), criteria };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save rubric');
      }

      toast.success(isEditMode ? 'Rubric updated successfully' : 'Rubric created successfully');
      setShowDialog(false);
      fetchRubrics();
    } catch (error: any) {
      console.error('Error saving rubric:', error);
      toast.error(error.message || 'Failed to save rubric');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rubric: RubricTemplate) => {
    if (!confirm(`Delete rubric "${rubric.name}"? This cannot be undone.`)) return;

    setDeleting(rubric._id);
    try {
      const res = await fetch(`/api/admin/rubrics/${rubric._id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete rubric');
      }
      toast.success('Rubric deleted successfully');
      fetchRubrics();
    } catch (error: any) {
      console.error('Error deleting rubric:', error);
      toast.error(error.message || 'Failed to delete rubric');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Rubric Management</CardTitle>
            <CardDescription>
              Manage the rubric templates teachers can select when marking Project sections
              (e.g. presentations, demos, reports).
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rubric
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rubrics.length > 0 ? (
            rubrics.map(rubric => (
              <div
                key={rubric._id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{rubric.name}</h4>
                    {rubric.isSystem && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        <ShieldCheck className="h-3 w-3" /> Built-in
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {rubric.criteria.map(c => c.label).join(' · ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenDialog(rubric)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(rubric)}
                    disabled={deleting === rubric._id || rubric.isSystem}
                    title={rubric.isSystem ? 'Built-in rubrics cannot be deleted' : undefined}
                  >
                    {deleting === rubric._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">No rubrics yet.</p>
          )}
        </div>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Rubric' : 'Create New Rubric'}</DialogTitle>
            <DialogDescription>
              Each rubric has exactly 5 criteria, each scored 0-3. Marks are computed as
              Σ (score/3) × (total marks / 5) across the 5 criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rubric-name">Rubric Name *</Label>
                <Input
                  id="rubric-name"
                  placeholder="e.g., Presentation Rubric"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              {!isEditMode && (
                <div className="space-y-2">
                  <Label htmlFor="rubric-slug">Slug *</Label>
                  <Input
                    id="rubric-slug"
                    placeholder="e.g., presentation"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {criteria.map((c, index) => (
                <div key={c.key} className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{c.key.toUpperCase()}</span>
                    <Input
                      placeholder="Criterion label"
                      value={c.label}
                      onChange={e => updateCriterionField(index, 'label', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                  <Input
                    placeholder="CO/PO mapping (optional)"
                    value={c.co || ''}
                    onChange={e => updateCriterionField(index, 'co', e.target.value)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map(level => (
                      <div key={level} className="space-y-1">
                        <Label className="text-xs">Level {level} description</Label>
                        <Input
                          value={c.descriptions[level] || ''}
                          onChange={e => updateDescription(index, level, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Rubric'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
