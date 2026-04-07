import React, { useEffect, useState } from 'react';
import { FileText, Clock, Upload, Send, X, CheckCircle2, Users, UserPlus, MessageSquare } from 'lucide-react';
import api, { getSubmissionAttachment } from '../api';
import AttachmentPreview from '../components/AttachmentPreview';

const GROUP_MODE_STORAGE_KEY = 'peerlearn_group_modes';
const TEACHER_GROUP_STORAGE_KEY = 'peerlearn_teacher_groups';
const STUDENT_TEAM_STORAGE_KEY = 'peerlearn_student_group_teams';

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const DUMMY_STUDENT_EMAILS = new Set(['student1@peerlearn.com', 'student2@peerlearn.com']);
const DUMMY_STUDENT_IDS = new Set(['STU-1001', 'STU-1002']);
const DUMMY_STUDENT_NAMES = new Set(['Aria Moore', 'Lily Walker']);

const isDummyStudentRecord = (student) => {
  const email = String(student?.email || '').trim().toLowerCase();
  const userId = String(student?.studentId || student?.userId || '').trim().toUpperCase();
  const name = String(student?.fullName || student?.name || '').trim();
  return DUMMY_STUDENT_EMAILS.has(email) || DUMMY_STUDENT_IDS.has(userId) || DUMMY_STUDENT_NAMES.has(name);
};

const safeWriteJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const normalizeRemarkList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item?.feedbackText || item?.remark || item?.comment || ''))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  const single = String(value || '').trim();
  return single ? [single] : [];
};

const getTeacherRemark = (submission) => String(
  submission?.teacherFeedback ||
  submission?.teacherRemark ||
  submission?.teacherComments ||
  submission?.teacherComment ||
  submission?.feedback ||
  submission?.remarks ||
  ''
).trim();

const getPeerRemarks = (submission) => Array.from(new Set(normalizeRemarkList(
  submission?.peerFeedback ||
  submission?.peerRemarks ||
  submission?.peerComments ||
  submission?.peerReviewFeedback ||
  submission?.peer_review_feedback ||
  submission?.latestPeerFeedback ||
  submission?.latest_peer_feedback ||
  submission?.reviews ||
  submission?.peerReviews ||
  submission?.peer_reviews ||
  []
)));

