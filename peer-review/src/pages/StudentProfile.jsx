import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail, User, Shield, Hash, LogOut } from 'lucide-react';
import api from '../api';

const StudentProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if a teacher is viewing this profile based on the URL path
  const isTeacherView = location.pathname.includes('/teacher');

  const [profileData, setProfileData] = useState(null);

  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (isTeacherView) return;
      try {
        const { data } = await api.get('/users/me');
        const storedUser = getStoredUser();
        setProfileData({
          name: data.fullName || storedUser?.fullName || '',
          initials: data.initials || '',
          email: data.email || storedUser?.email || '',
          role: data.role || storedUser?.role || 'STUDENT',
          section: data.section || storedUser?.section || '',
          userId: data.studentId || data.userId || storedUser?.studentId || storedUser?.userId || '',
          memberSince: data.memberSince || storedUser?.memberSince || ''
        });
      } catch (error) {
        const storedUser = getStoredUser();
        if (storedUser) {
          setProfileData({
            name: storedUser.fullName || '',
            initials: '',
            email: storedUser.email || '',
            role: storedUser.role || 'STUDENT',
            section: storedUser.section || '',
            userId: storedUser.studentId || storedUser.userId || '',
            memberSince: storedUser.memberSince || ''
          });
        } else {
          setProfileData(null);
        }
      }
    };

    loadProfile();
  }, [isTeacherView]);

  const sourceData = location.state?.student || profileData || {};
  const normalizedRole = String(sourceData.role || profileData?.role || 'STUDENT').trim() || 'STUDENT';
  const studentData = {
    name: sourceData.name || '',
    initials: sourceData.initials || '',
    email: sourceData.email || '',
    role: normalizedRole,
    section: sourceData.section || '',
    userId: sourceData.userId || sourceData.studentId || sourceData.idNumber || '',
    memberSince: sourceData.memberSince || ''
  };

  const boxStyle = { background: 'white', borderRadius: '12px', padding: '1.5rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };
  const labelStyle = { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0d9488', fontWeight: '600', fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid #f0fdfa', paddingBottom: '0.5rem' };

  return (
    <div className="dashboard-container" style={{ maxWidth: '900px' }}>
      <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Back</button>
      
      <div style={{ background: 'linear-gradient(to bottom, #fdf2f8, #ffffff)', borderRadius: '16px', padding: '3rem', textAlign: 'center', border: '1px solid #fce7f3', marginBottom: '2rem' }}>
        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontSize: '2.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          {studentData.initials}
        </div>
        <h2 style={{ fontSize: '1.8rem', color: '#0f172a', marginBottom: '0.4rem' }}>{studentData.name}</h2>
        <span style={{ background: '#d946ef', color: 'white', padding: '0.2rem 0.8rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold' }}>{studentData.role}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={boxStyle}>
          <div style={labelStyle}><Mail size={16}/> Email Address</div>
          <div style={{ color: '#334155', fontWeight: '500' }}>{studentData.email}</div>
        </div>
        <div style={boxStyle}>
          <div style={labelStyle}><User size={16}/> Role</div>
          <div style={{ color: '#334155', fontWeight: '500' }}>{studentData.role}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={boxStyle}>
          <div style={{...labelStyle, color: '#0891b2'}}><Shield size={16}/> Section Number</div>
          <div style={{ color: '#334155', fontWeight: '500' }}>{studentData.section}</div>
        </div>
        <div style={boxStyle}>
          <div style={{...labelStyle, color: '#9a3412'}}><Hash size={16}/> Student ID</div>
          <div style={{ color: '#334155', fontWeight: '500' }}>{studentData.userId}</div>
        </div>
      </div>

      {/* Account Info Section */}
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f1f5f9', marginBottom: '2rem' }}>
        <div style={{ background: '#f8fafc', padding: '1rem 1.5rem', color: '#7c3aed', fontWeight: '600', borderBottom: '1px solid #f1f5f9' }}>
          Account Information
        </div>
        <div style={{ padding: '0 1.5rem' }}>
          {[
            { label: 'Account Type', value: `${studentData.role} Account` },
            { label: 'Status', value: 'Active', isBadge: true },
            { label: 'Enrolled Section', value: studentData.section },
            { label: 'Member Since', value: studentData.memberSince }
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 0', borderBottom: idx === 3 ? 'none' : '1px solid #f1f5f9' }}>
              <span style={{ color: '#475569', fontWeight: '500' }}>{item.label}</span>
              {item.isBadge ? (
                <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>{item.value}</span>
              ) : (
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{item.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conditionally render the Logout Button only if NOT viewed by a teacher */}
      {!isTeacherView && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
          <button 
            onClick={() => navigate('/')} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              background: '#fef2f2', color: '#ef4444', 
              border: '1px solid #fecaca', padding: '0.75rem 1.5rem', 
              borderRadius: '8px', fontWeight: '600', cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#fee2e2'}
            onMouseOut={(e) => e.currentTarget.style.background = '#fef2f2'}
          >
            <LogOut size={18} />
            Logout of Account
          </button>
        </div>
      )}

    </div>
  );
};

export default StudentProfile;