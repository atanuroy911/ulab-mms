'use client';

import { useCallback, useEffect, useMemo, useRef, useState, use as usePromise } from 'react';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Loader2,
  Save,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  PanelRight,
  Plus,
  Copy as CopyIcon,
  Trash2,
  Unlink,
  PenLine,
  SlidersHorizontal,
  Maximize2,
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { toast } from 'sonner';

import { nodeTypes, NODE_PALETTE, inputName } from './nodes';
import { NodeInspector } from './NodeInspector';
import { CanvasContextMenu } from './CanvasContextMenu';
import { useMediaQuery, BREAKPOINTS } from '@/lib/useMediaQuery';

interface ValidationIssue {
  nodeId?: string;
  message: string;
}

interface SchemeDoc {
  _id: string;
  name: string;
  description: string;
  department: string;
  track: 'A' | 'B' | 'C' | null;
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; targetHandle?: string | null }>;
  currentVersion: number;
  validation: ValidationIssue[];
  canEdit: boolean;
}

/**
 * Shortcut hint prefix. Resolved on the client only - reading navigator during render would
 * make the server and client markup disagree, so this starts as the Ctrl form and corrects
 * itself after hydration on a Mac.
 */
function useModKeyLabel(): string {
  const [label, setLabel] = useState('Ctrl+');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
      setLabel('⌘');
    }
  }, []);
  return label;
}

let idCounter = 0;
function newNodeId(type: string) {
  idCounter += 1;
  return `${type}_${Date.now().toString(36)}_${idCounter}`;
}

