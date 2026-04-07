import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, Award, AlertCircle, FileText, Upload, Send, X, MessageSquare, Star, TrendingUp, Users } from 'lucide-react';
import api, { getSubmissionAttachment } from '../api';
import AttachmentPreview from '../components/AttachmentPreview';

const isGroupAssignment = (item = {}) => {
  if (typeof item.group === 'boolean') return item.group;
  if (typeof item.isGroup === 'boolean') return item.isGroup;
  if (typeof item.isGroupProject === 'boolean') return item.isGroupProject;
  if (typeof item.assignmentGroup === 'boolean') return item.assignmentGroup;

  const type = String(item.assignmentType ?? item.type ?? '').toLowerCase();
  if (type.includes('group')) return true;

  return false;
};

const StudentDashboard = () => {
  // Modal and Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Pending Assignments Data
  const [pendingAssignments, setPendingAssignments] = useState([]);

  // Updated Submissions Data using actual numbers so we can calculate the average!
  // Use null if it hasn't been graded yet.
  const [recentSubmissions, setRecentSubmissions] = useState([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [assignmentsRes, submissionsRes] = await Promise.all([
          api.get('/assignments/student'),
          api.get('/submissions/student')
        ]);

        const submissions = submissionsRes.data || [];
        const submittedAssignmentIds = new Set(submissions.map((s) => s.assignmentId));

        const pending = (assignmentsRes.data || [])
          .filter((a) => !submittedAssignmentIds.has(a.id))
          .map((a) => ({
            id: a.id,
            title: a.title,
            author: a.teacherName || 'Course Instructor',
            teacherId: a.teacherId || a.createdById || a.teacherUserId || null,
            desc: a.description,
            isGroup: isGroupAssignment(a),
            due: a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB') : '-',
            daysLeft: a.dueDate
              ? `${Math.max(0, Math.ceil((new Date(a.dueDate) - new Date()) / (1000 * 60 * 60 * 24)))} days left`
              : '0 days left'
          }));

        const mappedSubs = submissions.map((s) => ({
          id: s.id,
          title: s.assignmentTitle,
          isGroup: isGroupAssignment(s),
          date: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB') : '-',
          status: s.status === 'FULLY_GRADED' ? 'Fully Graded' : s.status === 'PEER_REVIEWED' ? 'Peer Reviewed' : 'Pending Review',
          teacherScore: s.teacherScore,
          peerScore: s.averagePeerScore ?? null,
          peerReviewCount: s.peerReviewCount ?? 0,
          maxScore: s.maxScore ?? 100,
          attachment: getSubmissionAttachment(s)
        }));

        setPendingAssignments(pending);
        setRecentSubmissions(mappedSubs);
      } catch (error) {
        setPendingAssignments([]);
        setRecentSubmissions([]);
      }
    };

    loadDashboardData();

    const handleFocus = () => loadDashboardData();
    const handleStorage = (event) => {
      if (
        event.key === 'peerlearn_review_update' ||
        event.key === 'peerlearn_submission_update' ||
        event.key === 'peerlearn_assignment_update'
      ) {
        loadDashboardData();
      }
    };
    const handleReviewUpdate = () => loadDashboardData();
    const handleSubmissionUpdate = () => loadDashboardData();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('peerlearn-review-update', handleReviewUpdate);
    window.addEventListener('peerlearn-submission-update', handleSubmissionUpdate);
    const interval = setInterval(loadDashboardData, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('peerlearn-review-update', handleReviewUpdate);
      window.removeEventListener('peerlearn-submission-update', handleSubmissionUpdate);
      clearInterval(interval);
    };
  }, []);

  // Modal Handlers
  const openModal = (assignment) => {
    setSelectedAssignment(assignment);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedAssignment(null);
    setSubmissionText('');
    setSelectedFile(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const formData = new FormData();
      formData.append('assignmentId', selectedAssignment.id);
      formData.append('submissionText', submissionText);
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const { data } = await api.post('/submissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      try {
        const { data: me } = await api.get('/users/me');
        const studentName = me?.fullName || 'A student';
        const studentId = me?.studentId || me?.userId || 'N/A';
        const section = me?.section || 'N/A';
        const teacherUserId = selectedAssignment?.teacherId
          || data?.teacherId
          || data?.assignmentTeacherId
          || data?.createdById;

        if (teacherUserId) {
          await api.post('/notifications', {
            userId: teacherUserId,
            type: 'ALERT',
            title: 'New Assignment Submission',
            message: `${studentName} (ID: ${studentId}, Section: ${section}) submitted ${selectedAssignment.title}.`
          });
        }
      } catch (error) {
        // submission should succeed even if teacher notification fails
      }

      setPendingAssignments(pendingAssignments.filter(a => a.id !== selectedAssignment.id));
      const newSubmission = {
        id: data.id,
        title: data.assignmentTitle,
        date: data.submittedAt ? new Date(data.submittedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
        status: 'Pending Review',
        teacherScore: null,
        peerScore: null,
        peerReviewCount: 0,
        maxScore: data.maxScore ?? 100
      };
      setRecentSubmissions([newSubmission, ...recentSubmissions]);
      closeModal();
    } catch (error) {
      // keep modal open if submit fails
    }
  };

  // ==========================================
  // NEW: Calculate Averages & Stats automatically!
  // ==========================================
  const gradedByTeacher = recentSubmissions.filter(sub => sub.teacherScore !== null);
  const gradedByPeer = recentSubmissions.filter(sub => sub.peerScore !== null && (sub.peerReviewCount || 0) > 0);

  const totalTeacherGrades = gradedByTeacher.length;
  const totalPeerReviews = recentSubmissions.reduce((sum, sub) => sum + (sub.peerReviewCount || 0), 0);

  const teacherTotals = gradedByTeacher.reduce(
    (acc, sub) => {
      const score = Number(sub.teacherScore);
      const max = Number(sub.maxScore || 100);
      if (Number.isNaN(score) || Number.isNaN(max) || max <= 0) return acc;
      acc.earned += score;
      acc.possible += max;
      return acc;
    },
    { earned: 0, possible: 0 }
  );

  const teacherAverageValue = teacherTotals.possible > 0
    ? ((teacherTotals.earned / teacherTotals.possible) * 100)
    : 0;
  const displayTeacherAverage = teacherAverageValue.toFixed(1);

  const toPercentage = (scoreValue, maxScoreValue = 100, reviewCount = 1) => {
    const score = Number(scoreValue);
    const maxScore = Number(maxScoreValue);
    const count = Number(reviewCount || 1);

    if (Number.isNaN(score) || Number.isNaN(maxScore) || maxScore <= 0) return 0;

    // If score looks cumulative across reviews, normalize by review count first.
    const normalizedScore = score > maxScore ? (score / Math.max(count, 1)) : score;
    return (normalizedScore / maxScore) * 100;
  };

  const peerPercentages = gradedByPeer
    .map((sub) => toPercentage(sub.peerScore, sub.maxScore, sub.peerReviewCount))
    .filter((value) => Number.isFinite(value));

  const peerAverageValue = peerPercentages.length > 0
    ? (peerPercentages.reduce((sum, curr) => sum + curr, 0) / peerPercentages.length)
    : 0;
  const displayPeerAverage = peerAverageValue.toFixed(1);

  const overallAverageValue = (teacherAverageValue > 0 && peerAverageValue > 0)
    ? (teacherAverageValue + peerAverageValue) / 2
    : (teacherAverageValue || peerAverageValue || 0);
  const displayOverallAverage = overallAverageValue.toFixed(1);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome back! Here's your overview</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card card-orange">
          <div className="stat-card-header"><Clock size={18}/> Pending Work</div>
          <div className="stat-value">{pendingAssignments.length}</div>
          <div className="stat-label">assignments to complete</div>
        </div>
        <div className="stat-card card-teal">
          <div className="stat-card-header"><CheckCircle2 size={18}/> Submitted</div>
          <div className="stat-value">{recentSubmissions.length}</div>
          <div className="stat-label">assignments completed</div>
        </div>
        <div className="stat-card card-purple">
          <div className="stat-card-header"><Award size={18}/> Teacher Grades</div>
          <div className="stat-value">{totalTeacherGrades}</div>
          <div className="stat-label">official grades received</div>
        </div>
        <div className="stat-card card-blue">
          <div className="stat-card-header"><MessageSquare size={18}/> Peer Reviews</div>
          <div className="stat-value">{totalPeerReviews}</div>
          <div className="stat-label">classmate reviews received</div>
        </div>
      </div>

      {/* NEW: SPECIAL PERFORMANCE INSIGHTS BANNER */}
      <div style={{ 
        background: 'linear-gradient(to right, #0f172a, #1e293b)', 
        color: 'white', 
        padding: '1.5rem 2rem', 
        borderRadius: '12px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem', 
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={22} color="#38bdf8" /> Performance Insights
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Your cumulative average scores across all graded projects</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* Teacher Average Box */}
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#c084fc', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
              Teacher Average
            </div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: 'white', lineHeight: '1' }}>
              {displayTeacherAverage}<span style={{ fontSize: '1rem', color: '#64748b' }}>%</span>
            </div>
          </div>
          
          {/* Peer Average Box */}
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
              Peer Average
            </div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: 'white', lineHeight: '1' }}>
              {displayPeerAverage}<span style={{ fontSize: '1rem', color: '#64748b' }}>%</span>
            </div>
          </div>

          {/* Overall Average Box */}
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
              Overall Average
            </div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: 'white', lineHeight: '1' }}>
              {displayOverallAverage}<span style={{ fontSize: '1rem', color: '#64748b' }}>%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panels-grid">
        {/* PENDING ASSIGNMENTS PANEL */}
        <div className="panel-card" style={{ padding: 0 }}>
          <div className="panel-title tint-orange" style={{ margin: 0, borderBottom: '1px solid #f1f5f9' }}>
            <Clock size={20} /> Pending Assignments
          </div>
          <div className="scrollable-panel">
            {pendingAssignments.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', marginTop: '2rem' }}>All caught up! No pending assignments.</p>
            ) : (
              pendingAssignments.map(task => (
                <div key={task.id} className="task-card">
                  <div className="task-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div className="task-title">{task.title}</div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                          background: task.isGroup ? '#dbeafe' : '#f1f5f9',
                          color: task.isGroup ? '#1d4ed8' : '#475569',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        {task.isGroup ? <><Users size={12} /> Group Project</> : 'Individual'}
                      </span>
                    </div>
                    <div className="task-badge-orange">{task.daysLeft}</div>
                  </div>
                  <div className="task-author">by {task.author}</div>
                  <div className="task-desc">{task.desc}</div>
                  <div className="task-footer">
                    <span>Due: {task.due}</span>
                    <button className="btn-start" onClick={() => openModal(task)}>Start Assignment</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* RECENT SUBMISSIONS & REVIEW STATS PANEL */}
        <div className="panel-card" style={{ padding: 0 }}>
          <div className="panel-title tint-green" style={{ margin: 0, borderBottom: '1px solid #f1f5f9' }}>
            <FileText size={20} /> Submissions & Feedback
          </div>
          <div className="scrollable-panel">
            {recentSubmissions.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', marginTop: '2rem' }}>
                No submissions yet. Submit an assignment to see your feedback here.
              </p>
            ) : recentSubmissions.map(sub => (
              <div key={sub.id} className="task-card sub-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="task-header" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div className="task-title">{sub.title}</div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: sub.isGroup ? '#dbeafe' : '#f1f5f9',
                        color: sub.isGroup ? '#1d4ed8' : '#475569',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      {sub.isGroup ? <><Users size={12} /> Group Project</> : 'Individual'}
                    </span>
                  </div>
                  <div className="task-badge-gray" style={{ 
                    background: sub.status === 'Fully Graded' ? '#dcfce7' : '#f1f5f9', 
                    color: sub.status === 'Fully Graded' ? '#166534' : '#64748b' 
                  }}>
                    {sub.status}
                  </div>
                </div>
                <div className="task-author" style={{ marginBottom: '0.5rem' }}>Submitted {sub.date}</div>

                {sub.attachment?.url && <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}><AttachmentPreview attachment={sub.attachment} accentColor="#0ea5e9" /></div>}
                
                {/* Dynamically displaying the numeric scores from state */}
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                  
                  {/* Teacher Score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '600', color: sub.teacherScore !== null ? '#7e22ce' : '#94a3b8' }}>
                    <Award size={16} /> 
                    Teacher: {sub.teacherScore !== null ? `${((Number(sub.teacherScore) / Math.max(Number(sub.maxScore || 100), 1)) * 100).toFixed(1)}%` : 'Pending'}
                  </div>
                  
                  {/* Peer Score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '600', color: sub.peerScore !== null ? '#0369a1' : '#94a3b8' }}>
                    <Star size={16} /> 
                    Peers: {sub.peerScore !== null ? `${toPercentage(sub.peerScore, sub.maxScore, sub.peerReviewCount).toFixed(1)}%` : 'Pending'}
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* THE SUBMISSION MODAL */}
      {isModalOpen && selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}><X size={24} /></button>
            <h2 className="modal-title">{selectedAssignment.isGroup ? 'Submit Group Contribution' : 'Submit Assignment'}</h2>
            <p className="modal-subtitle">{selectedAssignment.title}</p>
            <p className="modal-subtitle" style={{ marginTop: '-0.2rem' }}>Due: {selectedAssignment.due}</p>
            
            <div className="desc-box">
              <div className="desc-title">Assignment Description:</div>
              <div className="desc-text">{selectedAssignment.desc}</div>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="input-group-modal">
                <label>Your Submission *</label>
                <textarea 
                  className="textarea-field"
                  placeholder="Enter your assignment content here..."
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  required
                />
                <p className="helper-text">Make sure to review your work before submitting. You cannot edit after submission.</p>
              </div>
              
              <div className="input-group-modal">
                <label style={{ fontSize: '0.9rem' }}>Upload File (Optional)</label>
                <div>
                  <input type="file" id="dashboard-file-upload" style={{ display: 'none' }} onChange={handleFileChange} />
                  {!selectedFile ? (
                    <label htmlFor="dashboard-file-upload" className="btn-cyan" style={{ display: 'inline-flex', width: 'fit-content', cursor: 'pointer' }}>
                      <Upload size={16} /> Upload File
                    </label>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
                      <FileText size={16} color="#0891b2" />
                      <span style={{ fontSize: '0.9rem', color: '#334155', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFile.name}</span>
                      <button type="button" onClick={() => setSelectedFile(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: '2px' }}><X size={16} /></button>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-teal"><Send size={16} /> {selectedAssignment.isGroup ? 'Submit Contribution' : 'Submit Assignment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;