import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X, FileText, CheckCircle2, Users } from 'lucide-react';
import api, { getSubmissionAttachment } from '../api';
import AttachmentPreview from '../components/AttachmentPreview';

const GROUP_MODE_STORAGE_KEY = 'peerlearn_group_modes';
const TEACHER_GROUP_STORAGE_KEY = 'peerlearn_teacher_groups';
const DUMMY_STUDENT_EMAILS = new Set(['student1@peerlearn.com', 'student2@peerlearn.com']);
const DUMMY_STUDENT_IDS = new Set(['STU-1001', 'STU-1002']);

const normalizeToken = (value) => String(value ?? '').trim().toLowerCase();

const collectTokens = (...values) => {
  const tokens = new Set();
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text) return;

    tokens.add(normalizeToken(text));
    const digits = text.match(/(\d+)/g);
    if (digits && digits.length > 0) {
      tokens.add(normalizeToken(digits.join('')));
    }
  });
  return tokens;
};

const parseDisplayDueDate = (displayValue) => {
  const text = String(displayValue || '').trim();
  if (!text || text === '-') return null;

  // Supports display format like DD/MM/YYYY, HH:mm:ss
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');
  const parsed = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDelayDuration = (milliseconds) => {
  const totalMinutes = Math.max(1, Math.floor(milliseconds / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const remainingMinutes = totalMinutes % 60;
    if (remainingMinutes === 0) {
      return `${totalHours} hour${totalHours === 1 ? '' : 's'}`;
    }
    return `${totalHours} hour${totalHours === 1 ? '' : 's'} ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (remainingHours === 0) {
    return `${totalDays} day${totalDays === 1 ? '' : 's'}`;
  }
  return `${totalDays} day${totalDays === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
};

const intersects = (setA, setB) => {
  for (const value of setA) {
    if (setB.has(value)) return true;
  }
  return false;
};

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const safeWriteJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const TeacherAssignments = () => {
  const [toast, setToast] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [isSubmissionsModalOpen, setIsSubmissionsModalOpen] = useState(false);
  const [submissionViewerTitle, setSubmissionViewerTitle] = useState('');
  const [submissionViewerAssignment, setSubmissionViewerAssignment] = useState(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState([]);
  const [missingSubmissionStudents, setMissingSubmissionStudents] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [viewerGroups, setViewerGroups] = useState([]);
  const [submissionGradeDrafts, setSubmissionGradeDrafts] = useState({});
  const [submissionGradeErrors, setSubmissionGradeErrors] = useState({});
  const [bulkMissingFeedback, setBulkMissingFeedback] = useState('No submission before deadline.');
  const [bulkMissingError, setBulkMissingError] = useState('');
  const [isBulkMissingGrading, setIsBulkMissingGrading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [groupManagerAssignment, setGroupManagerAssignment] = useState(null);
  const [groupSectionStudents, setGroupSectionStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [groupSelectionError, setGroupSelectionError] = useState('');
  const [existingGroupsPreview, setExistingGroupsPreview] = useState([]);
  
  // NEW: Added groupLimit to the new assignment state
  const [newAssignment, setNewAssignment] = useState({ 
    title: '', desc: '', due: '', points: 100, reviewsReq: 2, isGroup: false, groupLimit: 3, groupMode: 'STUDENT_SELECT', sections: ['A', 'B', 'C']
  });

  const availableSections = ['A', 'B', 'C'];

  const mapAssignment = (item, groupModes) => ({
    id: item.id,
    title: item.title,
    due: item.dueDate ? new Date(item.dueDate).toLocaleString('en-GB') : '-',
    points: item.points,
    reviewsReq: item.peerReviewsRequired,
    desc: item.description,
    dueRaw: item.dueDate || '',
    section: item.section || 'ALL',
    sections: [item.section || 'ALL'],
    sectionsById: { [String(item.id)]: item.section || 'ALL' },
    assignmentIds: [item.id],
    subs: item.submissionCount ?? 0,
    graded: 0,
    isGroup: item.group,
    groupLimit: item.groupLimit ?? 3,
    groupMode: groupModes[String(item.id)] || 'STUDENT_SELECT'
  });

  const groupedAssignments = useMemo(() => {
    const byKey = new Map();

    assignments.forEach((item) => {
      const groupKey = [
        String(item.title || '').trim().toLowerCase(),
        String(item.desc || '').trim().toLowerCase(),
        String(item.dueRaw || '').trim(),
        String(item.points ?? ''),
        String(item.reviewsReq ?? ''),
        String(Boolean(item.isGroup)),
        String(item.groupLimit ?? ''),
        String(item.groupMode || '').trim().toLowerCase()
      ].join('||');

      if (!byKey.has(groupKey)) {
        byKey.set(groupKey, {
          ...item,
          sections: Array.from(new Set(item.sections || [item.section || 'ALL'])),
          sectionsById: { ...(item.sectionsById || {}) },
          assignmentIds: [...(item.assignmentIds || [item.id])],
          subs: Number(item.subs || 0),
          graded: Number(item.graded || 0)
        });
        return;
      }

      const current = byKey.get(groupKey);
      current.sections = Array.from(new Set([
        ...(current.sections || []),
        ...(item.sections || [item.section || 'ALL'])
      ]));
      current.sectionsById = {
        ...(current.sectionsById || {}),
        ...(item.sectionsById || {})
      };
      current.assignmentIds = Array.from(new Set([
        ...(current.assignmentIds || []),
        ...(item.assignmentIds || [item.id])
      ]));
      current.subs = Number(current.subs || 0) + Number(item.subs || 0);
      current.graded = Number(current.graded || 0) + Number(item.graded || 0);

      byKey.set(groupKey, current);
    });

    return Array.from(byKey.values());
  }, [assignments]);

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        const { data } = await api.get('/assignments/teacher');
        const groupModes = safeReadJson(GROUP_MODE_STORAGE_KEY, {});
        setAssignments((data || []).map((a) => mapAssignment(a, groupModes)));
      } catch (error) {
        setAssignments([]);
      }
    };

    loadAssignments();
  }, []);

  const showToast = (title, subtitle) => {
    setToast({ title, subtitle });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewAssignment({ title: '', desc: '', due: '', points: 100, reviewsReq: 2, isGroup: false, groupLimit: 3, groupMode: 'STUDENT_SELECT', sections: ['A', 'B', 'C'] });
  };

  const extractRollValue = (student) => {
    const token = String(student?.studentId || student?.userId || '').trim();
    const numericParts = token.match(/(\d+)/g);
    if (!numericParts || numericParts.length === 0) return Number.MAX_SAFE_INTEGER;
    const parsed = Number(numericParts.join(''));
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  const sortStudentsSectionWise = (students = []) => {
    return [...students].sort((a, b) => {
      const sectionA = normalizeSection(a?.section);
      const sectionB = normalizeSection(b?.section);
      if (sectionA !== sectionB) return sectionA.localeCompare(sectionB);

      const rollA = extractRollValue(a);
      const rollB = extractRollValue(b);
      if (rollA !== rollB) return rollA - rollB;

      return String(a?.fullName || '').localeCompare(String(b?.fullName || ''));
    });
  };

  const getRelatedSections = (assignment) => {
    if (Array.isArray(assignment?.sections) && assignment.sections.length > 0) {
      return Array.from(new Set(assignment.sections.map((s) => normalizeSection(s)).filter(Boolean)));
    }

    const normalizedCurrent = normalizeSection(assignment?.section);
    if (!assignment) return normalizedCurrent ? [normalizedCurrent] : [];

    // When the same assignment is created for multiple sections,
    // cards are separate. This groups them back by a stable signature.
    const related = assignments.filter((a) =>
      a.title === assignment.title
      && a.desc === assignment.desc
      && a.due === assignment.due
      && Number(a.points) === Number(assignment.points)
      && Number(a.reviewsReq) === Number(assignment.reviewsReq)
      && Boolean(a.isGroup) === Boolean(assignment.isGroup)
      && Number(a.groupLimit || 0) === Number(assignment.groupLimit || 0)
    );

    const sections = Array.from(new Set(
      related
        .map((a) => normalizeSection(a.section))
        .filter(Boolean)
    ));

    if (sections.length > 0) return sections;
    return normalizedCurrent ? [normalizedCurrent] : [];
  };

  const getSavedGroupsForAssignment = (assignmentId) => {
    const map = safeReadJson(TEACHER_GROUP_STORAGE_KEY, {});
    return map[String(assignmentId)] || [];
  };

  const hasSavedGroups = (assignmentId) => getSavedGroupsForAssignment(assignmentId).length > 0;

  const hasAnySavedGroups = (assignmentIds = []) =>
    (assignmentIds || []).some((id) => hasSavedGroups(id));

  const openGroupManager = async (assignment) => {
    setGroupManagerAssignment(assignment);
    setIsGroupManagerOpen(true);
    setGroupSelectionError('');
    try {
      const targetSections = getRelatedSections(assignment);
      const includeAll = targetSections.length === 0 || targetSections.includes('ALL');

      const { data } = await api.get('/users/students');
      const students = sortStudentsSectionWise((data || []).filter((student) => {
        const email = String(student?.email || '').toLowerCase();
        const userId = String(student?.studentId || student?.userId || '').toUpperCase();
        if (DUMMY_STUDENT_EMAILS.has(email) || DUMMY_STUDENT_IDS.has(userId)) {
          return false;
        }

        if (includeAll) return true;
        const studentSection = normalizeSection(student?.section);
        return targetSections.includes(studentSection);
      }));

      const savedGroups = getSavedGroupsForAssignment(assignment.id);
      setExistingGroupsPreview(savedGroups);

      const preselectedIds = Array.from(new Set(
        savedGroups.flatMap((g) => (g.members || []).map((m) => String(m.id))).filter(Boolean)
      ));

      setGroupSectionStudents(students);
      setSelectedStudentIds(preselectedIds);
    } catch (error) {
      setGroupSectionStudents([]);
      setSelectedStudentIds([]);
      setExistingGroupsPreview([]);
    }
  };

  const closeGroupManager = () => {
    setIsGroupManagerOpen(false);
    setGroupManagerAssignment(null);
    setGroupSectionStudents([]);
    setSelectedStudentIds([]);
    setGroupSelectionError('');
    setExistingGroupsPreview([]);
  };

  const toggleSelectAllStudents = (checked) => {
    if (!checked) {
      setSelectedStudentIds([]);
      setGroupSelectionError('');
      return;
    }

    const maxMembers = Math.max(2, Number(groupManagerAssignment?.groupLimit || 3));
    const capped = groupSectionStudents.slice(0, maxMembers).map((s) => String(s.id));
    setSelectedStudentIds(capped);
    if (groupSectionStudents.length > maxMembers) {
      setGroupSelectionError(`You can select up to ${maxMembers} students in one group.`);
    } else {
      setGroupSelectionError('');
    }
  };

  const saveTeacherGroups = () => {
    if (!groupManagerAssignment) return;

    const selectedStudents = groupSectionStudents.filter((s) => selectedStudentIds.includes(String(s.id)));
    if (selectedStudents.length === 0) {
      showToast('No students selected', 'Select section students to create teacher-managed groups.');
      return;
    }

    const maxMembers = Math.max(2, Number(groupManagerAssignment.groupLimit || 3));
    if (selectedStudents.length > maxMembers) {
      setGroupSelectionError(`You can select up to ${maxMembers} students in one group.`);
      return;
    }

    const chunkSize = maxMembers;
    const groups = [];
    for (let i = 0; i < selectedStudents.length; i += chunkSize) {
      const members = selectedStudents.slice(i, i + chunkSize).map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
        userId: s.studentId || s.userId
      }));
      groups.push({
        groupName: `Group ${groups.length + 1}`,
        members
      });
    }

    const saveToBackend = async (groupsToSave) => {
      const payload = {
        groups: groupsToSave.map((g) => ({
          groupCode: g.groupName.replace('Group ', 'G'),
          studentIds: g.members.map((m) => m.id)
        }))
      };

      try {
        await api.post(`/group-teams/assignment/${groupManagerAssignment.id}`, payload);
      } catch (error) {
        // Keep local backup as fallback if backend endpoint is unavailable.
      }
    };

    const persistGroups = (groupsToSave) => {
      const map = safeReadJson(TEACHER_GROUP_STORAGE_KEY, {});
      map[String(groupManagerAssignment.id)] = groupsToSave;
      safeWriteJson(TEACHER_GROUP_STORAGE_KEY, map);
      saveToBackend(groupsToSave);
    };

    persistGroups(groups);
    setExistingGroupsPreview(groups);
    showToast('Groups saved', `Created ${groups.length} teacher-managed groups.`);
    closeGroupManager();
  };

  const autoPairTopToBottom = () => {
    if (!groupManagerAssignment) return;
    if (groupSectionStudents.length < 2) {
      setGroupSelectionError('Need at least 2 students to auto-create groups.');
      return;
    }

    const groupSize = Math.max(2, Number(groupManagerAssignment.groupLimit || 3));
    const groups = [];
    for (let i = 0; i < groupSectionStudents.length; i += groupSize) {
      const members = groupSectionStudents.slice(i, i + groupSize).map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
        userId: s.studentId || s.userId
      }));
      groups.push({
        groupName: `Group ${groups.length + 1}`,
        members
      });
    }

    const map = safeReadJson(TEACHER_GROUP_STORAGE_KEY, {});
    map[String(groupManagerAssignment.id)] = groups;
    safeWriteJson(TEACHER_GROUP_STORAGE_KEY, map);
    setExistingGroupsPreview(groups);

    const payload = {
      groups: groups.map((g) => ({
        groupCode: g.groupName.replace('Group ', 'G'),
        studentIds: g.members.map((m) => m.id)
      }))
    };

    api.post(`/group-teams/assignment/${groupManagerAssignment.id}`, payload).catch(() => {
      // fallback already saved to local storage
    });

    showToast('Auto grouping completed', `Created ${groups.length} groups with up to ${groupSize} students each (top to bottom).`);
    closeGroupManager();
  };

  const normalizeSection = (value) => String(value || '').replace('Section ', '').trim().toUpperCase();

  const formatTeacherName = (name, qualification) => {
    const cleanName = (name || '').trim();
    if (!cleanName) return 'Your teacher';

    const title = (qualification || '').trim();
    if (!title) return cleanName;

    const knownTitles = ['Dr.', 'Dr', 'Mr.', 'Mr', 'Mrs.', 'Mrs', 'Ms.', 'Ms', 'Prof.', 'Prof'];
    const firstWord = cleanName.split(' ')[0];
    if (knownTitles.includes(firstWord)) {
      return cleanName;
    }

    return `${title}. ${cleanName}`;
  };

  const sendStudentNotifications = async (assignmentPayload, createdAssignment) => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const teacherName = formatTeacherName(currentUser?.fullName, currentUser?.qualification);
      const { data } = await api.get('/users/students');
      const targetSection = normalizeSection(assignmentPayload.section || 'ALL');
      const students = (data || []).filter((student) => {
        const role = String(student?.role || '').toUpperCase();
        const isStudent = role === 'STUDENT' || !!student?.studentId;
        if (!isStudent) return false;
        if (String(student?.id) === String(currentUser?.id)) return false;

        if (targetSection === 'ALL') return true;
        return normalizeSection(student.section) === targetSection;
      });

      if (students.length === 0) {
        return;
      }

      const dueText = createdAssignment?.dueDate
        ? new Date(createdAssignment.dueDate).toLocaleString('en-GB')
        : assignmentPayload.dueDate;

      const requests = students.map((student) => api.post('/notifications', {
        userId: student.id,
        type: 'ALERT',
        title: `${teacherName} posted an assignment`,
        message: `${teacherName} posted ${assignmentPayload.title}. Due: ${dueText}`
      }));

      await Promise.allSettled(requests);
    } catch (error) {
      // Keep assignment creation successful even if notification broadcast fails.
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    try {
      const basePayload = {
        title: newAssignment.title,
        description: newAssignment.desc,
        dueDate: newAssignment.due,
        points: Number(newAssignment.points),
        peerReviewsRequired: Number(newAssignment.reviewsReq),
        group: newAssignment.isGroup,
        groupLimit: Number(newAssignment.groupLimit)
      };

      const createForSection = async (sectionValue) => {
        const payload = { ...basePayload, section: sectionValue };
        const { data } = await api.post('/assignments', payload);
        await sendStudentNotifications(payload, data);
        return data;
      };

      const selectedSections = (newAssignment.sections || []).filter(Boolean);
      if (selectedSections.length === 0) {
        showToast('Select at least one section', 'Choose one or more sections before creating the assignment.');
        return;
      }

      const createdResults = await Promise.allSettled(
        selectedSections.map((section) => createForSection(section))
      );

      const createdAssignments = createdResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);

      if (createdAssignments.length === 0) {
        throw new Error('Failed to create assignment for any selected section');
      }

      localStorage.setItem('peerlearn_assignment_update', Date.now().toString());
      localStorage.setItem('peerlearn_notification_update', Date.now().toString());

      if (newAssignment.isGroup) {
        const groupModes = safeReadJson(GROUP_MODE_STORAGE_KEY, {});
        createdAssignments.forEach((item) => {
          groupModes[String(item.id)] = newAssignment.groupMode || 'STUDENT_SELECT';
        });
        safeWriteJson(GROUP_MODE_STORAGE_KEY, groupModes);
      }

      window.dispatchEvent(new Event('peerlearn-assignment-update'));
      window.dispatchEvent(new Event('peerlearn-notification-update'));

      const groupModes = safeReadJson(GROUP_MODE_STORAGE_KEY, {});
      setAssignments([...createdAssignments.map((a) => mapAssignment(a, groupModes)), ...assignments]);
      handleCloseModal();

      if (createdAssignments.length > 1) {
        showToast('Assignment Created for Selected Sections!', 'Saved and shared with the checked sections.');
      } else {
        showToast('Assignment Created Successfully!', 'Students can now view and submit this assignment.');
      }
    } catch (error) {
      showToast("Failed to Create Assignment", "Please check inputs and try again.");
    }
  };

  const handleDelete = async (assignmentIds) => {
    const ids = Array.isArray(assignmentIds) ? assignmentIds : [assignmentIds];

    try {
      const results = await Promise.allSettled(ids.map((id) => api.delete(`/assignments/${id}`)));
      const succeededIds = results
        .map((result, index) => (result.status === 'fulfilled' ? ids[index] : null))
        .filter(Boolean);

      if (succeededIds.length > 0) {
        setAssignments((prev) => prev.filter((a) => !succeededIds.includes(a.id)));
      }

      if (succeededIds.length !== ids.length) {
        throw new Error('Some assignment entries could not be deleted.');
      }
    } catch (error) {
      const backendMessage = String(error?.response?.data?.message || error?.response?.data?.error || '').toLowerCase();
      const isDependencyError =
        backendMessage.includes('foreign key')
        || backendMessage.includes('cannot delete or update a parent row')
        || backendMessage.includes('constraint fails')
        || backendMessage.includes('peer_reviews')
        || backendMessage.includes('submissions');

      const friendlyMessage = isDependencyError
        ? 'Cannot delete assignment because students have submissions/reviews for it.'
        : 'Unable to delete assignment. Please try again.';

      showToast("Delete Failed", friendlyMessage);
    }
  };

  const openSubmissionsViewer = async (assignment) => {
    const assignmentIds = Array.isArray(assignment?.assignmentIds) && assignment.assignmentIds.length > 0
      ? assignment.assignmentIds
      : [assignment.id];

    setSubmissionViewerTitle(assignment.title);
    setSubmissionViewerAssignment(assignment);
    setIsSubmissionsModalOpen(true);
    setIsLoadingSubmissions(true);
    setAssignmentSubmissions([]);
    setMissingSubmissionStudents([]);
    setViewerGroups([]);
    setSubmissionGradeDrafts({});
    setSubmissionGradeErrors({});
    setBulkMissingFeedback('No submission before deadline.');
    setBulkMissingError('');
    setIsBulkMissingGrading(false);

    try {
      const submissionsResults = await Promise.allSettled(
        assignmentIds.map((id) => api.get(`/submissions/assignment/${id}`))
      );

      const submissions = submissionsResults.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return [];
        const assignmentId = assignmentIds[index];
        const section = assignment?.sectionsById?.[String(assignmentId)] || assignment?.section || 'ALL';
        return (result.value.data || []).map((entry) => ({
          ...entry,
          __assignmentId: assignmentId,
          __section: section
        }));
      });
      setAssignmentSubmissions(submissions);

      try {
        const { data: studentsData } = await api.get('/users/students');
        const targetSections = new Set(
          (Array.isArray(assignment?.sections) && assignment.sections.length > 0
            ? assignment.sections
            : [assignment?.section || 'ALL'])
            .map((section) => normalizeSection(section))
            .filter(Boolean)
        );

        const includeAll = targetSections.size === 0 || targetSections.has('ALL');
        const assignmentIdBySection = new Map(
          Object.entries(assignment?.sectionsById || {}).map(([id, section]) => [normalizeSection(section), Number(id)])
        );
        const fallbackAssignmentId = Number(assignmentIds[0]);

        const eligibleStudents = (studentsData || []).filter((student) => {
          const role = String(student?.role || '').toUpperCase();
          const isStudent = role === 'STUDENT' || !!student?.studentId;
          if (!isStudent) return false;

          const email = String(student?.email || '').toLowerCase();
          const userId = String(student?.studentId || student?.userId || '').toUpperCase();
          if (DUMMY_STUDENT_EMAILS.has(email) || DUMMY_STUDENT_IDS.has(userId)) return false;

          if (includeAll) return true;
          const section = normalizeSection(student?.section);
          return targetSections.has(section);
        });

        const submittedTokens = new Set();
        submissions.forEach((submission) => {
          getSubmissionTokens(submission).forEach((token) => submittedTokens.add(token));
        });

        const gradedMissingResults = await Promise.allSettled(
          assignmentIds.map((id) => api.get(`/teacher-grading-v2/assignment/${id}/graded-missing-students`))
        );
        const gradedMissingStudentIds = new Set(
          gradedMissingResults.flatMap((result) => {
            if (result.status !== 'fulfilled') return [];
            return (result.value?.data?.studentIds || []).map((id) => String(id));
          })
        );

        const missingStudents = eligibleStudents
          .filter((student) => {
            const studentTokens = collectTokens(student?.id, student?.userId, student?.studentId, student?.email);
            if (gradedMissingStudentIds.has(String(student?.id))) return false;
            return !intersects(studentTokens, submittedTokens);
          })
          .map((student) => ({
            id: String(student?.id || '').trim(),
            identifier: String(student?.studentId || student?.userId || student?.id || '').trim(),
            name: String(student?.fullName || student?.name || 'Student').trim(),
            section: normalizeSection(student?.section),
            __assignmentId: assignmentIdBySection.get(normalizeSection(student?.section)) || fallbackAssignmentId
          }));

        setMissingSubmissionStudents(missingStudents);
      } catch {
        setMissingSubmissionStudents([]);
      }

      const groupsResults = assignment.isGroup && assignment.groupMode === 'TEACHER_SELECT'
        ? await Promise.allSettled(assignmentIds.map((id) => api.get(`/group-teams/assignment/${id}`)))
        : [];

      const groupsFromApi = groupsResults.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return [];
        const assignmentId = assignmentIds[index];
        const section = assignment?.sectionsById?.[String(assignmentId)] || assignment?.section || 'ALL';
        return (result.value.data || []).map((group) => ({
          ...group,
          __assignmentId: assignmentId,
          __section: section
        }));
      });

      if (Array.isArray(groupsFromApi) && groupsFromApi.length > 0) {
        setViewerGroups(groupsFromApi);
      } else {
        const localGroups = assignmentIds.flatMap((id) =>
          getSavedGroupsForAssignment(id).map((group) => ({
            ...group,
            __assignmentId: id,
            __section: assignment?.sectionsById?.[String(id)] || assignment?.section || 'ALL'
          }))
        );
        setViewerGroups(localGroups);
      }

      const initialDrafts = {};
      submissions.forEach((s) => {
        initialDrafts[String(s.id)] = {
          score: s.teacherScore ?? '',
          feedback: s.teacherFeedback || ''
        };
      });
      setSubmissionGradeDrafts(initialDrafts);

      if (submissionsResults.every((result) => result.status !== 'fulfilled')) {
        showToast('Unable to load submissions', 'Please try again.');
      }
    } catch (error) {
      setAssignmentSubmissions([]);
      showToast('Unable to load submissions', 'Please try again.');
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const closeSubmissionsViewer = () => {
    setIsSubmissionsModalOpen(false);
    setSubmissionViewerTitle('');
    setSubmissionViewerAssignment(null);
    setAssignmentSubmissions([]);
    setMissingSubmissionStudents([]);
    setIsLoadingSubmissions(false);
    setViewerGroups([]);
    setSubmissionGradeDrafts({});
    setSubmissionGradeErrors({});
    setBulkMissingFeedback('No submission before deadline.');
    setBulkMissingError('');
    setIsBulkMissingGrading(false);
  };

  const isSubmissionViewerOverdue = useMemo(() => {
    const dueRaw = submissionViewerAssignment?.dueRaw;
    const dueDisplay = submissionViewerAssignment?.due;
    const dueDate = dueRaw ? new Date(dueRaw) : parseDisplayDueDate(dueDisplay);
    return dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && Date.now() > dueDate.getTime();
  }, [submissionViewerAssignment?.dueRaw, submissionViewerAssignment?.due]);

  const getSubmissionTokens = (submission) => collectTokens(
    submission?.studentId,
    submission?.studentUserId,
    submission?.submittedById,
    submission?.userId,
    submission?.studentEmail
  );

  const getMemberTokens = (member) => collectTokens(
    member?.id,
    member?.userId,
    member?.studentId,
    member?.email
  );

  const normalizeGroupMembers = (group) => {
    if (Array.isArray(group?.members) && group.members.length > 0) {
      return group.members;
    }

    if (Array.isArray(group?.studentIds) && group.studentIds.length > 0) {
      return group.studentIds.map((id) => ({ id }));
    }

    return [];
  };

  const getMemberLabel = (member) => {
    const name = String(member?.fullName || member?.name || 'Student').trim();
    const id = String(member?.studentId || member?.userId || member?.id || '').trim();
    return id ? `${name} (${id})` : name;
  };

  const getGroupKey = (group, index) => {
    const preferred = String(group?.id || group?.groupCode || group?.groupName || `group-${index + 1}`);
    const section = String(group?.__section || '').trim().toUpperCase();
    const assignmentId = String(group?.__assignmentId || '').trim();
    return [normalizeToken(assignmentId), normalizeToken(section), normalizeToken(preferred) || `group-${index + 1}`].filter(Boolean).join('||');
  };

  const getGroupTitle = (group, index) => {
    const section = String(group?.__section || '').trim().toUpperCase();
    const sectionLabel = section && section !== 'ALL' ? `Section ${section}` : '';
    const name = String(group?.groupName || '').trim();
    if (name) return sectionLabel ? `${sectionLabel} - ${name}` : name;
    const code = String(group?.groupCode || '').trim();
    if (code) return sectionLabel ? `${sectionLabel} - Group ${code}` : `Group ${code}`;
    return sectionLabel ? `${sectionLabel} - Group ${index + 1}` : `Group ${index + 1}`;
  };

  const findGroupForSubmission = (submission) => {
    const studentTokens = getSubmissionTokens(submission);
    if (studentTokens.size === 0) return null;

    const assignmentScopedGroups = (viewerGroups || []).filter((group) => {
      const groupAssignmentId = String(group?.__assignmentId || '');
      const submissionAssignmentId = String(submission?.__assignmentId || '');
      if (!groupAssignmentId || !submissionAssignmentId) return true;
      return groupAssignmentId === submissionAssignmentId;
    });

    const sourceGroups = assignmentScopedGroups.length > 0 ? assignmentScopedGroups : viewerGroups;

    for (const group of sourceGroups) {
      const members = normalizeGroupMembers(group);
      const found = members.some((member) => intersects(getMemberTokens(member), studentTokens));
      if (found) {
        return { group, members };
      }
    }

    return null;
  };

  const getGroupGradeEligibility = (submission) => {
    const isGroup = Boolean(submissionViewerAssignment?.isGroup);
    if (!isGroup) {
      return { canGrade: true, helper: '' };
    }

    const dueRaw = submissionViewerAssignment?.dueRaw;
    const dueDisplay = submissionViewerAssignment?.due;
    const dueDate = dueRaw ? new Date(dueRaw) : parseDisplayDueDate(dueDisplay);
    const isOverdue = dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && Date.now() > dueDate.getTime();

    if (isOverdue) {
      return {
        canGrade: true,
        helper: 'Due date exceeded: grading is unlocked. Non-submitters can be assigned 0 marks.'
      };
    }

    const mode = submissionViewerAssignment?.groupMode || 'STUDENT_SELECT';
    if (mode !== 'TEACHER_SELECT') {
      return { canGrade: true, helper: '' };
    }

    if (!Array.isArray(viewerGroups) || viewerGroups.length === 0) {
      return {
        canGrade: false,
        helper: 'Create/select groups first. Grading is unlocked after all members in the student\'s group submit.'
      };
    }

    const resolvedGroup = findGroupForSubmission(submission);
    if (!resolvedGroup) {
      return {
        canGrade: false,
        helper: 'This student is not mapped to a teacher-selected group.'
      };
    }

    const memberList = resolvedGroup.members;
    const submittedMembers = memberList.filter((member) => {
      const memberTokens = getMemberTokens(member);
      return assignmentSubmissions.some((s) => intersects(memberTokens, getSubmissionTokens(s)));
    });

    if (submittedMembers.length < memberList.length) {
      return {
        canGrade: false,
        helper: `Waiting for all group members: ${submittedMembers.length}/${memberList.length} submitted.`
      };
    }

    return {
      canGrade: true,
      helper: `Group complete: ${submittedMembers.length}/${memberList.length} submitted.`
    };
  };

  const getLateSubmissionInfo = (submission) => {
    const dueRaw = submissionViewerAssignment?.dueRaw;
    const dueDisplay = submissionViewerAssignment?.due;
    const dueDate = dueRaw ? new Date(dueRaw) : parseDisplayDueDate(dueDisplay);
    const submittedDate = submission?.submittedAt ? new Date(submission.submittedAt) : null;

    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
      return { isLate: false, message: '' };
    }
    if (!(submittedDate instanceof Date) || Number.isNaN(submittedDate.getTime())) {
      return { isLate: false, message: '' };
    }

    const delay = submittedDate.getTime() - dueDate.getTime();
    if (delay <= 0) {
      return { isLate: false, message: '' };
    }

    return {
      isLate: true,
      message: `Assignment was submitted ${formatDelayDuration(delay)} after the deadline.`
    };
  };

  const getGroupedSubmissionBuckets = () => {
    const isGroup = Boolean(submissionViewerAssignment?.isGroup);
    if (!isGroup) {
      return [{
        key: 'all-submissions',
        title: 'All Submissions',
        submissions: assignmentSubmissions,
        pendingMembers: [],
        submittedCount: assignmentSubmissions.length,
        totalMembers: assignmentSubmissions.length
      }];
    }

    if (!Array.isArray(viewerGroups) || viewerGroups.length === 0) {
      return [{
        key: 'group-info-missing',
        title: 'Group Details Not Available',
        submissions: assignmentSubmissions,
        pendingMembers: [],
        submittedCount: assignmentSubmissions.length,
        totalMembers: assignmentSubmissions.length
      }];
    }

    const buckets = viewerGroups.map((group, index) => ({
      key: getGroupKey(group, index),
      title: getGroupTitle(group, index),
      members: normalizeGroupMembers(group),
      submissions: [],
      pendingMembers: [],
      submittedCount: 0,
      totalMembers: 0
    }));

    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    const unassigned = {
      key: 'unassigned-submissions',
      title: 'Unassigned Submissions',
      members: [],
      submissions: [],
      pendingMembers: [],
      submittedCount: 0,
      totalMembers: 0
    };

    assignmentSubmissions.forEach((submission) => {
      const resolved = findGroupForSubmission(submission);
      if (!resolved) {
        unassigned.submissions.push(submission);
        return;
      }

      const key = getGroupKey(resolved.group, viewerGroups.findIndex((g) => g === resolved.group));
      const bucket = byKey.get(key);
      if (!bucket) {
        unassigned.submissions.push(submission);
        return;
      }
      bucket.submissions.push(submission);
    });

    buckets.forEach((bucket) => {
      const members = bucket.members || [];
      bucket.totalMembers = members.length;

      if (members.length === 0) {
        bucket.submittedCount = bucket.submissions.length;
        return;
      }

      const submittedMembers = members.filter((member) => {
        const memberTokens = getMemberTokens(member);
        return bucket.submissions.some((submission) => intersects(memberTokens, getSubmissionTokens(submission)));
      });

      bucket.submittedCount = submittedMembers.length;
      bucket.pendingMembers = members
        .filter((member) => !submittedMembers.includes(member))
        .map((member) => getMemberLabel(member));
    });

    const visibleBuckets = buckets.filter((bucket) => bucket.submissions.length > 0 || (bucket.members || []).length > 0);
    if (unassigned.submissions.length > 0) {
      unassigned.submittedCount = unassigned.submissions.length;
      unassigned.totalMembers = unassigned.submissions.length;
      visibleBuckets.push(unassigned);
    }

    return visibleBuckets;
  };

  const updateSubmissionGradeDraft = (submissionId, patch) => {
    const key = String(submissionId);
    setSubmissionGradeDrafts((prev) => ({
      ...prev,
      [key]: {
        score: prev[key]?.score ?? '',
        feedback: prev[key]?.feedback ?? '',
        ...patch
      }
    }));
  };

  const gradeSubmissionFromViewer = async (submission) => {
    const key = String(submission.id);
    const eligibility = getGroupGradeEligibility(submission);
    if (!eligibility.canGrade) {
      setSubmissionGradeErrors((prev) => ({
        ...prev,
        [key]: eligibility.helper || 'Grade is blocked until all group members submit.'
      }));
      return;
    }

    const draft = submissionGradeDrafts[key] || { score: '', feedback: '' };
    const scoreValue = Number(draft.score);
    const maxScore = Number(submission.maxScore || submissionViewerAssignment?.points || 100);
    const feedbackText = String(draft.feedback || '').trim();

    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > maxScore) {
      setSubmissionGradeErrors((prev) => ({
        ...prev,
        [key]: `Enter a valid score between 0 and ${maxScore}.`
      }));
      return;
    }

    if (!feedbackText) {
      setSubmissionGradeErrors((prev) => ({
        ...prev,
        [key]: 'Feedback is required to submit grade.'
      }));
      return;
    }

    try {
      await api.patch(`/submissions/${submission.id}/grade`, {
        score: scoreValue,
        feedback: feedbackText
      });

      setAssignmentSubmissions((prev) => prev.map((s) => (
        String(s.id) === key
          ? {
              ...s,
              status: 'FULLY_GRADED',
              teacherScore: scoreValue,
              teacherFeedback: feedbackText
            }
          : s
      )));

      setSubmissionGradeErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });

      showToast('Grade submitted', 'Submission graded successfully.');
    } catch (error) {
      const backendMessage = String(error?.response?.data?.message || error?.response?.data?.error || '').trim();
      const lowered = backendMessage.toLowerCase();
      const userMessage = lowered.includes('all') && lowered.includes('group') && lowered.includes('submit')
        ? 'This group can be graded only after all members submit.'
        : (backendMessage || 'Unable to submit grade. Please try again.');

      setSubmissionGradeErrors((prev) => ({
        ...prev,
        [key]: userMessage
      }));
    }
  };

  const gradeAllMissingStudentsFromViewer = async () => {
    if (!isSubmissionViewerOverdue) {
      setBulkMissingError('You can grade not-submitted students only after due date.');
      return;
    }

    const feedbackText = String(bulkMissingFeedback || '').trim();
    if (!feedbackText) {
      setBulkMissingError('Feedback is required before grading all not-submitted students.');
      return;
    }

    if (!Array.isArray(missingSubmissionStudents) || missingSubmissionStudents.length === 0) {
      setBulkMissingError('No not-submitted students found for this assignment.');
      return;
    }

    setBulkMissingError('');
    setIsBulkMissingGrading(true);

    try {
      const requests = missingSubmissionStudents.map((student) => {
        const assignmentId = Number(student?.__assignmentId || submissionViewerAssignment?.assignmentIds?.[0] || submissionViewerAssignment?.id);
        return api.post('/teacher-grading-v2/grade-missing', {
          assignmentId,
          studentId: Number(student.id),
          score: 0,
          feedback: feedbackText
        });
      });

      const results = await Promise.allSettled(requests);
      const succeededIds = new Set(
        results
          .map((result, index) => (result.status === 'fulfilled' ? String(missingSubmissionStudents[index].id) : null))
          .filter(Boolean)
      );

      if (succeededIds.size > 0) {
        setMissingSubmissionStudents((prev) => prev.filter((student) => !succeededIds.has(String(student.id))));
      }

      const failedCount = results.length - succeededIds.size;
      if (failedCount === 0) {
        showToast('Grades submitted', `Assigned 0 marks to ${succeededIds.size} not-submitted students.`);
      } else if (succeededIds.size > 0) {
        showToast('Partially completed', `Assigned grades to ${succeededIds.size} students. ${failedCount} failed.`);
      } else {
        setBulkMissingError('Unable to submit missing grades. Please try again.');
      }
    } finally {
      setIsBulkMissingGrading(false);
    }
  };

  return (
    <div className="dashboard-container">

      {/* GLOBAL TOAST POPUP */}
      {toast && (
        <div className="toast-notification">
          <CheckCircle2 size={28} color="white" />
          <div className="toast-content">
            <span className="toast-title">{toast.title}</span>
            <span className="toast-subtitle">{toast.subtitle}</span>
          </div>
        </div>
      )}

      <div className="page-header-row">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#0f172a' }}>Assignments</h1>
          <p style={{ color: '#64748b' }}>Create and manage assignments</p>
        </div>
        <button className="btn-cyan" onClick={handleOpenModal} style={{ padding: '0.75rem 1.5rem', background: '#0ea5e9', color: 'white' }}>
          <Plus size={18} /> Create Assignment
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
        {assignments.length === 0 ? (
          <div className="empty-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <FileText size={40} color="#0ea5e9" style={{ marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>No assignments yet</h3>
            <p style={{ color: '#64748b' }}>Create your first assignment to get started.</p>
          </div>
        ) : groupedAssignments.map((item) => (
          <div key={item.id} className="assignment-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white' }}>
            <div style={{ backgroundColor: '#f0f9ff', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
                  <h3 style={{ color: '#0369a1', fontSize: '1.15rem', fontWeight: '600', margin: 0 }}>{item.title}</h3>
                  {/* DYNAMIC GROUP BADGE WITH LIMIT */}
                  {item.isGroup && (
                    <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Users size={12} /> Group Project (Max {item.groupLimit})
                    </span>
                  )}
                  {item.isGroup && (
                    <span style={{ background: '#f1f5f9', color: '#334155', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      {item.groupMode === 'TEACHER_SELECT' ? 'Teacher Selects Groups' : 'Students Select Team'}
                    </span>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
                  <span>
                    Sections: {Array.isArray(item.sections) && item.sections.length > 0
                      ? item.sections.map((section) => (section === 'ALL' ? 'All Sections' : section)).join(', ')
                      : (item.section === 'ALL' ? 'All Sections' : `Section ${item.section}`)}
                  </span>
                  <span>Due: {item.due}</span>
                  <span>• {item.points} points</span>
                  <span>• {item.reviewsReq} reviews required</span>
                </div>
              </div>
              
              <button 
                onClick={() => handleDelete(item.assignmentIds || [item.id])} 
                className="delete-btn-custom"
                title="Delete Assignment"
                style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Trash2 size={20} strokeWidth={2.5} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>{item.desc}</p>
              {item.isGroup && item.groupMode === 'TEACHER_SELECT' && (
                <div style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className="btn-cyan"
                    style={{ background: '#0284c7', color: 'white' }}
                    onClick={() => openGroupManager(item)}
                  >
                    <Users size={16} /> {hasAnySavedGroups(item.assignmentIds || [item.id]) ? 'View/Edit Groups' : 'Select Groups'}
                  </button>
                </div>
              )}
              <div className="badge-group" style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-cancel"
                  style={{ padding: '0.45rem 0.8rem' }}
                  onClick={() => openSubmissionsViewer(item)}
                >
                  View Submissions
                </button>
                <span className="badge cyan" style={{ padding: '0.5rem 0.75rem', borderRadius: '6px' }}>{item.subs} submissions</span>
                <span className="badge green" style={{ padding: '0.5rem 0.75rem', borderRadius: '6px' }}>{item.graded} graded</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={handleCloseModal}><X size={24} /></button>
            <h2 className="modal-title">Create New Assignment</h2>
            <p className="modal-subtitle">Set up a new assignment for your students</p>

            <form onSubmit={handleCreateAssignment}>
              <div className="input-group-modal">
                <label>Assignment Title *</label>
                <input type="text" className="textarea-field" style={{ minHeight: '45px', padding: '0 0.75rem' }} value={newAssignment.title} onChange={(e) => setNewAssignment({...newAssignment, title: e.target.value})} required />
              </div>

              <div className="input-group-modal">
                <label>Description *</label>
                <textarea className="textarea-field" value={newAssignment.desc} onChange={(e) => setNewAssignment({...newAssignment, desc: e.target.value})} required />
              </div>

              {/* ENHANCED GROUP PROJECT TOGGLE WITH DYNAMIC LIMIT FIELD */}
              <div className="input-group-modal" style={{ flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input 
                    type="checkbox" 
                    id="group-toggle"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={newAssignment.isGroup} 
                    onChange={(e) => setNewAssignment({...newAssignment, isGroup: e.target.checked})} 
                  />
                  <label htmlFor="group-toggle" style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a', fontWeight: '500' }}>
                    <Users size={18} color="#4f46e5" /> Enable Group Project (Team Workspace)
                  </label>
                </div>
                
                {/* Dynamically shows only when Group is enabled */}
                {newAssignment.isGroup && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', paddingLeft: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <label style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '500', margin: 0 }}>Max Members per Team:</label>
                      <input 
                        type="number" 
                        min="2"
                        max="15"
                        className="textarea-field" 
                        style={{ minHeight: '35px', padding: '0 0.5rem', width: '80px', margin: 0 }}
                        value={newAssignment.groupLimit}
                        onChange={(e) => setNewAssignment({...newAssignment, groupLimit: parseInt(e.target.value) || 2})}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '500', margin: 0 }}>Team Formation Mode:</label>
                      <select
                        className="textarea-field"
                        style={{ minHeight: '38px', maxWidth: '260px', padding: '0 0.5rem' }}
                        value={newAssignment.groupMode}
                        onChange={(e) => setNewAssignment({ ...newAssignment, groupMode: e.target.value })}
                      >
                        <option value="STUDENT_SELECT">Students select teammates</option>
                        <option value="TEACHER_SELECT">Teacher selects groups</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="input-group-modal">
                <label>Assign to Sections *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '0.25rem 0' }}>
                  {availableSections.map((section) => {
                    const isChecked = newAssignment.sections.includes(section);
                    return (
                      <label
                        key={section}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.65rem 0.9rem',
                          borderRadius: '10px',
                          border: `1px solid ${isChecked ? '#7c3aed' : '#cbd5e1'}`,
                          background: isChecked ? '#f5e8ff' : '#fff',
                          color: '#1e293b',
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setNewAssignment((prev) => ({
                              ...prev,
                              sections: e.target.checked
                                ? [...prev.sections, section]
                                : prev.sections.filter((item) => item !== section)
                            }));
                          }}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        Section {section}
                      </label>
                    );
                  })}
                </div>
                <p className="helper-text">Students in the checked sections will see this assignment.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="input-group-modal">
                  <label>Due Date *</label>
                  <input type="datetime-local" className="textarea-field" style={{ minHeight: '45px', padding: '0 0.75rem' }} value={newAssignment.due} onChange={(e) => setNewAssignment({...newAssignment, due: e.target.value})} required />
                </div>
                <div className="input-group-modal">
                  <label>Total Points</label>
                  <input type="number" className="textarea-field" style={{ minHeight: '45px', padding: '0 0.75rem' }} value={newAssignment.points} onChange={(e) => setNewAssignment({...newAssignment, points: e.target.value})} />
                </div>
              </div>

              <div className="input-group-modal" style={{ marginBottom: '1.5rem' }}>
                <label>Peer Reviews Required</label>
                <input type="number" className="textarea-field" style={{ minHeight: '45px', padding: '0 0.75rem' }} value={newAssignment.reviewsReq} onChange={(e) => setNewAssignment({...newAssignment, reviewsReq: e.target.value})} />
              </div>

              <div className="modal-actions" style={{ borderTop: 'none', paddingTop: '1rem' }}>
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-cyan" style={{ background: '#0ea5e9', color: 'white' }}>Create Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isGroupManagerOpen && groupManagerAssignment && (
        <div className="modal-overlay" onClick={closeGroupManager}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <button className="modal-close" onClick={closeGroupManager}><X size={24} /></button>
            <h2 className="modal-title">Select Groups</h2>
            <p className="modal-subtitle">{groupManagerAssignment.title} - Section {groupManagerAssignment.section}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#334155', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={groupSectionStudents.length > 0 && selectedStudentIds.length === Math.min(groupSectionStudents.length, Math.max(2, Number(groupManagerAssignment?.groupLimit || 3)))}
                  onChange={(e) => toggleSelectAllStudents(e.target.checked)}
                />
                Select all students
              </label>

              <span style={{ color: '#334155', fontSize: '0.9rem', fontWeight: 600 }}>
                Max students per group: {Math.max(2, Number(groupManagerAssignment?.groupLimit || 3))}
              </span>

              <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                Listed by section and roll number order.
              </span>
            </div>
            {groupSelectionError && (
              <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.65rem' }}>
                {groupSelectionError}
              </div>
            )}

            {existingGroupsPreview.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.85rem', background: '#f8fafc' }}>
                <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Existing Groups</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {existingGroupsPreview.map((group, idx) => (
                    <div key={`${group.groupName}-${idx}`} style={{ fontSize: '0.85rem', color: '#334155' }}>
                      <strong>{group.groupName}:</strong> {(group.members || []).map((m) => m.fullName).join(', ') || 'No members'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
              {groupSectionStudents.length === 0 ? (
                <p style={{ color: '#64748b', margin: 0 }}>No students found in this section.</p>
              ) : groupSectionStudents.map((student) => {
                const checked = selectedStudentIds.includes(String(student.id));
                const label = `${student.fullName} (${student.studentId || student.userId || student.email})`;
                const sectionText = normalizeSection(student.section || groupManagerAssignment.section);
                return (
                  <label key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.35rem', borderBottom: '1px solid #f1f5f9' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const maxMembers = Math.max(2, Number(groupManagerAssignment?.groupLimit || 3));
                        setSelectedStudentIds((prev) => {
                          if (e.target.checked) {
                            if (prev.length >= maxMembers) {
                              setGroupSelectionError(`You can select up to ${maxMembers} students in one group.`);
                              return prev;
                            }
                            setGroupSelectionError('');
                            return [...prev, String(student.id)];
                          }
                          setGroupSelectionError('');
                          return prev.filter((id) => id !== String(student.id));
                        });
                      }}
                    />
                    <span style={{ color: '#0f172a', fontSize: '0.9rem' }}>{label}</span>
                    <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.78rem' }}>Section {sectionText}</span>
                  </label>
                );
              })}
            </div>

            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
              <button type="button" className="btn-cancel" onClick={autoPairTopToBottom}>Auto Group (Max per group)</button>
              <button type="button" className="btn-cancel" onClick={closeGroupManager}>Cancel</button>
              <button type="button" className="btn-cyan" style={{ background: '#0ea5e9', color: 'white' }} onClick={saveTeacherGroups}>
                Save Groups
              </button>
            </div>
          </div>
        </div>
      )}

      {isSubmissionsModalOpen && (
        <div className="modal-overlay" onClick={closeSubmissionsViewer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
            <button className="modal-close" onClick={closeSubmissionsViewer}><X size={24} /></button>
            <h2 className="modal-title">Submissions</h2>
            <p className="modal-subtitle">{submissionViewerTitle}</p>
            <p className="modal-subtitle" style={{ marginTop: '-0.2rem' }}>
              Due: {submissionViewerAssignment?.due || '-'}
            </p>

            {!isLoadingSubmissions && missingSubmissionStudents.length > 0 && (
              <div style={{ marginBottom: '0.8rem', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: '10px', padding: '0.7rem 0.8rem' }}>
                <div style={{ color: '#92400e', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.4rem' }}>
                  Not Submitted ({missingSubmissionStudents.length})
                </div>
                <div style={{ color: isSubmissionViewerOverdue ? '#166534' : '#92400e', fontSize: '0.8rem', marginBottom: '0.55rem' }}>
                  {isSubmissionViewerOverdue
                    ? 'Due date exceeded: you can now assign marks for not-submitted students.'
                    : 'Marks for not-submitted students can be assigned only after due date.'}
                </div>

                <div style={{ marginBottom: '0.6rem', border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '8px', padding: '0.55rem 0.6rem' }}>
                  <div style={{ color: '#7c2d12', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    Bulk grading
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'start' }}>
                    <textarea
                      className="textarea-field"
                      style={{ minHeight: '58px' }}
                      value={bulkMissingFeedback}
                      onChange={(e) => setBulkMissingFeedback(e.target.value)}
                      placeholder="Feedback for all not-submitted students"
                      disabled={!isSubmissionViewerOverdue || isBulkMissingGrading}
                    />
                    <button
                      type="button"
                      className="btn-cyan"
                      style={{ minWidth: '220px', background: isSubmissionViewerOverdue && !isBulkMissingGrading ? '#f97316' : '#cbd5e1', color: '#fff' }}
                      disabled={!isSubmissionViewerOverdue || isBulkMissingGrading}
                      onClick={gradeAllMissingStudentsFromViewer}
                    >
                      {isBulkMissingGrading ? 'Submitting...' : 'Give 0 to All Not Submitted'}
                    </button>
                  </div>

                  {bulkMissingError && (
                    <div style={{ marginTop: '0.4rem', color: '#dc2626', fontSize: '0.78rem' }}>
                      {bulkMissingError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {missingSubmissionStudents.map((student) => (
                    <span
                      key={`${student.id}-${student.section}`}
                      style={{ background: '#fef3c7', color: '#78350f', borderRadius: '999px', padding: '0.2rem 0.5rem', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      {student.name}{student.identifier ? ` (${student.identifier})` : ''}{student.section ? ` - ${student.section}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              {isLoadingSubmissions ? (
                <div style={{ color: '#64748b', padding: '0.75rem' }}>Loading submissions...</div>
              ) : assignmentSubmissions.length === 0 ? (
                <div style={{ color: '#64748b', padding: '0.75rem' }}>No submissions yet for this assignment.</div>
              ) : getGroupedSubmissionBuckets().map((bucket) => (
                <div key={bucket.key} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.8rem', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ color: '#0f172a', fontWeight: 700 }}>{bucket.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#334155', background: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                      {bucket.submittedCount}/{bucket.totalMembers || bucket.submissions.length} submitted
                    </div>
                  </div>

                  {bucket.pendingMembers.length > 0 && (
                    <div style={{ color: '#92400e', fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                      Pending: {bucket.pendingMembers.join(', ')}
                    </div>
                  )}

                  {bucket.submissions.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.85rem', padding: '0.2rem 0.1rem' }}>No member has submitted yet.</div>
                  ) : bucket.submissions.map((s) => {
                    const status = String(s.status || '').toUpperCase();
                    const isGraded = status === 'FULLY_GRADED';
                    const gradeDraft = submissionGradeDrafts[String(s.id)] || { score: '', feedback: '' };
                    const eligibility = getGroupGradeEligibility(s);
                    const lateInfo = getLateSubmissionInfo(s);
                    const maxScore = Number(s.maxScore || submissionViewerAssignment?.points || 100);
                    const attachment = getSubmissionAttachment(s);
                    return (
                      <div key={s.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.65rem', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                          <div style={{ color: '#0f172a', fontWeight: 600 }}>
                            {s.studentName || 'Student'} {s.studentUserId ? `(${s.studentUserId})` : ''}
                          </div>
                          <span style={{ color: isGraded ? '#16a34a' : '#ea580c', fontWeight: 600, fontSize: '0.82rem' }}>
                            {isGraded ? 'Graded' : 'Needs Grading'}
                          </span>
                        </div>
                        <div style={{ color: '#334155', fontSize: '0.92rem', marginBottom: '0.35rem' }}>
                          {s.submissionText || 'No text submission.'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                          Submitted: {s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-GB') : '-'}
                        </div>

                        {lateInfo.isLate && (
                          <div style={{ marginTop: '0.45rem', color: '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
                            {lateInfo.message}
                          </div>
                        )}

                        {attachment?.url && (
                          <div style={{ marginTop: '0.55rem' }}>
                            <AttachmentPreview attachment={attachment} accentColor="#0ea5e9" />
                          </div>
                        )}

                        {submissionViewerAssignment?.isGroup && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: eligibility.canGrade ? '#166534' : '#92400e' }}>
                            {eligibility.helper || 'Group project submission'}
                          </div>
                        )}

                        {!isGraded && (
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.65rem', alignItems: 'start' }}>
                              <input
                                type="number"
                                min="0"
                                max={maxScore}
                                value={gradeDraft.score}
                                onChange={(e) => updateSubmissionGradeDraft(s.id, { score: e.target.value })}
                                placeholder={`Score / ${maxScore}`}
                                className="textarea-field"
                                style={{ minHeight: '38px', padding: '0 0.5rem' }}
                                disabled={!eligibility.canGrade}
                              />
                              <textarea
                                value={gradeDraft.feedback}
                                onChange={(e) => updateSubmissionGradeDraft(s.id, { feedback: e.target.value })}
                                placeholder="Teacher feedback"
                                className="textarea-field"
                                style={{ minHeight: '80px' }}
                                disabled={!eligibility.canGrade}
                              />
                            </div>

                            {submissionGradeErrors[String(s.id)] && (
                              <div style={{ marginTop: '0.45rem', color: '#dc2626', fontSize: '0.82rem' }}>
                                {submissionGradeErrors[String(s.id)]}
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                              <button
                                type="button"
                                className="btn-cyan"
                                style={{ padding: '0.4rem 0.85rem', background: eligibility.canGrade ? '#0ea5e9' : '#cbd5e1', color: 'white', cursor: eligibility.canGrade ? 'pointer' : 'not-allowed' }}
                                disabled={!eligibility.canGrade}
                                onClick={() => gradeSubmissionFromViewer(s)}
                              >
                                Submit Grade
                              </button>
                            </div>
                          </div>
                        )}

                        {isGraded && (
                          <div style={{ marginTop: '0.6rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem', color: '#166534', fontSize: '0.85rem' }}>
                            Teacher Score: {s.teacherScore ?? '-'} / {maxScore}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: '0.9rem' }}>
              <button type="button" className="btn-cancel" onClick={closeSubmissionsViewer}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherAssignments;