import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Bell, LogOut, User } from 'lucide-react';
import api from '../api';
//navigation
const Navigation = ({ role }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileInitials, setProfileInitials] = useState('');
  const dropdownRef = useRef(null);

  const getCurrentUserKey = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return 'default';
      const user = JSON.parse(raw);
      return String(user?.id || user?.email || user?.userId || 'default');
    } catch (error) {
      return 'default';
    }
  };

  const getStoredMap = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (error) {
      return {};
    }
  };

  const isAssignmentPostedNotification = (item) => {
    const title = String(item?.title || '').toLowerCase();
    const message = String(item?.message || '').toLowerCase();
    return title.includes('posted an assignment') || (message.includes(' posted ') && message.includes(' due: '));
  };

  const getInitials = (fullName) => {
    if (!fullName || typeof fullName !== 'string') return '';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const { data } = await api.get('/notifications');
        const baseNotifications = role === 'teacher'
          ? (data || []).filter((item) => !isAssignmentPostedNotification(item))
          : (data || []);

        let unread = baseNotifications.filter((item) => !item.read).length;

        if (role === 'student') {
          const userKey = getCurrentUserKey();
          const readMap = getStoredMap(`peerlearn_assignment_alert_read_${userKey}`);
          const deletedMap = getStoredMap(`peerlearn_assignment_alert_deleted_${userKey}`);

          const [assignmentRes, submissionsRes] = await Promise.all([
            api.get('/assignments/student').catch(() => ({ data: [] })),
            api.get('/submissions/student').catch(() => ({ data: [] }))
          ]);

          const submittedAssignmentIds = new Set((submissionsRes.data || []).map((s) => s.assignmentId));
          const syntheticUnread = (assignmentRes.data || []).filter((a) => {
            const syntheticId = `assignment-${a.id}`;
            return !submittedAssignmentIds.has(a.id) && !readMap[syntheticId] && !deletedMap[syntheticId];
          }).length;

          unread += syntheticUnread;
        }

        setUnreadCount(unread);
      } catch (error) {
        setUnreadCount(0);
      }
    };

    loadUnreadCount();

    const handleFocus = () => loadUnreadCount();
    const handleStorage = (event) => {
      if (event.key === 'peerlearn_notification_update') {
        loadUnreadCount();
      }
    };
    const handleNotificationUpdate = () => loadUnreadCount();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('peerlearn-notification-update', handleNotificationUpdate);
    const interval = setInterval(loadUnreadCount, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('peerlearn-notification-update', handleNotificationUpdate);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fromStorage = () => {
      try {
        const raw = localStorage.getItem('user');
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        return getInitials(parsed?.fullName);
      } catch (error) {
        return '';
      }
    };

    const setDefault = () => setProfileInitials(role === 'teacher' ? 'T' : 'S');

    const storedInitials = fromStorage();
    if (storedInitials) {
      setProfileInitials(storedInitials);
      return;
    }

    const loadProfile = async () => {
      try {
        const { data } = await api.get('/users/me');
        const initials = getInitials(data?.fullName);
        if (initials) {
          setProfileInitials(initials);
        } else {
          setDefault();
        }
      } catch (error) {
        setDefault();
      }
    };

    loadProfile();
  }, [role]);

  const links = role === 'teacher' 
    ? [
        { name: 'Dashboard', path: '/teacher' },
        { name: 'Assignments', path: '/teacher/assignments' },
        { name: 'Students', path: '/teacher/students' },
        { name: 'Calendar', path: '/teacher/calendar' },
        { name: 'Resources', path: '/teacher/resources' }
      ]
    : [
        { name: 'Dashboard', path: '/student' },
        { name: 'My Assignments', path: '/student/assignments' },
        { name: 'Peer Reviews', path: '/student/reviews' },
        { name: 'Calendar', path: '/student/calendar' },
        { name: 'Resources', path: '/student/resources' }
      ];

  return (
    <nav className="navbar">
      <div className="nav-left">
        {/* The Link 'to' property perfectly redirects to the dashboard based on role */}
        <Link to={role === 'teacher' ? '/teacher' : '/student'} className="brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="brand-icon"><BookOpen size={20} strokeWidth={2.5} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
            <span style={{ color: '#a21caf', fontWeight: '700' }}>PeerLearn</span>
            <span className="role-badge" style={{ color: '#64748b', fontSize: '0.75rem' }}>{role}</span>
          </div>
        </Link>
        
        <div className="nav-links">
          {links.map((link) => (
            <Link key={link.name} to={link.path} className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}>
              {link.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="nav-right" style={{ position: 'relative' }} ref={dropdownRef}>
        <div className="bell-icon-wrapper" onClick={() => navigate(`/${role}/notifications`)} style={{ cursor: 'pointer' }}>
          <Bell size={22} color="#64748b" />
          {unreadCount > 0 && <div className="notification-dot">{unreadCount}</div>}
        </div>
        
        <div 
          className="profile-icon" 
          onClick={() => setShowDropdown(!showDropdown)}
          style={{ cursor: 'pointer', display: 'flex', gap: '4px', paddingRight: '4px' }}
        >
          {profileInitials}
        </div>

        {showDropdown && (
          <div style={{ 
            position: 'absolute', top: '110%', right: '0', background: 'white', 
            borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
            border: '1px solid #f1f5f9', width: '180px', zIndex: '1000', overflow: 'hidden'
          }}>
            <div 
              style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', transition: 'background 0.2s' }}
              onClick={() => { navigate(`/${role}/profile`); setShowDropdown(false); }}
              onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
              onMouseOut={(e) => e.currentTarget.style.background = 'white'}
            >
              <User size={16} color="#64748b" />
              <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: '500' }}>My Profile</span>
            </div>
            <div 
              style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
              onClick={() => navigate('/')}
              onMouseOver={(e) => e.currentTarget.style.background = '#fef2f2'}
              onMouseOut={(e) => e.currentTarget.style.background = 'white'}
            >
              <LogOut size={16} color="#ef4444" />
              <span style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: '600' }}>Logout</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
