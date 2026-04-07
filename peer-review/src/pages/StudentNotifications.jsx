import React, { useEffect, useState } from 'react';
import { Bell, Award, Star, Clock, FileText, CheckCircle2, Trash2 } from 'lucide-react';
import api from '../api';

const StudentNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  const getCurrentRole = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return '';
      const user = JSON.parse(raw);
      return String(user?.role || '').toUpperCase();
    } catch (error) {
      return '';
    }
  };

  const isAssignmentPostedNotification = (item) => {
    const title = String(item?.title || '').toLowerCase();
    const message = String(item?.message || '').toLowerCase();
    return title.includes('posted an assignment') || (message.includes(' posted ') && message.includes(' due: '));
  };

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

  const setStoredMap = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

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

  const styleByType = (type) => {
    const value = (type || '').toLowerCase();
    if (value === 'grade') return { color: '#a855f7', bg: '#f3e8ff', icon: <Award size={20} /> };
    if (value === 'review') return { color: '#0ea5e9', bg: '#e0f2fe', icon: <Star size={20} /> };
    if (value === 'alert') return { color: '#f97316', bg: '#ffedd5', icon: <Clock size={20} /> };
    return { color: '#10b981', bg: '#dcfce7', icon: <FileText size={20} /> };
  };

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const userKey = getCurrentUserKey();
        const readKey = `peerlearn_assignment_alert_read_${userKey}`;
        const deletedKey = `peerlearn_assignment_alert_deleted_${userKey}`;
        const readMap = getStoredMap(readKey);
        const deletedMap = getStoredMap(deletedKey);

        const [notificationsRes, assignmentRes, submissionsRes] = await Promise.all([
          api.get('/notifications'),
          api.get('/assignments/student').catch(() => ({ data: [] })),
          api.get('/submissions/student').catch(() => ({ data: [] }))
        ]);

        const role = getCurrentRole();
        const mapped = (notificationsRes.data || [])
          .filter((n) => !(role === 'TEACHER' && isAssignmentPostedNotification(n)))
          .map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          time: n.time,
          read: n.read,
          ...styleByType(n.type)
        }));

        const submittedAssignmentIds = new Set((submissionsRes.data || []).map((s) => s.assignmentId));
        const assignmentAlerts = (assignmentRes.data || [])
          .filter((a) => !submittedAssignmentIds.has(a.id))
          .map((a) => {
            const alertId = `assignment-${a.id}`;
            if (deletedMap[alertId]) return null;

            const dueText = a.dueDate ? new Date(a.dueDate).toLocaleString('en-GB') : '-';
            const teacherName = formatTeacherName(a.teacherName, a.teacherQualification);
            return {
              id: alertId,
              type: 'ALERT',
              title: `${teacherName} posted an assignment`,
              message: `${teacherName} posted ${a.title}. Due: ${dueText}`,
              time: 'New',
              read: !!readMap[alertId],
              ...styleByType('ALERT')
            };
          })
          .filter(Boolean);

        setNotifications(role === 'TEACHER' ? mapped : [...assignmentAlerts, ...mapped]);
      } catch (error) {
        setNotifications([]);
      }
    };

    loadNotifications();

    const handleFocus = () => loadNotifications();
    const handleStorage = (event) => {
      if (event.key === 'peerlearn_notification_update') {
        loadNotifications();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(loadNotifications, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all').catch(() => {});

      const userKey = getCurrentUserKey();
      const readKey = `peerlearn_assignment_alert_read_${userKey}`;
      const readMap = getStoredMap(readKey);
      notifications
        .filter((n) => String(n.id).startsWith('assignment-'))
        .forEach((n) => {
          readMap[n.id] = true;
        });
      setStoredMap(readKey, readMap);

      setNotifications(notifications.map(n => ({ ...n, read: true })));
      localStorage.setItem('peerlearn_notification_update', Date.now().toString());
      window.dispatchEvent(new Event('peerlearn-notification-update'));
    } catch (error) {
      // keep current view when request fails
    }
  };

  const deleteNotification = async (id) => {
    try {
      if (String(id).startsWith('assignment-')) {
        const userKey = getCurrentUserKey();
        const deletedKey = `peerlearn_assignment_alert_deleted_${userKey}`;
        const deletedMap = getStoredMap(deletedKey);
        deletedMap[id] = true;
        setStoredMap(deletedKey, deletedMap);
      } else {
        await api.delete(`/notifications/${id}`);
      }

      setNotifications(notifications.filter(n => n.id !== id));
      localStorage.setItem('peerlearn_notification_update', Date.now().toString());
      window.dispatchEvent(new Event('peerlearn-notification-update'));
    } catch (error) {
      // keep current view when request fails
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="dashboard-container" style={{ maxWidth: '800px' }}>
      
      <div className="page-header-row" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#0f172a' }}>Notifications</h1>
          <p style={{ color: '#64748b' }}>Stay updated on your grades, deadlines, and peer feedback</p>
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead} 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f0f9ff', color: '#0ea5e9', border: '1px solid #bae6fd', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.background = '#e0f2fe'}
            onMouseOut={(e) => e.currentTarget.style.background = '#f0f9ff'}
          >
            <CheckCircle2 size={18} /> Mark all as read
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <Bell size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ color: '#0f172a', fontSize: '1.25rem', marginBottom: '0.5rem' }}>All Caught Up!</h3>
            <p style={{ color: '#64748b' }}>You have no new notifications.</p>
          </div>
        ) : (
          notifications.map(note => (
            <div key={note.id} style={{ 
              display: 'flex', gap: '1.25rem', background: note.read ? 'white' : '#f8fafc', 
              padding: '1.5rem', borderRadius: '12px', border: `1px solid ${note.read ? '#e2e8f0' : '#cbd5e1'}`, 
              position: 'relative', transition: 'all 0.2s',
              boxShadow: note.read ? 'none' : '0 4px 6px rgba(0,0,0,0.02)'
            }}>
              
              {!note.read && (
                <div style={{ position: 'absolute', top: '1.5rem', left: '-6px', width: '12px', height: '12px', background: '#3b82f6', borderRadius: '50%', border: '2px solid white' }}></div>
              )}

              <div style={{ background: note.bg, color: note.color, width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {note.icon}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                  <h4 style={{ color: '#0f172a', fontSize: '1.05rem', margin: 0, fontWeight: note.read ? '600' : '700' }}>{note.title}</h4>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{note.time}</span>
                </div>
                <p style={{ color: '#475569', fontSize: '0.95rem', margin: '0 0 1rem 0', lineHeight: '1.5' }}>{note.message}</p>
              </div>

              <button 
                onClick={() => deleteNotification(note.id)}
                style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.25rem', height: 'fit-content' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentNotifications;