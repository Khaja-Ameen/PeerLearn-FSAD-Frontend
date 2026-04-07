import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import api from '../api';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setErrorMessage('');

    if (!token) {
      setErrorMessage('Invalid reset link.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword
      });
      setMessage('Password reset successful. Redirecting to login...');
      setTimeout(() => navigate('/'), 1200);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 400 || status === 404) {
        setErrorMessage(error?.response?.data?.message || 'Invalid or expired reset link.');
      } else {
        setErrorMessage('Unable to reset password now. Please try again.');
      }
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
            <h2>Reset Password</h2>
            <p>Set a new password for your account</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>New Password</label>
              <div className="input-field">
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group">
              <label>Confirm New Password</label>
              <div className="input-field">
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="submit-btn">
              Update Password
            </button>

            {message && (
              <p className="demo-text" style={{ color: '#16a34a' }}>{message}</p>
            )}

            {errorMessage && (
              <p className="demo-text" style={{ color: '#dc2626' }}>{errorMessage}</p>
            )}

            <p className="demo-text">
              <span
                role="button"
                tabIndex={0}
                onClick={() => navigate('/')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    navigate('/');
                  }
                }}
                style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Back to login
              </span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