const StudentAssignments = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [isSubmissionViewOpen, setIsSubmissionViewOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [sectionStudents, setSectionStudents] = useState([]);
  const [selectedSectionStudent, setSelectedSectionStudent] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [canContributeToGroup, setCanContributeToGroup] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const [assignments, setAssignments] = useState([]);

  const getDaysLeft = (dueDate) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = due - now;
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return `${days} days left`;
  };

  const mapAssignment = (item, submissionMap) => {
    const groupModes = safeReadJson(GROUP_MODE_STORAGE_KEY, {});
    const submission = submissionMap.get(item.id);
    return {
      id: item.id,
      title: item.title,
      author: item.teacherName || 'Course Instructor',
      teacherId: item.teacherId || item.createdById || item.teacherUserId || null,
      desc: item.description,
      due: item.dueDate ? new Date(item.dueDate).toLocaleString('en-GB') : '-',
      points: item.points,
      section: item.section,
      daysLeft: item.dueDate ? getDaysLeft(item.dueDate) : '0 days left',
      status: submission ? 'submitted' : 'pending',
      isGroup: item.group,
      groupLimit: Number(item.groupLimit || 3),
      groupMode: groupModes[String(item.id)] || 'STUDENT_SELECT',
      teamMembers: ['You'],
      teamMemberRecords: [],
      teamFiles: [],
      submissionText: submission?.submissionText,
      attachment: getSubmissionAttachment(submission),
      teacherRemark: getTeacherRemark(submission),
      peerRemarks: getPeerRemarks(submission),
      submissionDate: submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString('en-GB') : null
    };
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const meResult = await api.get('/users/me').catch(() => ({ data: null }));
        setCurrentUser(meResult?.data || null);

        const [assignmentRes, submissionsRes] = await Promise.all([
          api.get('/assignments/student'),
          api.get('/submissions/student')
        ]);

        const submissions = submissionsRes.data || [];
        const reviewResults = await Promise.allSettled(
          submissions.map((s) => api.get(`/reviews/submission/${s.id}`))
        );

        const peerFeedbackBySubmissionId = new Map();
        reviewResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const submissionId = submissions[index]?.id;
          if (!submissionId) return;

          const feedbacks = (result.value?.data || [])
            .filter((r) => String(r?.status || '').toUpperCase() === 'COMPLETED')
            .map((r) => String(r?.feedbackText || r?.remark || r?.comment || '').trim())
            .filter(Boolean);

          if (feedbacks.length > 0) {
            peerFeedbackBySubmissionId.set(submissionId, feedbacks);
          }
        });

        const submissionMap = new Map(
          submissions.map((s) => [
            s.assignmentId,
            {
              ...s,
              peerRemarks: Array.from(new Set([
                ...getPeerRemarks(s),
                ...(peerFeedbackBySubmissionId.get(s.id) || [])
              ]))
            }
          ])
        );
        const mapped = (assignmentRes.data || []).map((a) => mapAssignment(a, submissionMap));
        setAssignments(mapped);
      } catch (error) {
        setAssignments([]);
      }
    };

    loadData();
  }, []);

  const openModal = (assignment) => {
    setSelectedAssignment(assignment);
    setIsModalOpen(true);
    setInviteError('');
    setSelectedSectionStudent('');
    setCanContributeToGroup(true);

    if (assignment?.isGroup) {
      loadSectionStudents(assignment);
      initializeGroupWorkspace(assignment);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedAssignment(null);
    setSubmissionText('');
    setSelectedFile(null);
    setNewMemberEmail('');
    setSectionStudents([]);
    setSelectedSectionStudent('');
    setInviteError('');
    setCanContributeToGroup(true);
  };

  const isSameUser = (student, me) => {
    const sid = String(student?.id || '');
    const semail = String(student?.email || '').toLowerCase();
    const suserId = String(student?.studentId || student?.userId || '').toLowerCase();
    const mid = String(me?.id || '');
    const memail = String(me?.email || '').toLowerCase();
    const muserId = String(me?.userId || '').toLowerCase();

    return (sid && mid && sid === mid)
      || (semail && memail && semail === memail)
      || (suserId && muserId && suserId === muserId);
  };

  const matchesUser = (member, me) => {
    const mid = String(member?.id || '').toLowerCase();
    const memail = String(member?.email || '').toLowerCase();
    const muserId = String(member?.userId || member?.studentId || '').toLowerCase();
    const uid = String(me?.id || '').toLowerCase();
    const uemail = String(me?.email || '').toLowerCase();
    const uuserId = String(me?.userId || '').toLowerCase();
    return (mid && uid && mid === uid)
      || (memail && uemail && memail === uemail)
      || (muserId && uuserId && muserId === uuserId);
  };

  const initializeGroupWorkspace = async (assignment) => {
    try {
      const { data: me } = await api.get('/users/me');

      if (assignment.groupMode === 'TEACHER_SELECT') {
        let matchedGroup = null;

        try {
          const { data } = await api.get(`/group-teams/assignment/${assignment.id}/mine`);
          if (Array.isArray(data) && data.length > 0) {
            matchedGroup = {
              members: data
                .map((m) => ({
                  id: m.id,
                  fullName: m.fullName,
                  email: m.email,
                  userId: m.userId,
                  studentId: m.userId
                }))
                .filter((member) => !isDummyStudentRecord(member))
            };
          }
        } catch (error) {
          // Fallback to local storage when backend endpoint is not available.
          const allTeacherGroups = safeReadJson(TEACHER_GROUP_STORAGE_KEY, {});
          const groups = (allTeacherGroups[String(assignment.id)] || []).map((group) => ({
            ...group,
            members: (group.members || []).filter((member) => !isDummyStudentRecord(member))
          }));
          matchedGroup = groups.find((g) => (g.members || []).some((m) => matchesUser(m, me))) || null;
        }

        if (!matchedGroup) {
          setCanContributeToGroup(false);
          setInviteError('Teacher has not assigned you to a group for this project yet.');
          return;
        }

        const labels = (matchedGroup.members || []).map((m) => {
          if (matchesUser(m, me)) return 'You';
          const name = String(m.fullName || 'Student').trim();
          const id = String(m.userId || m.studentId || m.email || '').trim();
          return id ? `${name} (${id})` : name;
        });

        const uniqueLabels = Array.from(new Set(labels));
        setAssignments((prev) => prev.map((a) => a.id === assignment.id
          ? { ...a, teamMembers: uniqueLabels, teamMemberRecords: matchedGroup.members || [] }
          : a
        ));
        setSelectedAssignment((prev) => prev ? { ...prev, teamMembers: uniqueLabels, teamMemberRecords: matchedGroup.members || [] } : prev);
        setCanContributeToGroup(true);
        setInviteError('');
        return;
      }

      let matchedGroup = null;

      try {
        const { data } = await api.get(`/group-teams/assignment/${assignment.id}/mine`);
        if (Array.isArray(data) && data.length > 0) {
          matchedGroup = {
            members: data
              .map((m) => ({
                id: m.id,
                fullName: m.fullName,
                email: m.email,
                userId: m.userId,
                studentId: m.userId
              }))
              .filter((member) => !isDummyStudentRecord(member))
          };
        }
      } catch (error) {
        // Fallback to local storage when backend endpoint is not available.
        const allTeams = safeReadJson(STUDENT_TEAM_STORAGE_KEY, {});
        const storedMembers = (allTeams[String(assignment.id)] || []).filter((member) => !isDummyStudentRecord(member));
        matchedGroup = storedMembers.length > 0 ? { members: storedMembers } : null;
      }

      const allTeams = safeReadJson(STUDENT_TEAM_STORAGE_KEY, {});
      const storedMembers = (allTeams[String(assignment.id)] || []).filter((member) => !isDummyStudentRecord(member));

      const normalizedMembers = matchedGroup?.members?.length > 0
        ? matchedGroup.members
        : (storedMembers.length > 0
          ? storedMembers
          : [{ id: me?.id, fullName: me?.fullName || 'You', email: me?.email, userId: me?.userId }]);

      const labels = normalizedMembers.map((m) => {
        if (matchesUser(m, me)) return 'You';
        const name = String(m.fullName || 'Student').trim();
        const id = String(m.userId || m.studentId || m.email || '').trim();
        return id ? `${name} (${id})` : name;
      });

      setAssignments((prev) => prev.map((a) => a.id === assignment.id
        ? { ...a, teamMembers: Array.from(new Set(labels)), teamMemberRecords: normalizedMembers }
        : a
      ));
      setSelectedAssignment((prev) => prev ? { ...prev, teamMembers: Array.from(new Set(labels)), teamMemberRecords: normalizedMembers } : prev);

      allTeams[String(assignment.id)] = normalizedMembers;
      safeWriteJson(STUDENT_TEAM_STORAGE_KEY, allTeams);

      await api.post(`/group-teams/assignment/${assignment.id}`, {
        groups: [{
          groupCode: 'G1',
          studentIds: normalizedMembers.map((member) => member.id)
        }]
      }).catch(() => {
        // Keep local storage as fallback if backend endpoint is unavailable.
      });

      setCanContributeToGroup(true);
      setInviteError('');
    } catch (error) {
      setCanContributeToGroup(true);
    }
  };

  const buildMemberLabel = (student) => {
    const name = String(student?.fullName || student?.name || 'Student').trim();
    const studentId = String(student?.studentId || student?.userId || '').trim();
    const email = String(student?.email || '').trim();

    if (studentId) return `${name} (${studentId})`;
    if (email) return `${name} (${email})`;
    return name;
  };

  const loadSectionStudents = async (assignment) => {
    try {
      const { data: me } = await api.get('/users/me');
      const section = (me?.section || assignment?.section || '').toString().trim();

      if (!section) {
        setSectionStudents([]);
        return;
      }

      const { data } = await api.get(`/users/students?section=${encodeURIComponent(section)}`);
      const myId = String(me?.id || '');
      const myEmail = String(me?.email || '').toLowerCase();
      const myUserId = String(me?.userId || '').toLowerCase();

      const filtered = (data || []).filter((s) => {
        const sid = String(s?.id || '');
        const semail = String(s?.email || '').toLowerCase();
        const suserId = String(s?.studentId || s?.userId || '').toLowerCase();
        const sName = String(s?.fullName || s?.name || '').trim();
        if (sid && myId && sid === myId) return false;
        if (semail && myEmail && semail === myEmail) return false;
        if (suserId && myUserId && suserId === myUserId) return false;
        if (DUMMY_STUDENT_EMAILS.has(semail)) return false;
        if (DUMMY_STUDENT_IDS.has(String(s?.studentId || s?.userId || '').toUpperCase())) return false;
        if (DUMMY_STUDENT_NAMES.has(sName)) return false;
        return true;
      });

      setSectionStudents(filtered);
    } catch (error) {
      setSectionStudents([]);
    }
  };

  const resolveStudentByToken = (token) => {
    const needle = String(token || '').trim().toLowerCase();
    if (!needle) return null;

    return sectionStudents.find((s) => {
      const email = String(s?.email || '').trim().toLowerCase();
      const studentId = String(s?.studentId || s?.userId || '').trim().toLowerCase();
      const id = String(s?.id || '').trim().toLowerCase();
      const name = String(s?.fullName || s?.name || '').trim();
      return needle === email || needle === studentId || needle === id;
    }) || null;
  };

  const addSectionStudentToTeam = (student) => {
    if (!student || !selectedAssignment) return;

    if (isDummyStudentRecord(student)) {
      setInviteError('This student is not eligible for team invites.');
      return;
    }

    if (selectedAssignment.groupMode === 'TEACHER_SELECT') {
      setInviteError('Teacher manages groups for this assignment.');
      return;
    }

    const maxMembers = Math.max(2, Number(selectedAssignment.groupLimit || 3));
    const currentMembers = selectedAssignment.teamMembers || [];
    if (currentMembers.length >= maxMembers) {
      setInviteError(`Team size limit reached. Maximum ${maxMembers} students allowed.`);
      return;
    }

    const memberLabel = buildMemberLabel(student);
    const alreadyExists = currentMembers
      .some((member) => String(member).trim().toLowerCase() === memberLabel.toLowerCase());

    if (alreadyExists) {
      setInviteError('Student is already in your team.');
      return;
    }

    const memberRecord = {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      userId: student.studentId || student.userId
    };
    const updatedRecords = [...(selectedAssignment.teamMemberRecords || []), memberRecord];
    const updatedMembers = [...currentMembers, memberLabel];

    setAssignments(assignments.map((a) =>
      a.id === selectedAssignment.id ? { ...a, teamMembers: updatedMembers, teamMemberRecords: updatedRecords } : a
    ));

    setSelectedAssignment({
      ...selectedAssignment,
      teamMembers: updatedMembers,
      teamMemberRecords: updatedRecords
    });

    const allTeams = safeReadJson(STUDENT_TEAM_STORAGE_KEY, {});
    allTeams[String(selectedAssignment.id)] = updatedRecords;
    safeWriteJson(STUDENT_TEAM_STORAGE_KEY, allTeams);

    api.post(`/group-teams/assignment/${selectedAssignment.id}`, {
      groups: [{
        groupCode: 'G1',
        studentIds: updatedRecords.map((member) => member.id)
      }]
    }).catch(() => {
      // Fallback already stored locally.
    });

    setNewMemberEmail('');
    setSelectedSectionStudent('');
    setInviteError('');
  };

  const openSubmissionView = (assignment) => {
    setSelectedSubmission(assignment);
    setIsSubmissionViewOpen(true);
  };

  const closeSubmissionView = () => {
    setSelectedSubmission(null);
    setIsSubmissionViewOpen(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (selectedAssignment.isGroup) {
        const file = e.target.files[0];
        const uploaderName = currentUser?.fullName ? `${currentUser.fullName} (You)` : 'You';
        const newFile = {
          id: Date.now(),
          name: file.name,
          uploader: uploaderName,
          time: "Just now"
        };
        
        setAssignments(assignments.map(a => 
          a.id === selectedAssignment.id ? { ...a, teamFiles: [...a.teamFiles, newFile] } : a
        ));
        
        setSelectedAssignment({
          ...selectedAssignment,
          teamFiles: [...selectedAssignment.teamFiles, newFile]
        });

        // Use the latest picked file as the submission attachment sent to backend.
        setSelectedFile(file);
      } else {
        setSelectedFile(e.target.files[0]);
      }
    }
  };

  const handleDeleteTeamFile = (fileId) => {
    setAssignments(assignments.map(a => 
      a.id === selectedAssignment.id ? { ...a, teamFiles: a.teamFiles.filter(f => f.id !== fileId) } : a
    ));
    setSelectedAssignment({
      ...selectedAssignment,
      teamFiles: selectedAssignment.teamFiles.filter(f => f.id !== fileId)
    });
  };

  const handleAddMember = (e) => {
    e.preventDefault();
    const typedToken = newMemberEmail.trim();
    if (!typedToken) return;

    const matchedStudent = resolveStudentByToken(typedToken);
    if (!matchedStudent) {
      setInviteError('Student not found in your section. Use exact ID or email, or choose from the list.');
      return;
    }

    addSectionStudentToTeam(matchedStudent);
  };

  const handleAddSelectedStudent = () => {
    if (!selectedSectionStudent) {
      setInviteError('Select a student from your section list.');
      return;
    }

    const matchedStudent = sectionStudents.find((s) => String(s?.id) === String(selectedSectionStudent));
    if (!matchedStudent) {
      setInviteError('Selected student is not available.');
      return;
    }

    addSectionStudentToTeam(matchedStudent);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedAssignment?.isGroup && !canContributeToGroup) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append('assignmentId', selectedAssignment.id);
      formData.append('submissionText', submissionText);
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const submissionRes = await api.post('/submissions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      try {
        const { data: me } = await api.get('/users/me');
        const studentName = me?.fullName || 'A student';
        const studentId = me?.studentId || me?.userId || 'N/A';
        const section = me?.section || 'N/A';
        const teacherUserId = selectedAssignment?.teacherId
          || submissionRes?.data?.teacherId
          || submissionRes?.data?.assignmentTeacherId
          || submissionRes?.data?.createdById;

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

      localStorage.setItem('peerlearn_submission_update', Date.now().toString());
      localStorage.setItem('peerlearn_review_update', Date.now().toString());
      localStorage.setItem('peerlearn_notification_update', Date.now().toString());

      const date = new Date().toLocaleString('en-GB');
      const savedAttachment = getSubmissionAttachment(submissionRes?.data || {});
      setAssignments(assignments.map(a =>
        a.id === selectedAssignment.id
          ? {
              ...a,
              status: 'submitted',
              submissionText: submissionText,
              submissionDate: date,
              attachment: savedAttachment?.url
                ? savedAttachment
                : {
                    url: selectedFile ? URL.createObjectURL(selectedFile) : '',
                    name: selectedFile?.name || '',
                    isImage: Boolean(selectedFile?.type?.startsWith('image/'))
                  },
              teacherRemark: '',
              peerRemarks: []
            }
          : a
      ));
      closeModal();
    } catch (error) {
      // keep modal open on failure so user can retry
    }
  };

  const pendingList = assignments.filter(a => a.status === 'pending');
  const submittedList = assignments.filter(a => a.status === 'submitted');

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>My Assignments</h1>
        <p>View and submit your individual and group assignments</p>
      </div>

      <h2 className="section-header">Not Submitted ({pendingList.length})</h2>
      
      {pendingList.length === 0 ? (
        <div className="empty-card" style={{ padding: '3rem 2rem', marginBottom: '2rem' }}>
          <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: '1rem' }}/>
          <h3>All caught up!</h3>
          <p>You have no pending assignments.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {pendingList.map(assignment => (
            <div key={assignment.id} className="assignment-card">
              <div className="assignment-header-pending">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <h3>{assignment.title}</h3>
                    {assignment.isGroup && (
                      <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={12} /> Group Project
                      </span>
                    )}
                  </div>
                  <p className="card-author">by {assignment.author}</p>
                </div>
                <div className="task-badge-orange">{assignment.daysLeft}</div>
              </div>
              
              <div className="assignment-body">
                <div className="card-desc">{assignment.desc}</div>
                <div className="card-bottom">
                  <div className="card-meta">
                    <span className="meta-item"><Clock size={16} /> Due: {assignment.due}</span>
                    <span className="meta-item"><FileText size={16} /> Worth: {assignment.points} points</span>
                  </div>
                  <button className={assignment.isGroup ? "btn-cyan" : "btn-teal"} onClick={() => openModal(assignment)}>
                    {assignment.isGroup ? <><Users size={16} /> Open Workspace</> : <><Send size={16} /> Submit Assignment</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <>
        <h2 className="section-header">Submitted ({submittedList.length})</h2>
        {submittedList.length === 0 ? (
          <div className="empty-card" style={{ padding: '2.2rem 2rem', marginBottom: '2rem' }}>
            <p style={{ color: '#64748b' }}>No submissions yet. Once you submit an assignment, you can view feedback here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {submittedList.map(assignment => (
              <div key={assignment.id} className="assignment-card submitted">
                <div className="assignment-header-submitted">
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <CheckCircle2 color="#16a34a" size={20} style={{ marginTop: '2px' }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ color: '#166534', fontSize: '1.1rem', fontWeight: '600' }}>{assignment.title}</h3>
                        {assignment.isGroup && (
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', border: '1px solid #bbf7d0', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> Group
                          </span>
                        )}
                      </div>
                      <p className="card-author">by {assignment.author}</p>
                      <p className="card-author">Due: {assignment.due}</p>
                    </div>
                  </div>
                  <div className="task-badge-gray">Pending Grade</div>
                </div>

                <div className="assignment-body" style={{ paddingTop: '0' }}>
                  <p style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                    {assignment.isGroup ? "Team Submission Notes:" : "Your Submission:"}
                  </p>
                  <div className="submission-box">{assignment.submissionText || "No text submitted."}</div>
                  <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-cyan" onClick={() => openSubmissionView(assignment)}>
                      View Feedback
                    </button>
                    {assignment.attachment?.url && <AttachmentPreview attachment={assignment.attachment} accentColor="#0ea5e9" />}
                  </div>
                  <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Submitted: {assignment.submissionDate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </>

      {/* DYNAMIC MODAL */}
      {isModalOpen && selectedAssignment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" style={{ maxWidth: selectedAssignment.isGroup ? '850px' : '600px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}><X size={24} /></button>
            
            <h2 className="modal-title">{selectedAssignment.isGroup ? 'Team Workspace' : 'Submit Assignment'}</h2>
            <p className="modal-subtitle">{selectedAssignment.title}</p>
            <p className="modal-subtitle" style={{ marginTop: '-0.2rem' }}>Due: {selectedAssignment.due}</p>
            
            <div className="desc-box">
              <div className="desc-title">Assignment Description:</div>
              <div className="desc-text">{selectedAssignment.desc}</div>
            </div>

            {selectedAssignment.isGroup ? (
              <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ fontSize: '1.05rem', color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} color="#0284c7"/> Your Team
                  </h3>
                  
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedAssignment.teamMembers.map((member, idx) => (
                      <li key={idx} style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
                        {member}
                      </li>
                    ))}
                  </ul>

                  <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Invite Classmate</label>
                    {selectedAssignment.groupMode === 'TEACHER_SELECT' ? (
                      <div style={{ color: '#475569', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        Teacher selects groups for this project. Team invites are disabled.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input type="text" placeholder="Student ID or Email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }} />
                          <button type="submit" style={{ background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', padding: '0 0.75rem', cursor: 'pointer' }}><UserPlus size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <select
                            value={selectedSectionStudent}
                            onChange={(e) => {
                              setSelectedSectionStudent(e.target.value);
                              setInviteError('');
                            }}
                            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                          >
                            <option value="">Select student from your section</option>
                            {sectionStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {buildMemberLabel(student)}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={handleAddSelectedStudent} style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', padding: '0 0.75rem', cursor: 'pointer' }}>
                            Add
                          </button>
                        </div>
                      </>
                    )}
                    {inviteError && (
                      <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.1rem' }}>
                        {inviteError}
                      </div>
                    )}
                  </form>
                </div>

                <div style={{ flex: '2 1 400px' }}>
                  <form onSubmit={handleSubmit}>
                    <div className="input-group-modal" style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Shared Team Files
                        <input type="file" id="group-file-upload" style={{ display: 'none' }} onChange={handleFileChange} />
                        <label htmlFor="group-file-upload" style={{ color: '#0ea5e9', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Upload size={14}/> Add File
                        </label>
                      </label>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        {selectedAssignment.teamFiles && selectedAssignment.teamFiles.length > 0 ? (
                          selectedAssignment.teamFiles.map(file => (
                            <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <FileText size={16} color="#0891b2" />
                                <div>
                                  <div style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '500' }}>{file.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Uploaded by {file.uploader} • {file.time}</div>
                                </div>
                              </div>
                              <button type="button" onClick={() => handleDeleteTeamFile(file.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={16}/></button>
                            </div>
                          ))
                        ) : (
                          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '0.5rem 0' }}>No files uploaded yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="input-group-modal">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={16} color="#0284c7"/> Shared Submission Notes
                      </label>
                      <textarea className="textarea-field" placeholder="Write your group's final notes, findings, or GitHub links here..." value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} required style={{ minHeight: '100px' }} />
                    </div>

                    <div className="modal-actions" style={{ marginTop: '1.5rem', borderTop: 'none', paddingTop: 0 }}>
                      <button type="button" className="btn-cancel" onClick={closeModal}>Close Workspace</button>
                      {/* UPDATED: Changed from Submit Group Project to Submit My Contribution */}
                      <button type="submit" className="btn-teal" disabled={!canContributeToGroup} style={{ opacity: canContributeToGroup ? 1 : 0.6, cursor: canContributeToGroup ? 'pointer' : 'not-allowed' }}><Send size={16} /> Submit My Contribution</button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="input-group-modal">
                  <label>Your Submission *</label>
                  <textarea className="textarea-field" placeholder="Enter your assignment content here..." value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} required />
                  <p className="helper-text">Make sure to review your work before submitting.</p>
                </div>
                
                <div className="input-group-modal">
                  <label style={{ fontSize: '0.9rem' }}>Upload File (Optional)</label>
                  <div>
                    <input type="file" id="individual-file-upload" style={{ display: 'none' }} onChange={handleFileChange} />
                    {!selectedFile ? (
                      <label htmlFor="individual-file-upload" className="btn-cyan" style={{ display: 'inline-flex', width: 'fit-content', cursor: 'pointer' }}><Upload size={16} /> Upload File</label>
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
                  <button type="submit" className="btn-teal"><Send size={16} /> Submit Assignment</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isSubmissionViewOpen && selectedSubmission && (
        <div className="modal-overlay" onClick={closeSubmissionView}>
          <div className="modal-box" style={{ maxWidth: '760px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeSubmissionView}><X size={24} /></button>

            <h2 className="modal-title">Submission Feedback</h2>
            <p className="modal-subtitle">{selectedSubmission.title}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.35rem' }}>
                  Submitted Content
                </div>
                <div style={{ fontSize: '0.95rem', color: '#0f172a', lineHeight: 1.5 }}>
                  {selectedSubmission.submissionText || 'No text submitted.'}
                </div>
              </div>

              {selectedSubmission.attachment?.url && (
                <AttachmentPreview attachment={selectedSubmission.attachment} accentColor="#0ea5e9" />
              )}

              {selectedSubmission.teacherRemark && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '0.8rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.35rem' }}>
                    Teacher Feedback
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#4c1d95', lineHeight: 1.5 }}>
                    {selectedSubmission.teacherRemark}
                  </div>
                </div>
              )}

              {(selectedSubmission.peerRemarks || []).length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.8rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '0.35rem' }}>
                    Peer Feedback
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {selectedSubmission.peerRemarks.map((feedback, idx) => (
                      <div key={`${selectedSubmission.id}-peer-feedback-${idx}`} style={{ fontSize: '0.95rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                        {feedback}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!selectedSubmission.teacherRemark && (selectedSubmission.peerRemarks || []).length === 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem', color: '#64748b' }}>
                  Feedback is not available yet.
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={closeSubmissionView}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentAssignments;