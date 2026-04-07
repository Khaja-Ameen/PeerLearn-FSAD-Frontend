import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '../api';

const TeacherStudents = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('A');
  const [searchQuery, setSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState([]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const [{ data: studentsData }, { data: assignmentsData }] = await Promise.all([
          api.get('/users/students'),
          api.get('/assignments/teacher')
        ]);

        const assignments = assignmentsData || [];
        const submissionLists = await Promise.all(
          assignments.map(async (a) => {
            try {
              const { data } = await api.get(`/submissions/assignment/${a.id}`);
              return data || [];
            } catch (error) {
              return [];
            }
          })
        );

        const allSubmissions = submissionLists.flat();

        const toTeacherPercentage = (submission) => {
          const maxScore = Number(submission?.maxScore || 100);
          if (!maxScore || maxScore <= 0) return null;

          const rawTeacherScore = submission?.teacherScore;
          if (rawTeacherScore === null || rawTeacherScore === undefined || rawTeacherScore === '') return null;

          const teacherScore = Number(rawTeacherScore);
          if (Number.isNaN(teacherScore)) return null;
          return (teacherScore / maxScore) * 100;
        };

        const toPeerPercentage = (submission) => {
          const maxScore = Number(submission?.maxScore || 100);
          if (!maxScore || maxScore <= 0) return null;

          const peerScore = Number(submission?.averagePeerScore);
          const peerCount = Number(submission?.peerReviewCount || 0);
          if (!Number.isNaN(peerScore) && peerCount > 0) {
            const normalizedPeer = peerScore > maxScore ? (peerScore / peerCount) : peerScore;
            return (normalizedPeer / maxScore) * 100;
          }
          return null;
        };

        const statsByStudent = allSubmissions.reduce((acc, sub) => {
          const sid = String(sub.studentId);
          if (!acc[sid]) {
            acc[sid] = {
              subs: 0,
              reviewCount: 0,
              teacherEarned: 0,
              teacherPossible: 0,
              peerPercentages: []
            };
          }

          acc[sid].subs += 1;
          acc[sid].reviewCount += Number(sub.peerReviewCount || 0);

          const teacherPercentage = toTeacherPercentage(sub);
          if (teacherPercentage !== null && Number.isFinite(teacherPercentage)) {
            const teacherScore = Number(sub?.teacherScore);
            const maxScore = Number(sub?.maxScore || 100);
            if (!Number.isNaN(teacherScore) && !Number.isNaN(maxScore) && maxScore > 0) {
              acc[sid].teacherEarned += teacherScore;
              acc[sid].teacherPossible += maxScore;
            }
          }

          const peerPercentage = toPeerPercentage(sub);
          if (peerPercentage !== null && Number.isFinite(peerPercentage)) {
            acc[sid].peerPercentages.push(peerPercentage);
          }

          return acc;
        }, {});

        const { data } = { data: studentsData };
        const dummyEmails = new Set(['student1@peerlearn.com', 'student2@peerlearn.com']);
        const mapped = (data || [])
          .filter((s) => !dummyEmails.has((s.email || '').toLowerCase()))
          .map((s) => ({
          id: s.id,
          idNumber: s.studentId || s.userId,
          initials: s.initials,
          name: s.fullName,
          email: s.email,
          section: (s.section || '').replace('Section ', ''),
          subs: statsByStudent[String(s.id)]?.subs || 0,
          reviews: statsByStudent[String(s.id)]?.reviewCount || 0,
          teacherAvg: (() => {
            const teacherEarned = Number(statsByStudent[String(s.id)]?.teacherEarned || 0);
            const teacherPossible = Number(statsByStudent[String(s.id)]?.teacherPossible || 0);
            if (teacherPossible <= 0) return '0.0%';
            const teacherAvg = (teacherEarned / teacherPossible) * 100;
            return `${teacherAvg.toFixed(1)}%`;
          })(),
          peerAvg: (() => {
            const peerScores = statsByStudent[String(s.id)]?.peerPercentages || [];
            if (!peerScores.length) return '0.0%';
            const peerAvg = peerScores.reduce((sum, curr) => sum + curr, 0) / peerScores.length;
            return `${peerAvg.toFixed(1)}%`;
          })(),
          overallAvg: (() => {
            const peerScores = statsByStudent[String(s.id)]?.peerPercentages || [];

            const teacherEarned = Number(statsByStudent[String(s.id)]?.teacherEarned || 0);
            const teacherPossible = Number(statsByStudent[String(s.id)]?.teacherPossible || 0);
            const teacherAvg = teacherPossible > 0 ? ((teacherEarned / teacherPossible) * 100) : 0;
            const peerAvg = peerScores.length
              ? (peerScores.reduce((sum, curr) => sum + curr, 0) / peerScores.length)
              : 0;

            const overall = (teacherAvg > 0 && peerAvg > 0)
              ? (teacherAvg + peerAvg) / 2
              : (teacherAvg || peerAvg || 0);

            return `${overall.toFixed(1)}%`;
          })()
        }));
        setAllStudents(mapped);
      } catch (error) {
        setAllStudents([]);
      }
    };

    loadStudents();
  }, []);

  const filteredStudents = allStudents.filter(student => {
    const matchesSection = student.section === activeSection;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = student.name.toLowerCase().includes(searchLower) || student.idNumber.toLowerCase().includes(searchLower);
    return matchesSection && matchesSearch;
  });

  const sectionCounts = useMemo(() => ({
    A: allStudents.filter(s => s.section === 'A').length,
    B: allStudents.filter(s => s.section === 'B').length,
    C: allStudents.filter(s => s.section === 'C').length
  }), [allStudents]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Students</h1>
        <p>Overview of student performance across sections</p>
      </div>
      <div className="stats-grid">
        <div className="stat-card card-magenta"><div className="stat-card-header">Total Students</div><div className="stat-value">{allStudents.length}</div></div>
        <div className="stat-card card-blue"><div className="stat-card-header">Sections</div><div className="stat-value">3</div></div>
        <div className="stat-card card-green"><div className="stat-card-header">Total Submissions</div><div className="stat-value">{allStudents.reduce((sum, s) => sum + s.subs, 0)}</div></div>
        <div className="stat-card card-orange"><div className="stat-card-header">Peer Reviews</div><div className="stat-value">{allStudents.reduce((sum, s) => sum + s.reviews, 0)}</div></div>
      </div>
      <div className="students-filter-row">
        <div className="section-tabs">
          <button className={`sec-tab ${activeSection === 'A' ? 'active' : ''}`} onClick={() => setActiveSection('A')}>Section A ({sectionCounts.A})</button>
          <button className={`sec-tab ${activeSection === 'B' ? 'active' : ''}`} onClick={() => setActiveSection('B')}>Section B ({sectionCounts.B})</button>
          <button className={`sec-tab ${activeSection === 'C' ? 'active' : ''}`} onClick={() => setActiveSection('C')}>Section C ({sectionCounts.C})</button>
        </div>
        <div className="search-bar-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by ID or Name..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="section-label">Section {activeSection} - {filteredStudents.length} Students found</div>
      <div className="students-grid">
        {filteredStudents.map((student) => (
          <div key={student.id} className="student-card">
            <div className="stu-card-header">
              <div className="stu-avatar">{student.initials}</div>
              <div className="stu-info">
                <h3>{student.name}</h3><p>{student.email}</p><span className="stu-id-tag">ID: {student.idNumber}</span>
              </div>
            </div>
            <div className="stu-stats">
              <div className="stu-stat-row"><span>Submissions</span><span className="stu-stat-val cyan">{student.subs}</span></div>
              <div className="stu-stat-row"><span>Peer Reviews</span><span className="stu-stat-val green">{student.reviews}</span></div>
              <div className="stu-stat-row"><span>Teacher Average</span><span className="stu-stat-badge">{student.teacherAvg}</span></div>
              <div className="stu-stat-row"><span>Peer Average</span><span className="stu-stat-badge">{student.peerAvg}</span></div>
              <div className="stu-stat-row"><span>Overall Average</span><span className="stu-stat-badge">{student.overallAvg}</span></div>
            </div>
            
            {/* Navigates to the student-profile route AND sends the data! */}
            <button 
              className="btn-view-profile" 
              onClick={() => navigate('/teacher/student-profile', { state: { student } })}
            >
              View Profile
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeacherStudents;