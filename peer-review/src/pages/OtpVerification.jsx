import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import api from '../api';

const OtpVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const pendingAuth = useMemo(() => {
    const stateData = location.state || {};
    const email = String(stateData.email || '').trim();
    const role = String(stateData.role || '').trim().toUpperCase();
    return {
      email,
      role
    };
  }, [location.state]);

  const getPendingOtpCredentials = () => {
    try {
      const raw = sessionStorage.getItem('peerlearn_pending_otp');
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const email = String(parsed?.email || '').trim();
      const password = String(parsed?.password || '');
      if (!email || !password) return null;

      return { email, password };
    } catch {
      return null;
    }
  };

  const formatTeacherName = (name, qualification) => {
    const cleanName = (name || '').trim();
    if (!cleanName) return '';

    const title = (qualification || '').trim();
    if (!title) return cleanName;

    const knownTitles = ['Dr.', 'Dr', 'Mr.', 'Mr', 'Mrs.', 'Mrs', 'Ms.', 'Ms', 'Prof.', 'Prof'];
    const firstWord = cleanName.split(' ')[0];
    if (knownTitles.includes(firstWord)) {
      return cleanName;
    }

    return `${title}. ${cleanName}`;
  };

  const normalizeOtpErrorMessage = (backendMessage, fallbackMessage) => {
    const message = String(backendMessage || '').trim().toLowerCase();
    if (!message) return fallbackMessage;

    if (
      message.includes('bad credentials') ||
      message.includes('invalid email or password') ||
      message.includes('incorrect email or password') ||
      message.includes('wrong credentials')
    ) {
      return 'Wrong email or password. Please try again.';
    }

    return backendMessage || fallbackMessage;
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!pendingAuth.email || !pendingAuth.role) {
      setErrorMessage('Session expired. Please login again.');
      return;
    }

    if (otp.trim().length !== 6) {
      setErrorMessage('Please enter a valid 6-digit OTP.');
      return;
    }

    try {
      const { data } = await api.post('/auth/verify-otp', {
        email: pendingAuth.email,
        otp: otp.trim()
      });

      if (String(data?.role || '').toUpperCase() !== pendingAuth.role) {
        setErrorMessage(`This account is registered as ${data?.role || 'another role'}. Please select the correct role and try again.`);
        return;
      }

      let normalizedUser = { ...data };
      if (String(data.role || '').toUpperCase() === 'TEACHER') {
        try {
          const qualificationMap = JSON.parse(localStorage.getItem('peerlearn_teacher_qualification_map') || '{}');
          const mappedQualification = qualificationMap[pendingAuth.email.toLowerCase()] || '';
          const qualification = data.qualification || mappedQualification;
          if (qualification) {
            normalizedUser = {
              ...normalizedUser,
              qualification,
              fullName: formatTeacherName(data.fullName, qualification)
            };
          }
        } catch {
          // ignore malformed local storage
        }
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(normalizedUser));

      setSuccessMessage('OTP verified successfully. Redirecting...');
      setTimeout(() => {
        sessionStorage.removeItem('peerlearn_pending_otp');
        if (data.role === 'STUDENT') navigate('/student');
        else navigate('/teacher');
      }, 450);
    } catch (error) {
      const status = error?.response?.status;
      const backendMessage = String(error?.response?.data?.message || '').trim();
      if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) {
        setErrorMessage(normalizeOtpErrorMessage(backendMessage, 'Invalid or expired OTP. Please try again.'));
      } else {
        setErrorMessage('Unable to verify OTP right now. Please try again.');
      }
    }
  };

  const handleResendOtp = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    const pendingCredentials = getPendingOtpCredentials();
    if (!pendingCredentials || !pendingAuth.email) {
      setErrorMessage('Session expired. Please login again.');
      return;
    }

    try {
      await api.post('/auth/login-otp', pendingCredentials);
      setSuccessMessage('A new OTP has been sent to your email.');
    } catch (error) {
      const backendMessage = String(error?.response?.data?.message || '').trim();
      setErrorMessage(normalizeOtpErrorMessage(backendMessage, 'Unable to resend OTP right now. Please try again.'));
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-left">
          <div className="icon-box">
            <BookOpen size={28} color="white" />
          </div>
          <h1>PeerLearn Platform</h1>
          <p>Collaborative learning through peer review and feedback</p>
        </div>

        <div className="login-right">
          <div className="welcome-text">
            <h2>Verify OTP</h2>
            <p>Enter the OTP sent to your email to complete sign in</p>
          </div>

          <form onSubmit={handleVerifyOtp}>
            <div className="input-group">
              <label>Email</label>
              <div className="input-field">
                <input type="email" value={pendingAuth.email} readOnly />
              </div>
            </div>

            <div className="input-group">
              <label>OTP Code</label>
              <div className="input-field">
                <input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength="6"
                />
              </div>
            </div>

            <button type="submit" className="submit-btn">Verify OTP</button>

            <button
              type="button"
              className="btn-cancel"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={handleResendOtp}
            >
              Resend OTP
            </button>

            <button
              type="button"
              className="btn-cancel"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={() => navigate('/')}
            >
              Back to login
            </button>

            {errorMessage && (
              <p className="demo-text" style={{ color: '#dc2626' }}>{errorMessage}</p>
            )}

            {successMessage && (
              <p className="demo-text" style={{ color: '#16a34a' }}>{successMessage}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default OtpVerification;
