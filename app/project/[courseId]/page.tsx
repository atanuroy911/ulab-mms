'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';

interface StudentInfo {
  _id: string;
  name: string;
  studentId: string;
}

interface GroupEntry {
  _id: string;
  groupNumber: number;
  projectTitle: string;
  studentIds: StudentInfo[];
}

interface CourseInfo {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
}

export default function ProjectCheckinPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { data: session, status } = useSession();

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [maxMembers, setMaxMembers] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Identity is resolved server-side from the signed-in Google account, never chosen by the
  // client - `me` is null if the session's Google name couldn't be matched to exactly one
  // student on this course's roster.
  const [me, setMe] = useState<StudentInfo | null>(null);

  // Title editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const isGoogleVerified = status === 'authenticated' && !!session?.user?.email?.toLowerCase().endsWith('@ulab.edu.bd');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/project/${courseId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load'); return; }
      setCourse(data.course);
      setStudents(data.students || []);
      setGroups(data.groups || []);
      setIsActive(data.isActive);
      setMaxMembers(data.maxMembersPerGroup ?? 4);
      setMe(data.me || null);
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!isGoogleVerified) { setLoading(false); return; }
    fetchData();
  }, [isGoogleVerified, fetchData]);

  // Auto-refresh every 15s when active
  useEffect(() => {
    if (!isActive || !isGoogleVerified) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isActive, isGoogleVerified, fetchData]);

  const myGroup = me
    ? groups.find(g => g.studentIds.some(s => s._id === me._id))
    : null;

  const assignedStudentIds = new Set(groups.flatMap(g => g.studentIds.map(s => s._id)));
  const unassignedStudents = students.filter(s => !assignedStudentIds.has(s._id));

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await signIn('google-project', { callbackUrl: window.location.href });
  };

  const doAction = async (action: string, extra?: object) => {
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`/api/project/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Action failed'); return; }
      setGroups(data.groups || []);
      if (action === 'createGroup') setActionSuccess('Group created! You\'ve been added as the first member.');
      if (action === 'join') setActionSuccess('Successfully joined the group!');
      if (action === 'leave') setActionSuccess('You have left the group.');
      if (action === 'setTitle') { setActionSuccess('Project title updated!'); setEditingGroupId(null); }
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading' || (loading && isGoogleVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-violet-300 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isGoogleVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="rounded-2xl border border-white/10 p-8 text-center max-w-sm"
          style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}>
          <div className="text-4xl mb-3">🔐</div>
          <p className="text-white font-semibold mb-1">Sign in to continue</p>
          <p className="text-white/50 text-sm mb-5">
            Sign in with your ULAB Google account so we can confirm it&apos;s really you before joining a group.
          </p>
          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff' }}
          >
            {signingIn ? 'Redirecting to Google...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="bg-red-900/30 border border-red-500/40 rounded-2xl p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-red-300 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  const pageStyle = { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' };
  const cardStyle = { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' };

  return (
    <div className="min-h-screen" style={pageStyle}>
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/10"
        style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white">{course?.name}</h1>
            <p className="text-xs text-violet-300">{course?.code} • {course?.semester} {course?.year}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            isActive
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {isActive ? 'Open' : 'Closed'}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Session closed banner */}
        {!isActive && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-amber-300 font-medium">Project session is not active</p>
            <p className="text-amber-400/60 text-sm mt-1">Wait for your instructor to open the session.</p>
          </div>
        )}

        {/* Step 1: Identity, resolved from your signed-in Google account */}
        <div className="rounded-2xl border border-white/10 p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
            👤 Step 1 — Who are you?
          </h2>
          {me ? (
            <div className="flex items-center justify-between bg-violet-500/20 border border-violet-500/30 rounded-xl px-4 py-3">
              <div>
                <p className="font-semibold text-white">{me.name}</p>
                <p className="text-sm text-violet-300">{me.studentId}</p>
              </div>
              <span className="text-xs text-violet-300 bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 rounded-lg">
                Verified via Google
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300 text-sm">
              We couldn&apos;t match your Google account ({session?.user?.name}) to a student on this course&apos;s
              roster. Ask your instructor to confirm your name/ID in the roster, or make sure your Google
              display name includes your student ID in parentheses.
            </div>
          )}
        </div>

        {/* Step 2: Group actions — only shown once identified */}
        {me && isActive && (
          <div className="rounded-2xl border border-white/10 p-5" style={cardStyle}>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
              🏷️ Step 2 — Your Group
            </h2>

            {/* Feedback */}
            {actionError && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="mb-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300 text-sm flex items-center gap-2">
                <span>✓</span> {actionSuccess}
              </div>
            )}

            {myGroup ? (
              /* ── Already in a group ── */
              <div className="space-y-4">
                <div className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-white text-lg">Group {myGroup.groupNumber}</span>
                    <span className="text-xs text-white/50 bg-white/10 px-2.5 py-1 rounded-full">
                      {myGroup.studentIds.length}/{maxMembers} members
                    </span>
                  </div>

                  {/* Project title */}
                  {editingGroupId === myGroup._id ? (
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={titleInput}
                        onChange={e => setTitleInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && doAction('setTitle', { groupId: myGroup._id, projectTitle: titleInput })}
                        placeholder="Enter project title..."
                        className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:border-violet-400 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => doAction('setTitle', { groupId: myGroup._id, projectTitle: titleInput })}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingGroupId(null)}
                        className="px-3 py-2 border border-white/20 text-white/70 rounded-xl text-sm hover:bg-white/10">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm flex-1">
                        {myGroup.projectTitle
                          ? <span className="text-white font-medium">📁 {myGroup.projectTitle}</span>
                          : <span className="text-white/30 italic">No project title yet</span>}
                      </span>
                      <button
                        onClick={() => { setEditingGroupId(myGroup._id); setTitleInput(myGroup.projectTitle || ''); }}
                        className="text-xs text-violet-400 hover:text-white border border-violet-500/40 px-2.5 py-1 rounded-lg transition-all"
                      >
                        ✏️ {myGroup.projectTitle ? 'Edit' : 'Set Title'}
                      </button>
                    </div>
                  )}

                  {/* Members */}
                  <div className="space-y-1.5">
                    {myGroup.studentIds.map(s => (
                      <div key={s._id} className="flex items-center gap-2.5 bg-white/5 rounded-lg px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{s.name}</p>
                          <p className="text-xs text-violet-300">{s.studentId}</p>
                        </div>
                        {s._id === me._id ? (
                          <span className="ml-auto text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">You</span>
                        ) : (
                          <button
                            onClick={() => doAction('leave', { groupId: myGroup._id, studentId: s._id })}
                            disabled={actionLoading}
                            className="ml-auto text-xs text-red-400/70 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2 py-0.5 rounded-full transition-all disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add teammate — only the person who signed in needs to; teammates are
                      added without them logging in themselves. */}
                  {unassignedStudents.length > 0 && myGroup.studentIds.length < maxMembers && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">Add a teammate (they don&apos;t need to sign in):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {unassignedStudents.map(s => (
                          <button
                            key={s._id}
                            onClick={() => doAction('join', { groupId: myGroup._id, studentId: s._id })}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-white/15 bg-white/5 text-white/60 hover:border-violet-400/50 hover:text-violet-300 hover:bg-violet-500/10 transition-all disabled:opacity-50"
                          >
                            + {s.name} <span className="opacity-50">({s.studentId})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => doAction('leave', { groupId: myGroup._id })}
                  disabled={actionLoading}
                  className="w-full py-2.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '🚪 Leave Group'}
                </button>
              </div>
            ) : (
              /* ── Not in a group yet ── */
              <div className="space-y-3">
                <p className="text-white/50 text-sm">You are not in a group yet. Create a new one or join an existing group below.</p>
                <button
                  onClick={() => doAction('createGroup')}
                  disabled={actionLoading}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff' }}
                >
                  {actionLoading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : '✨'}
                  Create a New Group
                </button>
                <p className="text-center text-white/30 text-xs">— or scroll down to join an existing group —</p>
              </div>
            )}
          </div>
        )}

        {/* Groups list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              All Groups
              <span className="ml-2 text-sm font-normal text-white/40">
                ({groups.length} group{groups.length !== 1 ? 's' : ''} • max {maxMembers}/group)
              </span>
            </h2>
            <button onClick={fetchData} className="text-xs text-violet-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
              ↻ Refresh
            </button>
          </div>

          {groups.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-white/40 text-sm">
                {isActive && me
                  ? 'No groups yet — be the first to create one!'
                  : 'No groups yet.'}
              </p>
            </div>
          )}

          {groups.map(group => {
            const isFull = group.studentIds.length >= maxMembers;
            const isMine = myGroup?._id === group._id;
            const canJoin = isActive && me && !myGroup && !isFull;

            return (
              <div
                key={group._id}
                className={`rounded-2xl border p-4 transition-all ${
                  isMine
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base ${
                      isMine ? 'bg-violet-500/30 text-violet-200' : 'bg-white/10 text-white/70'
                    }`}>
                      {group.groupNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">Group {group.groupNumber}</span>
                        {isMine && <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">Yours</span>}
                        {isFull && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Full</span>}
                      </div>
                      <p className="text-xs mt-0.5">
                        {group.projectTitle
                          ? <span className="text-white/70">📁 {group.projectTitle}</span>
                          : <span className="text-white/25 italic">No title</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-white/40 bg-white/5 px-2.5 py-1 rounded-full whitespace-nowrap">
                    {group.studentIds.length}/{maxMembers}
                  </span>
                </div>

                {/* Members */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {group.studentIds.length === 0
                    ? <span className="text-xs text-white/25 italic">No members</span>
                    : group.studentIds.map(s => (
                      <span key={s._id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                          s._id === me?._id
                            ? 'bg-violet-500/30 text-violet-200 border border-violet-500/40'
                            : 'bg-white/10 text-white/70'
                        }`}>
                        <span className="font-semibold">{s.name}</span>
                        <span className="opacity-50">({s.studentId})</span>
                      </span>
                    ))}
                </div>

                {/* Join button */}
                {canJoin && (
                  <button
                    onClick={() => doAction('join', { groupId: group._id })}
                    disabled={actionLoading}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 border border-violet-500/40 text-violet-300 hover:bg-violet-500/20 flex items-center justify-center gap-2"
                  >
                    {actionLoading
                      ? <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      : '➕'}
                    Join Group {group.groupNumber}
                  </button>
                )}
                {isActive && me && !myGroup && isFull && (
                  <div className="w-full py-2 text-center text-white/25 text-xs rounded-xl bg-white/5">
                    Group is full
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Unassigned students */}
        {unassignedStudents.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
              ⏳ Not yet in a group
              <span className="text-white/30">({unassignedStudents.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {unassignedStudents.map(s => (
                <span key={s._id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border ${
                    s._id === me?._id
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}>
                  {s.name}
                  <span className="opacity-50">({s.studentId})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {unassignedStudents.length === 0 && groups.length > 0 && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400 flex items-center gap-2 text-center justify-center">
            🎉 All {students.length} students are in groups!
          </div>
        )}

        <p className="text-center text-xs text-white/15 pb-4">
          Auto-refreshes every 15 seconds • {course?.code}
        </p>
      </div>
    </div>
  );
}
