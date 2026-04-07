import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';

// Page Imports
import Login from './pages/Login'; 
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherAssignments from './pages/TeacherAssignments';
import StudentAssignments from './pages/StudentAssignments';
import StudentCalendar from './pages/StudentCalendar';
import TeacherCalendar from './pages/TeacherCalendar';
import StudentResources from './pages/StudentResources';
import TeacherResources from './pages/TeacherResources';
import StudentPeerReviews from './pages/StudentPeerReviews';
import StudentNotifications from './pages/StudentNotifications';
import StudentProfile from './pages/StudentProfile';
import TeacherStudents from './pages/TeacherStudents'; 
import TeacherProfile from './pages/TeacherProfile'; // <-- Import the new profile!

// Layout component to keep the Navigation bar visible on dashboard pages
const DashboardLayout = ({ children, role }) => {
  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Navigation role={role} />
      {children}
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Route */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Student Routes */}
        <Route path="/student" element={<DashboardLayout role="student"><StudentDashboard /></DashboardLayout>} />
        <Route path="/student/assignments" element={<DashboardLayout role="student"><StudentAssignments /></DashboardLayout>} />
        <Route path="/student/calendar" element={<DashboardLayout role="student"><StudentCalendar /></DashboardLayout>} />
        <Route path="/student/resources" element={<DashboardLayout role="student"><StudentResources /></DashboardLayout>} />
        <Route path="/student/reviews" element={<DashboardLayout role="student"><StudentPeerReviews /></DashboardLayout>} />
        <Route path="/student/notifications" element={<DashboardLayout role="student"><StudentNotifications /></DashboardLayout>} />
        <Route path="/student/profile" element={<DashboardLayout role="student"><StudentProfile /></DashboardLayout>} />

        {/* Teacher Routes */}
        <Route path="/teacher" element={<DashboardLayout role="teacher"><TeacherDashboard /></DashboardLayout>} />
        <Route path="/teacher/assignments" element={<DashboardLayout role="teacher"><TeacherAssignments /></DashboardLayout>} />
        <Route path="/teacher/calendar" element={<DashboardLayout role="teacher"><TeacherCalendar /></DashboardLayout>} />
        <Route path="/teacher/resources" element={<DashboardLayout role="teacher"><TeacherResources /></DashboardLayout>} />
        <Route path="/teacher/notifications" element={<DashboardLayout role="teacher"><StudentNotifications /></DashboardLayout>} />
        
        {/* This route now correctly points to the TeacherProfile */}
        <Route path="/teacher/profile" element={<DashboardLayout role="teacher"><TeacherProfile /></DashboardLayout>} />
        
        {/* The Teacher route for viewing a specific student's profile */}
        <Route path="/teacher/student-profile" element={<DashboardLayout role="teacher"><StudentProfile /></DashboardLayout>} />
        <Route path="/teacher/students" element={<DashboardLayout role="teacher"><TeacherStudents /></DashboardLayout>} />
      </Routes>
    </Router>
  );
}

export default App;