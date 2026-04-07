import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import api from '../api';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setErrorMessage('');

    try {
      await api.post('/auth/forgot-password', { email });
      setMessage('If the account exists, a password reset link has been sent.');
    } catch (error) {
      const status = error?.response?.status;
      if (status === 400) {
        setErrorMessage(error?.response?.data?.message || 'Please enter a valid email.');
      } else {
        setErrorMessage('Unable to process request now. Please try again.');
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
            <h2>Forgot Password</h2>
            <p>Enter your email to receive a password reset link</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email</label>
              <div className="input-field">
                <input
                  type="email"
                  placeholder="your@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="submit-btn">
              Send Reset Link
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

export default ForgotPassword;
