import React, { useEffect, useState } from 'react';
import { FileText, Users, Clock, MessageSquare, UserCircle, X, Send, Award, CheckCircle2 } from 'lucide-react';
import api, { getSubmissionAttachment } from '../api';
import AttachmentPreview from '../components/AttachmentPreview';

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();

const extractNumericToken = (value) => {
  const text = String(value ?? '');
  const hashMatch = text.match(/#(\d+)/);
  if (hashMatch?.[1]) return hashMatch[1];

  const digitMatch = text.match(/\b(\d{3,})\b/);
  return digitMatch?.[1] || '';
};

const isAnonymousPeerLabel = (value) => /anonymous\s+peer/i.test(String(value ?? ''));
const isStudentHashLabel = (value) => /^student\s*#\d+$/i.test(String(value ?? '').trim());

const toReadableError = (error) => {
  const data = error?.response?.data;
  const direct = typeof data === 'string' ? data : data?.message || data?.error || error?.message;
  const text = String(direct || '').trim();

  if (!text) {
    return 'Unable to submit grade right now. Please try again.';
  }

  const normalized = text.toLowerCase();
  if (normalized.includes('all') && normalized.includes('group') && normalized.includes('submit')) {
    return 'This group can be graded only after all members submit their work.';
  }

  return text;
};

const buildStudentLookup = (students = []) => {
  const byKey = new Map();

  (students || []).forEach((s) => {
    const labelName = pickFirstNonEmpty(s.fullName, s.name, s.studentName, 'Student');
    const labelId = pickFirstNonEmpty(s.studentId, s.rollNo, s.registrationNo, s.idNumber);
    const label = labelId ? `${labelName} (${labelId})` : labelName;

    const keys = [
      s.id,
      s.userId,
      s.studentId,
      s.rollNo,
      s.registrationNo,
      s.email,
      s.username
    ];

    keys.forEach((k) => {
      const normalized = normalizeKey(k);
      if (normalized) byKey.set(normalized, label);

      const numeric = extractNumericToken(k);
      if (numeric) {
        byKey.set(normalizeKey(numeric), label);
        byKey.set(normalizeKey(`#${numeric}`), label);
      }
    });
  });

  return byKey;
};

const resolveStudentLabel = (lookup, explicitName, explicitId, fallbackText) => {
  const fromId = lookup.get(normalizeKey(explicitId));
  if (fromId) return fromId;

  const numericFromId = extractNumericToken(explicitId);
  if (numericFromId) {
    const fromNumericId = lookup.get(normalizeKey(numericFromId)) || lookup.get(normalizeKey(`#${numericFromId}`));
    if (fromNumericId) return fromNumericId;
  }

  const numericFromName = extractNumericToken(explicitName);
  if (numericFromName) {
    const fromNumericName = lookup.get(normalizeKey(numericFromName)) || lookup.get(normalizeKey(`#${numericFromName}`));
    if (fromNumericName) return fromNumericName;
  }

  const name = String(explicitName ?? '').trim();
  const id = String(explicitId ?? '').trim();
  if (name && id) return `${name} (${id})`;
  if (name) return name;
  if (id) return id;
  return fallbackText;
};

const normalizeTextKey = (value) => String(value ?? '').trim().toLowerCase();

const buildAssignmentSignature = (assignment) => {
  return [
    normalizeTextKey(assignment?.title),
    normalizeTextKey(assignment?.description),
    String(assignment?.dueDate || '').trim(),
    String(assignment?.points ?? ''),
    String(assignment?.peerReviewsRequired ?? ''),
    String(Boolean(assignment?.group ?? assignment?.isGroup ?? false)),
    String(assignment?.groupLimit ?? ''),
    normalizeTextKey(assignment?.groupMode)
  ].join('||');
};

const getGroupedAssignmentCount = (assignments = []) => {
  const signatures = new Set();
  (assignments || []).forEach((assignment) => {
    signatures.add(buildAssignmentSignature(assignment));
  });
  return signatures.size;
};

const TeacherDashboard = () => {
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [gradeError, setGradeError] = useState('');

  // Dynamic state for the "Pending to grade" stat card
  const [pendingCount, setPendingCount] = useState(0);
  const [dashboardStats, setDashboardStats] = useState({ assignments: 0, students: 0, reviews: 0 });

  // Mock Data: Submissions
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  const [recentReviews, setRecentReviews] = useState([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [statsResult, subsResult, studentsResult, assignmentsResult] = await Promise.allSettled([
          api.get('/dashboard/teacher'),
          api.get('/submissions/teacher/recent'),
          api.get('/users/students'),
          api.get('/assignments/teacher')
        ]);

        const statsData = statsResult.status === 'fulfilled' ? (statsResult.value.data || {}) : {};
        const subsData = subsResult.status === 'fulfilled' ? (subsResult.value.data || []) : [];
        const studentsData = studentsResult.status === 'fulfilled' ? (studentsResult.value.data || []) : null;
        const assignmentsData = assignmentsResult.status === 'fulfilled' ? (assignmentsResult.value.data || []) : [];

        const assignmentGroupById = new Map();
        const assignmentGroupByTitle = new Map();
        const assignmentDueById = new Map();
        const assignmentDueByTitle = new Map();
        (assignmentsData || []).forEach((a) => {
          const idKey = normalizeTextKey(a?.id);
          const titleKey = normalizeTextKey(a?.title);
          const isGroup = Boolean(a?.group ?? a?.isGroup ?? a?.isGroupProject ?? a?.assignmentGroup ?? false);
          const dueText = a?.dueDate ? new Date(a.dueDate).toLocaleString('en-GB') : '-';
          if (idKey) assignmentGroupById.set(idKey, isGroup);
          if (titleKey && !assignmentGroupByTitle.has(titleKey)) assignmentGroupByTitle.set(titleKey, isGroup);
          if (idKey && !assignmentDueById.has(idKey)) assignmentDueById.set(idKey, dueText);
          if (titleKey && !assignmentDueByTitle.has(titleKey)) assignmentDueByTitle.set(titleKey, dueText);
        });

        const dummyEmails = new Set(['student1@peerlearn.com', 'student2@peerlearn.com']);
        const filteredStudentCount = Array.isArray(studentsData)
          ? studentsData.filter((s) => !dummyEmails.has((s.email || '').toLowerCase())).length
          : (statsData.students ?? 0);

        const groupedAssignmentCount = assignmentsResult.status === 'fulfilled'
          ? getGroupedAssignmentCount(assignmentsData)
          : (statsData.assignments ?? 0);

        setDashboardStats({
          assignments: groupedAssignmentCount,
          students: filteredStudentCount,
          reviews: statsData.reviews ?? 0
        });
        setPendingCount(statsData.pendingToGrade ?? 0);

        const mappedSubs = subsData.map((s) => ({
          assignmentId: s.assignmentId,
          id: s.id,
          student: s.studentName,
          studentId: s.studentUserId,
          assignment: s.assignmentTitle,
          due: s.assignmentDueDate
            ? new Date(s.assignmentDueDate).toLocaleString('en-GB')
            : (
              s.dueDate
                ? new Date(s.dueDate).toLocaleString('en-GB')
                : (
                  assignmentDueById.get(normalizeTextKey(s.assignmentId))
                  || assignmentDueByTitle.get(normalizeTextKey(s.assignmentTitle))
                  || '-'
                )
            ),
          isGroup: Boolean(
            s.isGroupProject
            ?? s.group
            ?? s.isGroup
            ?? s.assignmentGroup
            ?? assignmentGroupById.get(normalizeTextKey(s.assignmentId))
            ?? assignmentGroupByTitle.get(normalizeTextKey(s.assignmentTitle))
            ?? false
          ),
          canGrade: typeof s.canGrade === 'boolean'
            ? s.canGrade
            : (typeof s.allGroupMembersSubmitted === 'boolean' ? s.allGroupMembersSubmitted : true),
          gradeBlockedMessage: s.gradeBlockedMessage || s.pendingMembersMessage || s.gradeEligibilityMessage || '',
          submittedAt: s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-GB') : '-',
          status: s.status === 'FULLY_GRADED' ? 'Graded' : 'Needs Grading',
          content: s.submissionText,
          maxScore: s.maxScore,
          givenScore: s.teacherScore,
          givenFeedback: s.teacherFeedback,
          attachment: getSubmissionAttachment(s)
        }));
        setRecentSubmissions(mappedSubs);

        try {
          const assignments = assignmentsData || [];

          const submissionsByAssignment = await Promise.allSettled(
            assignments.map((a) => api.get(`/submissions/assignment/${a.id}`))
          );

          const submissionMetaById = new Map(
            submissionsByAssignment
              .filter((result) => result.status === 'fulfilled')
              .flatMap((result) => result.value.data || [])
              .map((s) => [
                s.id,
                {
                  assignmentTitle: s.assignmentTitle,
                  studentName: pickFirstNonEmpty(s.studentName, s.submittedByName),
                  studentId: pickFirstNonEmpty(s.studentId, s.studentUserId, s.submittedById)
                }
              ])
          );

          const submissionIds = submissionsByAssignment
            .filter((result) => result.status === 'fulfilled')
            .flatMap((result) => (result.value.data || []).map((s) => s.id));

          const reviewsBySubmission = await Promise.allSettled(
            submissionIds.map((submissionId) => api.get(`/reviews/submission/${submissionId}`))
          );

          const studentLookup = buildStudentLookup(studentsData || []);

          const completedRawReviews = reviewsBySubmission
            .filter((result) => result.status === 'fulfilled')
            .flatMap((result) => result.value.data || [])
            .filter((r) => String(r.status || '').toUpperCase() === 'COMPLETED');

          const anonymousReviewerTokens = Array.from(new Set(
            completedRawReviews
              .map((r) => extractNumericToken(
                pickFirstNonEmpty(
                  r.reviewerStudentId,
                  r.reviewerId,
                  r.reviewerUserId,
                  r.reviewedById,
                  r.givenById,
                  r.peerId,
                  r.reviewerName,
                  r.reviewerFullName,
                  r.reviewerStudentName
                )
              ))
              .filter(Boolean)
          ));

          const reviewerLookupByToken = new Map();
          if (anonymousReviewerTokens.length > 0) {
            const userLookupResults = await Promise.allSettled(
              anonymousReviewerTokens.map((token) => api.get(`/users/${token}`))
            );

            userLookupResults.forEach((result, index) => {
              if (result.status !== 'fulfilled') return;
              const token = anonymousReviewerTokens[index];
              const user = result.value?.data || {};
              const name = pickFirstNonEmpty(user.fullName, user.name, user.studentName);
              const id = pickFirstNonEmpty(user.studentId, user.userId, user.id);
              if (!name) return;
              reviewerLookupByToken.set(token, id ? `${name} (${id})` : name);
            });
          }

          const allReviews = reviewsBySubmission
            .filter((result) => result.status === 'fulfilled')
            .flatMap((result) => result.value.data || [])
            .filter((r) => String(r.status || '').toUpperCase() === 'COMPLETED')
            .map((r) => {
              const when = r.completedAt || r.createdAt;
              const ts = when ? new Date(when).getTime() : 0;

              const reviewerSubmissionId = pickFirstNonEmpty(
                r.reviewerSubmissionId,
                r.givenBySubmissionId,
                r.reviewedBySubmissionId,
                r.reviewerSubId,
                r.reviewerSubmission?.id
              );
              const reviewerSubmissionMeta = submissionMetaById.get(reviewerSubmissionId) || {};

              const reviewerName = pickFirstNonEmpty(
                reviewerSubmissionMeta.studentName,
                r.reviewedByName,
                r.givenByName,
                r.reviewerFullName,
                r.reviewerStudentName,
                r.reviewerName
              );
              const reviewerId = pickFirstNonEmpty(
                reviewerSubmissionMeta.studentId,
                r.reviewerStudentId,
                r.reviewerId,
                r.reviewerUserId,
                r.reviewedById,
                r.givenById,
                r.peerId
              );
              const reviewerToken = extractNumericToken(pickFirstNonEmpty(reviewerId, reviewerName));

              const submissionMeta = submissionMetaById.get(r.submissionId) || {};
              const revieweeName = pickFirstNonEmpty(
                r.revieweeName,
                r.revieweeFullName,
                r.revieweeStudentName,
                r.submissionStudentName,
                r.studentName,
                r.peerName,
                submissionMeta.studentName
              );
              const revieweeId = pickFirstNonEmpty(
                r.revieweeStudentId,
                r.revieweeId,
                r.revieweeUserId,
                r.peerStudentId,
                submissionMeta.studentId
              );

              const resolvedReviewer = resolveStudentLabel(studentLookup, reviewerName, reviewerId, 'Peer Reviewer');
              const shouldReplaceAnonymous =
                isAnonymousPeerLabel(resolvedReviewer) ||
                isAnonymousPeerLabel(reviewerName) ||
                isStudentHashLabel(resolvedReviewer) ||
                isStudentHashLabel(reviewerName) ||
                isStudentHashLabel(reviewerId) ||
                resolvedReviewer === 'Peer Reviewer';
              const reviewer = shouldReplaceAnonymous
                ? (reviewerLookupByToken.get(reviewerToken) || resolveStudentLabel(studentLookup, reviewerName, reviewerId, 'Peer Reviewer'))
                : resolvedReviewer;

              return {
                id: r.id,
                reviewer,
                reviewee: resolveStudentLabel(studentLookup, revieweeName, revieweeId, 'Student'),
                assignment: r.assignmentTitle || submissionMeta.assignmentTitle || 'Assignment',
                score: r.score ?? '-',
                feedback: r.feedbackText || 'No feedback provided.',
                time: when ? new Date(when).toLocaleString('en-GB') : '-',
                sortTs: ts
              };
            })
            .sort((a, b) => b.sortTs - a.sortTs);

          setRecentReviews(allReviews.slice(0, 8));
          setDashboardStats((prev) => ({
            ...prev,
            reviews: allReviews.length
          }));
        } catch (error) {
          setRecentReviews([]);
          setDashboardStats((prev) => ({
            ...prev,
            reviews: 0
          }));
        }
      } catch (error) {
        setDashboardStats({ assignments: 0, students: 0, reviews: 0 });
        setPendingCount(0);
        setRecentSubmissions([]);
        setRecentReviews([]);
      }
    };

    loadDashboard();
  }, []);

  // Handlers for Modal
  const openModal = (sub) => {
    setSelectedSubmission(sub);
    setGradeError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedSubmission(null);
    setScore('');
    setFeedback('');
    setGradeError('');
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.patch(`/submissions/${selectedSubmission.id}/grade`, {
        score: Number(score),
        feedback
      });

      setRecentSubmissions(recentSubmissions.map(sub =>
        sub.id === selectedSubmission.id
          ? { ...sub, status: 'Graded', givenScore: Number(score), givenFeedback: feedback }
          : sub
      ));
      setPendingCount((prev) => Math.max(0, prev - 1));
      closeModal();
    } catch (error) {
      setGradeError(toReadableError(error));
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Teacher Dashboard</h1>
        <p>Overview of your classes and assignments</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card card-blue">
          <div className="stat-card-header"><FileText size={18}/> Assignments</div>
          <div className="stat-value">{dashboardStats.assignments}</div>
          <div className="stat-label">total assignments</div>
        </div>
        
        <div className="stat-card card-purple">
          <div className="stat-card-header"><Users size={18}/> Students</div>
          <div className="stat-value">{dashboardStats.students}</div>
          <div className="stat-label">active students</div>
        </div>
        
        <div className="stat-card card-orange">
          <div className="stat-card-header"><Clock size={18}/> Pending</div>
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">to grade</div>
        </div>
        
        <div className="stat-card card-teal">
          <div className="stat-card-header"><MessageSquare size={18}/> Reviews</div>
          <div className="stat-value">{dashboardStats.reviews}</div>
          <div className="stat-label">peer reviews</div>
        </div>
      </div>

      <div className="panels-grid">
        
        {/* RECENT SUBMISSIONS PANEL */}
        <div className="panel-card" style={{ padding: 0 }}>
          <div className="panel-title" style={{ margin: 0, borderBottom: '1px solid #e0f2fe', backgroundColor: '#f0f9ff', color: '#0369a1' }}>
            <FileText size={20} /> Recent Submissions
          </div>
          <div className="scrollable-panel">
            {recentSubmissions.length === 0 ? (
              <div style={{ padding: '1.25rem', color: '#64748b', textAlign: 'center' }}>
                No submissions yet.
              </div>
            ) : recentSubmissions.map(sub => (
              <div key={sub.id} className="task-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: sub.status === 'Graded' ? '#bbf7d0' : '#e0f2fe', backgroundColor: sub.status === 'Graded' ? '#f8fafc' : 'white' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h4 style={{ color: '#0f172a', margin: 0, fontSize: '1.05rem' }}>{sub.student}</h4>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{sub.studentId}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0', flexWrap: 'wrap' }}>
                    <p style={{ color: '#475569', fontSize: '0.9rem', margin: 0 }}>{sub.assignment}</p>
                    {sub.isGroup && (
                      <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700 }}>
                        Group Project
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748b' }}>{sub.submittedAt}</span>
                    <span style={{ color: '#64748b' }}>Due: {sub.due}</span>
                    <span style={{ 
                      color: sub.status === 'Graded' ? '#16a34a' : '#ea580c',
                      fontWeight: '600' 
                    }}>
                      • {sub.status}
                    </span>
                  </div>
                </div>
                
                {/* Dynamically show Grade or View button - BOTH now open the modal! */}
                <button 
                  className={sub.status === 'Graded' || (sub.isGroup && sub.canGrade === false) ? "btn-cancel" : "btn-cyan"} 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  onClick={() => openModal(sub)}
                >
                  {sub.status === 'Graded' ? 'View' : (sub.isGroup && sub.canGrade === false ? 'View' : 'Grade')}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RECENT PEER REVIEWS PANEL */}
        <div className="panel-card" style={{ padding: 0 }}>
          <div className="panel-title" style={{ margin: 0, borderBottom: '1px solid #dcfce7', backgroundColor: '#f0fdf4', color: '#166534' }}>
            <MessageSquare size={20} /> Recent Peer Reviews
          </div>
          <div className="scrollable-panel">
            {recentReviews.length === 0 ? (
              <div style={{ padding: '1.25rem', color: '#64748b', textAlign: 'center' }}>
                No peer reviews yet.
              </div>
            ) : recentReviews.map(review => (
              <div key={review.id} className="task-card sub-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UserCircle size={18} color="#0d9488" />
                    <span style={{ fontWeight: '600', color: '#0f766e', fontSize: '0.95rem' }}>{review.reviewer}</span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}> gave feedback to </span>
                    <span style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '500' }}>{review.reviewee}</span>
                  </div>
                  <div className="task-badge-gray" style={{ background: '#ccfbf1', color: '#0f766e', fontSize: '0.75rem' }}>
                    Score: {review.score}
                  </div>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                  <FileText size={12} style={{ display: 'inline', marginRight: '4px' }}/> 
                  {review.assignment}
                </div>
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.75rem', fontSize: '0.9rem', color: '#334155', fontStyle: 'italic' }}>
                  "{review.feedback}"
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8' }}>
                  {review.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DYNAMIC TEACHER GRADING/VIEWING MODAL OVERLAY */}
      {isModalOpen && selectedSubmission && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}><X size={24} /></button>
            <h2 className="modal-title">
              {selectedSubmission.status === 'Graded' ? 'View Grade' : 'Grade Submission'}
            </h2>
            <p className="modal-subtitle">
              {selectedSubmission.student} ({selectedSubmission.studentId})
            </p>
            <p className="modal-subtitle" style={{ marginTop: '-0.2rem' }}>
              Due: {selectedSubmission.due || '-'}
            </p>
            
            <div className="desc-box" style={{ background: '#f8fafc', borderColor: '#e2e8f0', marginBottom: '1.5rem' }}>
              <div className="desc-title" style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16}/> {selectedSubmission.assignment}
              </div>
              <div className="desc-text" style={{ fontStyle: 'italic', marginTop: '0.75rem', color: '#334155' }}>
                "{selectedSubmission.content}"
              </div>
              {selectedSubmission.attachment?.url && <AttachmentPreview attachment={selectedSubmission.attachment} accentColor="#0284c7" />}
            </div>
            
            {/* CONDITIONAL RENDER: Form (if pending) vs Static View (if graded) */}
            {selectedSubmission.status === 'Graded' ? (
              
              // === VIEW MODE ===
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '1rem' }}>
                  <div className="input-group-modal">
                    <label>Final Score</label>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: '6px', color: '#166534', fontWeight: '700', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={20} />
                      {selectedSubmission.givenScore} <span style={{fontSize: '0.9rem', color: '#15803d', fontWeight: '500'}}>/ {selectedSubmission.maxScore}</span>
                    </div>
                  </div>

                  <div className="input-group-modal">
                    <label>Teacher Feedback</label>
                    <div style={{ background: 'white', border: '1px solid #cbd5e1', padding: '0.85rem', borderRadius: '6px', color: '#334155', minHeight: '60px', lineHeight: '1.5' }}>
                      {selectedSubmission.givenFeedback}
                    </div>
                  </div>
                </div>
                
                <div className="modal-actions" style={{ borderTop: 'none', paddingTop: '0.5rem' }}>
                  <button type="button" className="btn-cancel" onClick={closeModal}>Close</button>
                </div>
              </div>

            ) : (

              // === GRADING MODE ===
              <form onSubmit={handleGradeSubmit}>
                {selectedSubmission.isGroup && selectedSubmission.canGrade === false && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: '0.9rem' }}>
                    {selectedSubmission.gradeBlockedMessage || 'This group can be graded only after all members submit their work.'}
                  </div>
                )}

                {gradeError && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '0.9rem' }}>
                    {gradeError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '1rem' }}>
                  <div className="input-group-modal">
                    <label>Final Score</label>
                    <input 
                      type="number" 
                      min="0"
                      max={selectedSubmission.maxScore}
                      className="textarea-field"
                      style={{ minHeight: '45px', padding: '0.5rem' }}
                      placeholder={`/ ${selectedSubmission.maxScore}`}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      disabled={selectedSubmission.isGroup && selectedSubmission.canGrade === false}
                      required
                    />
                  </div>

                  <div className="input-group-modal">
                    <label>Teacher Feedback *</label>
                    <textarea 
                      className="textarea-field"
                      placeholder="Provide official feedback on the student's submission..."
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      disabled={selectedSubmission.isGroup && selectedSubmission.canGrade === false}
                      required
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                  <button
                    type="submit"
                    className="btn-teal"
                    style={{ backgroundColor: '#0ea5e9' }}
                    disabled={selectedSubmission.isGroup && selectedSubmission.canGrade === false}
                  >
                    <Award size={16} /> Submit Grade
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default TeacherDashboard;