function EditorInner({ id }: { id: string }) {
  const router = useRouter();
  const viewer = useStaffViewer();
  // The /admin panel's web-admin goes back to its own Grading Schemes tab.
  const schemesListHref =
    viewer.status === 'webAdmin' ? '/admin/dashboard?tab=grading-schemes' : '/capstone/grading-schemes';
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [scheme, setScheme] = useState<SchemeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [name, setName] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    | { kind: 'node'; x: number; y: number; nodeId: string }
    | { kind: 'edge'; x: number; y: number; edgeId: string }
    | { kind: 'pane'; x: number; y: number }
    | null
  >(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const modKeyLabel = useModKeyLabel();

  // From lg up the inspector is a permanent side panel, so selecting a block must NOT also
  // open the slide-over - that showed the same form twice, one on top of the other. Below
  // lg there is no side panel and the slide-over is the only way to reach it.
  const hasSidePanel = useMediaQuery(BREAKPOINTS.lg);

  // Widening the window while the slide-over is open would bring the side panel in behind
  // it and show the form twice again.
  useEffect(() => {
    if (hasSidePanel) setInspectorOpen(false);
  }, [hasSidePanel]);

  const selectBlock = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setSelectedEdgeId(null);
      if (!hasSidePanel) setInspectorOpen(true);
    },
    [hasSidePanel]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Tracks whether there are unsaved changes, so we can warn on navigate-away rather than
  // silently discarding a graph someone spent time arranging.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/capstone/grading-schemes/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;

        setScheme(data);
        setName(data.name);
        setIssues(data.validation || []);
        setNodes(
          (data.nodes || []).map((n: SchemeDoc['nodes'][number]) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          }))
        );
        setEdges(
          (data.edges || []).map((e: SchemeDoc['edges'][number]) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            targetHandle: null,
            data: { input: e.targetHandle || 'in' },
            label: e.targetHandle || 'in',
            animated: true,
          }))
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load grading scheme');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, setNodes, setEdges]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const readOnly = !scheme?.canEdit;

  const markDirty = useCallback(() => setDirty(true), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      // Every edge carries a variable name. Defaulting to the source node's type keeps
      // names meaningful and unique-ish; the user renames it by clicking the edge.
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const base = (sourceNode?.data as Record<string, unknown>)?.label;
      const handle =
        typeof base === 'string' && base.trim()
          ? base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'in'
          : 'in';

      setEdges((eds) => {
        // A formula/sum node keyed by name must not receive two inputs under the same
        // name - the second would overwrite the first with no visible cause.
        const taken = new Set(
          eds.filter((e) => e.target === connection.target).map(inputName)
        );
        let unique = handle;
        let n = 2;
        while (taken.has(unique)) {
          unique = `${handle}_${n}`;
          n += 1;
        }
        return addEdge(
          {
            ...connection,
            id: `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            targetHandle: null,
            data: { input: unique },
            label: unique,
            animated: true,
          },
          eds
        );
      });
      markDirty();
    },
    [nodes, readOnly, setEdges, markDirty]
  );

  const addNode = useCallback(
    (type: string, defaults: Record<string, unknown>, screenPoint?: { x: number; y: number }) => {
      if (readOnly) return;
      // Placed where the user right-clicked when a point is given, otherwise near the middle
      // of the current viewport - so a new block lands where they are looking however far
      // they have panned, rather than at a fixed canvas coordinate.
      const fallback = { x: (wrapperRef.current?.clientWidth ?? 800) / 2, y: (wrapperRef.current?.clientHeight ?? 600) / 2 };
      const position = rf
        ? rf.screenToFlowPosition(screenPoint ?? fallback)
        : { x: 250, y: 200 };

      // Only jitter the auto-placed case; a deliberate right-click should land exactly
      // where it was aimed.
      const jitter = screenPoint ? 0 : 30;

      const node: Node = {
        id: newNodeId(type),
        type,
        position: {
          x: position.x + (jitter ? Math.random() * jitter * 2 - jitter : 0),
          y: position.y + (jitter ? Math.random() * jitter * 2 - jitter : 0),
        },
        data: { ...defaults },
      };
      setNodes((nds) => [...nds, node]);
      setSelectedId(node.id);
      markDirty();
      return node.id;
    },
    [rf, readOnly, setNodes, markDirty]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
      markDirty();
    },
    [setNodes, markDirty]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedId(null);
      markDirty();
    },
    [setNodes, setEdges, markDirty]
  );

  /** Copies a block and its settings, offset so it doesn't land exactly on the original. */
  const duplicateNode = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      const source = nodes.find((n) => n.id === nodeId);
      if (!source) return;

      // Connections are deliberately NOT copied. A duplicated formula block wired to the
      // same inputs would silently double-count those marks in the total, which is the kind
      // of mistake that only shows up after a cohort is graded.
      const copy: Node = {
        id: newNodeId(source.type || 'node'),
        type: source.type,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        data: {
          ...(source.data as Record<string, unknown>),
          label: `${(source.data as Record<string, unknown>).label || source.type} (copy)`,
        },
      };
      setNodes((nds) => [...nds, copy]);
      setSelectedId(copy.id);
      markDirty();
      toast.success('Block duplicated — its connections were not copied');
    },
    [nodes, readOnly, setNodes, markDirty]
  );

  /** Removes every connection into and out of a block, leaving the block itself. */
  const disconnectNode = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      const affected = edges.filter((e) => e.source === nodeId || e.target === nodeId);
      if (affected.length === 0) {
        toast.info('That block has no connections');
        return;
      }
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      markDirty();
      toast.success(`Removed ${affected.length} connection${affected.length === 1 ? '' : 's'}`);
    },
    [edges, readOnly, setEdges, markDirty]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      if (readOnly) return;
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      markDirty();
    },
    [readOnly, setEdges, markDirty]
  );

  const renameEdge = useCallback(
    (edge: Edge) => {
      if (readOnly) return;
      const next = window.prompt(
        'Name this input.\n\nFormula blocks reference it as a variable; Sum blocks weight it by this name.',
        inputName(edge)
      );
      if (!next) return;
      const clean = next.trim().replace(/[^A-Za-z0-9_]/g, '_');
      if (!clean || /^[0-9]/.test(clean)) {
        toast.error('An input name must start with a letter or underscore');
        return;
      }
      const clash = edges.some(
        (e) => e.id !== edge.id && e.target === edge.target && inputName(e) === clean
      );
      if (clash) {
        toast.error(`That block already has an input called "${clean}"`);
        return;
      }
      setEdges((eds) =>
        eds.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, input: clean }, label: clean } : e))
      );
      markDirty();
    },
    [edges, readOnly, setEdges, markDirty]
  );

  const serialize = useCallback(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        // Strip the transient validation flag - it is UI state, not part of the scheme.
        data: Object.fromEntries(Object.entries(n.data as object).filter(([k]) => k !== '__invalid')),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        targetHandle: inputName(e),
      })),
    }),
    [nodes, edges]
  );

  const save = useCallback(
    async (publish = false) => {
      if (readOnly) return;
      publish ? setPublishing(true) : setSaving(true);
      try {
        const res = await fetch(`/api/capstone/grading-schemes/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ...serialize(), ...(publish ? { publish: true } : {}) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setIssues(data.issues || []);
          throw new Error(data.error || 'Failed to save');
        }
        setIssues(data.validation || []);
        setScheme((prev) => (prev ? { ...prev, currentVersion: data.currentVersion } : prev));
        setDirty(false);
        toast.success(publish ? `Published version ${data.currentVersion}` : 'Draft saved');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        publish ? setPublishing(false) : setSaving(false);
      }
    },
    [id, name, serialize, readOnly]
  );

  // Keyboard shortcuts, mirroring the right-click menu so both routes do the same thing.
  //
  // Deliberately scoped: the handler bails when focus is in a text field, otherwise typing
  // "d" into a formula expression or pressing Backspace in the name box would mutate the
  // graph instead of the text.
  useEffect(() => {
    if (readOnly) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing) return;

      const mod = event.metaKey || event.ctrlKey;

      if (event.key === 'Escape') {
        setMenu(null);
        setSelectedId(null);
        setSelectedEdgeId(null);
        return;
      }

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save(false);
        return;
      }

      if (mod && event.key.toLowerCase() === 'd') {
        if (!selectedId) return;
        event.preventDefault();
        duplicateNode(selectedId);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // An edge selection takes precedence: clicking a connection to remove it is the
        // more specific intent, and the node stays selected underneath it.
        if (selectedEdgeId) {
          event.preventDefault();
          deleteEdge(selectedEdgeId);
          setSelectedEdgeId(null);
          return;
        }
        if (selectedId) {
          event.preventDefault();
          deleteNode(selectedId);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, selectedId, selectedEdgeId, duplicateNode, deleteNode, deleteEdge, save]);

  // Paint the nodes the server flagged, so a validation error points at a block instead of
  // just naming one in a list.
  const issueNodeIds = useMemo(
    () => new Set(issues.map((i) => i.nodeId).filter(Boolean) as string[]),
    [issues]
  );

  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) =>
        issueNodeIds.has(n.id) === Boolean((n.data as Record<string, unknown>).__invalid)
          ? n
          : { ...n, data: { ...n.data, __invalid: issueNodeIds.has(n.id) } }
      ),
    [nodes, issueNodeIds]
  );

  // The selected connection is drawn thicker and in the accent colour, so Delete visibly
  // applies to something rather than appearing to do nothing.
  const decoratedEdges = useMemo(
    () =>
      edges.map((e) =>
        e.id === selectedEdgeId
          ? { ...e, style: { ...e.style, stroke: 'var(--primary)', strokeWidth: 2.5 } }
          : e
      ),
    [edges, selectedEdgeId]
  );

  const selectedNode = decoratedNodes.find((n) => n.id === selectedId) || null;

  if (loading) {
    return (
      <TeacherShell title="Grading Scheme">
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </TeacherShell>
    );
  }

  if (!scheme) {
    return (
      <TeacherShell title="Grading Scheme">
        <div className="mx-auto max-w-2xl p-8 text-center">
          <p className="text-muted-foreground">This grading scheme could not be loaded.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(schemesListHref)}>
            Back to grading schemes
          </Button>
        </div>
      </TeacherShell>
    );
  }

  // Node id -> label, so the inspector can say which block each input came from instead of
  // showing an opaque generated id.
  const sourceLabels = Object.fromEntries(
    nodes.map((n) => [n.id, ((n.data as Record<string, unknown>).label as string) || n.type || n.id])
  );

  const inspector = (
    <NodeInspector
      node={selectedNode}
      edges={edges}
      sourceLabels={sourceLabels}
      readOnly={readOnly}
      onChange={updateNodeData}
      onDelete={deleteNode}
      onRenameInput={(edgeId) => {
        const edge = edges.find((e) => e.id === edgeId);
        if (edge) renameEdge(edge);
      }}
      onInsertVariable={(name) => {
        if (!selectedNode || selectedNode.type !== 'formula') return;
        const data = selectedNode.data as Record<string, unknown>;
        const current = typeof data.expression === 'string' ? data.expression : '';
        // Appended with a space rather than replacing, so clicking several variables builds
        // an expression up instead of clobbering what is already typed.
        const next = current.trim() ? `${current.trim()} ${name}` : name;
        updateNodeData(selectedNode.id, { ...data, expression: next });
      }}
      groupsHref={scheme?.department ? '/capstone/sessions' : undefined}
    />
  );

  return (
    <TeacherShell title="Grading Scheme" subtitle={scheme.name} noScroll>
      {/* Toolbar */}
      <div className="border-b bg-card/50">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => router.push(schemesListHref)}
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Back</span>
          </Button>

          <Input
            value={name}
            disabled={readOnly}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className="h-9 w-full min-w-0 flex-1 sm:w-64 sm:flex-none"
            placeholder="Scheme name"
          />

          <Badge variant="outline" className="shrink-0">
            {scheme.department}
            {scheme.track ? ` · ${scheme.track}` : ''}
          </Badge>

          <Badge variant={scheme.currentVersion > 0 ? 'secondary' : 'outline'} className="shrink-0">
            {scheme.currentVersion > 0 ? `v${scheme.currentVersion}` : 'unpublished'}
          </Badge>

          {issues.length === 0 ? (
            <span className="hidden items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 md:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valid
            </span>
          ) : (
            <span className="hidden items-center gap-1 text-xs text-destructive md:inline-flex">
              <AlertTriangle className="h-3.5 w-3.5" />
              {issues.length} issue{issues.length === 1 ? '' : 's'}
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!readOnly && (
              <>
                <Button size="sm" variant="outline" onClick={() => save(false)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
                  ) : (
                    <Save className="h-4 w-4 sm:mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Save draft</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => save(true)}
                  disabled={publishing || issues.length > 0}
                  title={issues.length > 0 ? 'Fix the issues below before publishing' : undefined}
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
                  ) : (
                    <Upload className="h-4 w-4 sm:mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Publish</span>
                </Button>
              </>
            )}

            {/* The inspector is a slide-over below lg, where there is no room for a fixed
                side panel next to a canvas that needs the width. */}
            <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" className="lg:hidden">
                  <PanelRight className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
                <SheetTitle className="border-b px-4 py-3 text-sm">Block settings</SheetTitle>
                {inspector}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Palette */}
        {!readOnly && (
          <div className="flex gap-1.5 overflow-x-auto border-t px-3 py-2 sm:px-4">
            {NODE_PALETTE.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  title={item.description}
                  onClick={() => addNode(item.type, { ...item.defaults })}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Plus className="h-3 w-3 opacity-60" />
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="border-b bg-destructive/5 px-3 py-2 sm:px-4">
          <ul className="space-y-0.5 text-xs text-destructive">
            {issues.slice(0, 5).map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {issue.nodeId && (
                    <button
                      className="underline underline-offset-2"
                      onClick={() => selectBlock(issue.nodeId!)}
                    >
                      {(nodes.find((n) => n.id === issue.nodeId)?.data as Record<string, unknown>)
                        ?.label as string || issue.nodeId}
                    </button>
                  )}
                  {issue.nodeId ? ': ' : ''}
                  {issue.message}
                </span>
              </li>
            ))}
            {issues.length > 5 && <li className="opacity-70">+{issues.length - 5} more</li>}
          </ul>
        </div>
      )}

      {/* Canvas + inspector */}
      <div className="flex min-h-0 flex-1">
        <div ref={wrapperRef} className="relative min-h-[60vh] flex-1">
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              if (changes.some((c) => c.type === 'position' || c.type === 'remove')) markDirty();
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              if (changes.some((c) => c.type === 'remove')) markDirty();
            }}
            onConnect={onConnect}
            onInit={setRf}
            onNodeClick={(_, node) => selectBlock(node.id)}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onEdgeDoubleClick={(_, edge) => renameEdge(edge)}
            onPaneClick={() => {
              setSelectedId(null);
              setSelectedEdgeId(null);
              setMenu(null);
            }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              // Selects without opening the slide-over: the menu itself is the overlay
              // here, and stacking a sheet behind it would be two panels again.
              setSelectedId(node.id);
              setSelectedEdgeId(null);
              setMenu({ kind: 'node', x: event.clientX, y: event.clientY, nodeId: node.id });
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              setSelectedEdgeId(edge.id);
              setMenu({ kind: 'edge', x: event.clientX, y: event.clientY, edgeId: edge.id });
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              const e = event as React.MouseEvent;
              setMenu({ kind: 'pane', x: e.clientX, y: e.clientY });
            }}
            onMoveStart={() => setMenu(null)}
            nodeTypes={nodeTypes}
            // React Flow binds Backspace to delete by default. Left on, it would race the
            // handler above (both removing the same node, with different selection and
            // dirty-flag bookkeeping) and would still fire for read-only viewers, who have
            // no other way to mutate the graph. Deletion is owned by our handler alone.
            deleteKeyCode={null}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden sm:!block" />
          </ReactFlow>

          {menu && !readOnly && (
            <CanvasContextMenu
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              header={
                menu.kind === 'node'
                  ? ((nodes.find((n) => n.id === menu.nodeId)?.data as Record<string, unknown>)
                      ?.label as string) || 'Block'
                  : menu.kind === 'edge'
                    ? `Connection: ${(() => { const found = edges.find((e) => e.id === menu.edgeId); return found ? inputName(found) : 'in'; })()}`
                    : 'Add a block'
              }
              sections={
                menu.kind === 'node'
                  ? [
                      {
                        key: 'edit',
                        items: [
                          {
                            key: 'settings',
                            label: 'Open settings',
                            icon: SlidersHorizontal,
                            // On a wide screen the panel is already open; this just moves
                            // the selection to this block.
                            onSelect: () => selectBlock(menu.nodeId),
                          },
                          {
                            key: 'duplicate',
                            label: 'Duplicate',
                            icon: CopyIcon,
                            hint: modKeyLabel + 'D',
                            onSelect: () => duplicateNode(menu.nodeId),
                          },
                          {
                            key: 'disconnect',
                            label: 'Disconnect all',
                            icon: Unlink,
                            disabled: !edges.some(
                              (e) => e.source === menu.nodeId || e.target === menu.nodeId
                            ),
                            onSelect: () => disconnectNode(menu.nodeId),
                          },
                        ],
                      },
                      {
                        key: 'danger',
                        items: [
                          {
                            key: 'delete',
                            label: 'Delete block',
                            icon: Trash2,
                            hint: 'Del',
                            destructive: true,
                            onSelect: () => deleteNode(menu.nodeId),
                          },
                        ],
                      },
                    ]
                  : menu.kind === 'edge'
                    ? [
                        {
                          key: 'edge',
                          items: [
                            {
                              key: 'rename',
                              label: 'Rename input…',
                              icon: PenLine,
                              onSelect: () => {
                                const edge = edges.find((e) => e.id === menu.edgeId);
                                if (edge) renameEdge(edge);
                              },
                            },
                          ],
                        },
                        {
                          key: 'danger',
                          items: [
                            {
                              key: 'delete',
                              label: 'Delete connection',
                              icon: Trash2,
                              hint: 'Del',
                              destructive: true,
                              onSelect: () => deleteEdge(menu.edgeId),
                            },
                          ],
                        },
                      ]
                    : [
                        {
                          key: 'add',
                          items: NODE_PALETTE.map((item) => ({
                            key: item.type,
                            label: item.label,
                            icon: item.icon,
                            // Placed at the click point, so right-click-to-add puts the
                            // block exactly where it was aimed.
                            onSelect: () =>
                              addNode(item.type, { ...item.defaults }, { x: menu.x, y: menu.y }),
                          })),
                        },
                        {
                          key: 'view',
                          items: [
                            {
                              key: 'fit',
                              label: 'Fit to view',
                              icon: Maximize2,
                              onSelect: () => rf?.fitView({ duration: 200 }),
                            },
                          ],
                        },
                      ]
              }
            />
          )}

          <p className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border lg:block">
            Drag between the dots to connect · right-click for options · {modKeyLabel}D duplicate ·
            Del removes the selection
          </p>
        </div>

        {/* Fixed inspector from lg up */}
        <aside className="hidden w-80 shrink-0 border-l bg-card/30 lg:flex lg:flex-col">
          <div className="border-b px-4 py-3 text-sm font-medium">Block settings</div>
          {inspector}
        </aside>
      </div>
    </TeacherShell>
  );
}

export default function GradingSchemeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  return (
    <ReactFlowProvider>
      <EditorInner id={id} />
    </ReactFlowProvider>
  );
}
