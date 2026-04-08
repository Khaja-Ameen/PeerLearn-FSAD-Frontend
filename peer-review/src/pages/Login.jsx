import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Check, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import api from '../api';
import { isValidPasswordByPolicy, PASSWORD_POLICY_TEXT } from '../utils/passwordPolicy';

const Login = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState('Student');
  // New state to toggle between Login and Sign Up views
  const [isLoginView, setIsLoginView] = useState(true); 
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [teacherQualification, setTeacherQualification] = useState('Dr');
  const [section, setSection] = useState('A');
  const [teacherDepartment, setTeacherDepartment] = useState('Computer Science');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaExpected, setCaptchaExpected] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const generateCaptcha = () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let captcha = '';
    for (let i = 0; i < 5; i += 1) {
      captcha += characters[Math.floor(Math.random() * characters.length)];
    }
    setCaptchaQuestion(captcha);
    setCaptchaExpected(captcha);
    setCaptchaInput('');
  };

  const getTeacherQualificationMap = () => {
    try {
      return JSON.parse(localStorage.getItem('peerlearn_teacher_qualification_map') || '{}');
    } catch (error) {
      return {};
    }
  };

  const setTeacherQualificationMap = (map) => {
    localStorage.setItem('peerlearn_teacher_qualification_map', JSON.stringify(map));
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

  useEffect(() => {
    if (isLoginView) {
      generateCaptcha();
    }
  }, [isLoginView]);

  const handleToggleView = (nextLoginView) => {
    setIsLoginView(nextLoginView);
    setErrorMessage('');
    setSuccessMessage('');
    setCaptchaInput('');
    if (nextLoginView) {
      generateCaptcha();
    }
  };

  const loginWithRoleValidation = (data) => {
    const selectedRole = role.toUpperCase();

    if (String(data?.role || '').toUpperCase() !== selectedRole) {
      setErrorMessage(`This account is registered as ${data?.role || 'another role'}. Please select the correct role and try again.`);
      generateCaptcha();
      return;
    }

    const teacherQualificationMap = getTeacherQualificationMap();
    const mappedQualification = teacherQualificationMap[email.trim().toLowerCase()];
    const normalizedUser = { ...data };

    if (String(data.role || '').toUpperCase() === 'TEACHER') {
      const qualification = data.qualification || mappedQualification || '';
      if (qualification) {
        normalizedUser.qualification = qualification;
        normalizedUser.fullName = formatTeacherName(data.fullName, qualification);
      }
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(normalizedUser));

    if (data.role === 'STUDENT') navigate('/student');
    else navigate('/teacher');
  };

  const normalizeAuthErrorMessage = (backendMessage, fallbackMessage) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isLoginView && captchaInput.trim() !== captchaExpected) {
        setErrorMessage('Captcha verification failed. Please try again.');
        generateCaptcha();
        return;
      }

      if (!isLoginView) {
        if (password !== confirmPassword) {
          setErrorMessage('Enter valid credentials.');
          return;
        }

        if (!isValidPasswordByPolicy(password)) {
          setErrorMessage(PASSWORD_POLICY_TEXT);
          return;
        }

        if (role === 'Student' && !studentId.trim()) {
          setErrorMessage('Enter valid credentials.');
          return;
        }

        if (role === 'Student' && !/^\d{10}$/.test(studentId.trim())) {
          setErrorMessage('Student ID must be exactly 10 digits.');
          return;
        }

        if (role === 'Teacher' && !facultyId.trim()) {
          setErrorMessage('Enter valid credentials.');
          return;
        }

        if (role === 'Teacher' && !/^\d{4}$/.test(facultyId.trim())) {
          setErrorMessage('Faculty ID must be exactly 4 digits.');
          return;
        }

        const finalFullName = role === 'Teacher'
          ? formatTeacherName(fullName, teacherQualification)
          : fullName;

        await api.post('/auth/register', {
          fullName: finalFullName,
          email,
          password,
          role: role.toUpperCase(),
          section: role === 'Student' ? section : 'ALL',
          department: role === 'Teacher' ? teacherDepartment : 'General',
          userId: role === 'Student' ? studentId.trim() : role === 'Teacher' ? facultyId.trim() : undefined,
          studentId: role === 'Student' ? studentId.trim() : undefined,
          facultyId: role === 'Teacher' ? facultyId.trim() : undefined
        });

        if (role === 'Teacher') {
          const map = getTeacherQualificationMap();
          map[email.trim().toLowerCase()] = teacherQualification;
          setTeacherQualificationMap(map);
        }

        setSuccessMessage('Signup successful. Please login with your new account.');
        setIsLoginView(true);
        generateCaptcha();
        setPassword('');
        setConfirmPassword('');
        setStudentId('');
        setFacultyId('');
        setTeacherQualification('Dr');
        setSection('A');
        setTeacherDepartment('Computer Science');
        return;
      }

      try {
        await api.post('/auth/login-otp', { email, password });
        sessionStorage.setItem('peerlearn_pending_otp', JSON.stringify({
          email: email.trim(),
          password
        }));
        navigate('/verify-otp', {
          state: {
            email: email.trim(),
            role: role.toUpperCase()
          }
        });
        return;
      } catch (otpRequestError) {
        const otpStatus = otpRequestError?.response?.status;
        if (otpStatus === 404 || otpStatus === 405) {
          const { data } = await api.post('/auth/login', { email, password });
          loginWithRoleValidation(data);
          return;
        }
        throw otpRequestError;
      }
    } catch (error) {
      const status = error?.response?.status;
      const backendMessage = String(error?.response?.data?.message || '').trim();
      if (isLoginView && (status === 401 || status === 403 || status === 400 || status === 404 || status === 422)) {
        setErrorMessage(normalizeAuthErrorMessage(backendMessage, 'Wrong email or password. Please try again.'));
      } else if (status === 401 || status === 403 || status === 400) {
        // Check if it's a duplicate ID error during sign-up
        if (!isLoginView && (backendMessage.includes('Student ID') || backendMessage.includes('Faculty ID'))) {
          setErrorMessage(backendMessage);
        } else {
          setErrorMessage(normalizeAuthErrorMessage(backendMessage, 'Wrong email or password. Please try again.'));
        }
      } else if (status === 409) {
        setErrorMessage('This email is already registered. Please use a different email or log in.');
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }

      if (isLoginView) {
        generateCaptcha();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        {/* Left Side - Gradient Panel */}
        <div className="login-left">
          <div className="icon-box">
            <BookOpen size={28} color="white" />
          </div>
          <h1>PeerLearn Platform</h1>
          <p>Collaborative learning through peer review and feedback</p>
          
          <ul className="features">
            <li>
              <div className="check-icon"><Check size={16} /></div>
              Submit assignments with file uploads
            </li>
            <li>
              <div className="check-icon"><Check size={16} /></div>
              Review peers and get feedback
            </li>
            <li>
              <div className="check-icon"><Check size={16} /></div>
              Track progress and deadlines
            </li>
          </ul>
        </div>

        {/* Right Side - Form Panel */}
        <div className="login-right">
          
          <div className="auth-tabs">
            <button 
              type="button"
              className={`auth-tab ${isLoginView ? 'active' : ''}`} 
              onClick={() => handleToggleView(true)}
            >
              <LogIn size={16} /> Login
            </button>
            <button 
              type="button"
              className={`auth-tab ${!isLoginView ? 'active' : ''}`} 
              onClick={() => handleToggleView(false)}
            >
              <UserPlus size={16} /> Sign Up
            </button>
          </div>

          <div className="welcome-text">
            <h2>{isLoginView ? 'Welcome Back' : 'Create Account'}</h2>
            <p>{isLoginView ? 'Sign in to your account' : 'Join PeerLearn today'}</p>
          </div>

          <div className="role-toggle">
            <button 
              type="button" 
              className={role === 'Student' ? 'active' : ''} 
              onClick={() => setRole('Student')}
            >
              Student
            </button>
            <button 
              type="button" 
              className={role === 'Teacher' ? 'active' : ''} 
              onClick={() => setRole('Teacher')}
            >
              Teacher
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Show Full Name only on Sign Up */}
            {!isLoginView && (
              <div className="input-group">
                <label>Full Name</label>
                <div className="input-field">
                  <input type="text" placeholder="John Doe" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              </div>
            )}
{!isLoginView && role === 'Student' && (
              <div className="input-group">
                <label>Student ID Number (10 digits)</label>
                <div className="input-field">
                  <input
                    type="text"
                    placeholder="1234567890"
                    required
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
                    maxLength="10"
                  />
                </div>
              </div>
            )}

            {!isLoginView && role === 'Teacher' && (
              <div className="input-group">
                <label>Faculty ID Number (4 digits)</label>
                <div className="input-field">
                  <input
                    type="text"
                    placeholder="1234"
                    required
                    value={facultyId}
                    onChange={(e) => setFacultyId(e.target.value.replace(/\D/g, ''))}
                    maxLength="4"
                  />
                </div>
              </div>
            )}

            {!isLoginView && role === 'Teacher' && (
              <div className="input-group">
                <label>Title</label>
                <div className="input-field">
                  <select
                    value={teacherQualification}
                    onChange={(e) => setTeacherQualification(e.target.value)}
                    required
                    style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', background: '#f9fafb', outline: 'none' }}
                  >
                    <option value="Dr">Dr</option>
                    <option value="Mr">Mr</option>
                    <option value="Mrs">Mrs</option>
                    <option value="Ms">Ms</option>
                    <option value="Prof">Prof</option>
                  </select>
                </div>
              </div>
            )}

            {!isLoginView && role === 'Teacher' && (
              <div className="input-group">
                <label>Department</label>
                <div className="input-field">
                  <select
                    value={teacherDepartment}
                    onChange={(e) => setTeacherDepartment(e.target.value)}
                    required
                    style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', background: '#f9fafb', outline: 'none' }}
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="Civil">Civil</option>
                    <option value="Business Administration">Business Administration</option>
                  </select>
                </div>
              </div>
            )}

            {!isLoginView && role === 'Student' && (
              <div className="input-group">
                <label>Section</label>
                <div className="input-field">
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    required
                    style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', background: '#f9fafb', outline: 'none' }}
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>
              </div>
            )}

            
            <div className="input-group">
              <label>Email</label>
              <div className="input-field">
                <input type="email" placeholder="your@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            
            <div className="input-group">
              <label>Password</label>
              <div className="input-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {showPassword ? (
                  <EyeOff size={18} className="eye-btn" onClick={() => setShowPassword(false)} />
                ) : (
                  <Eye size={18} className="eye-btn" onClick={() => setShowPassword(true)} />
                )}
              </div>
            </div>

            {!isLoginView && (
              <p className="demo-text" style={{ textAlign: 'left', marginTop: '-6px', marginBottom: '12px' }}>
                {PASSWORD_POLICY_TEXT}
              </p>
            )}

            {isLoginView && (
              <div className="input-group">
                <label>Captcha *</label>
                <div className="input-field" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      fontWeight: 800,
                      color: '#ef4444',
                      letterSpacing: '0.22em',
                      transform: 'rotate(-2deg)',
                      fontSize: '1.1rem',
                      userSelect: 'none'
                    }}
                  >
                    {captchaQuestion}
                  </span>
                  <input
                    type="text"
                    placeholder="Answer"
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    style={{ maxWidth: '120px' }}
                  />
                </div>
              </div>
            )}

            {/* Show Confirm Password only on Sign Up */}
            {!isLoginView && (
              <div className="input-group">
                <label>Confirm Password</label>
                <div className="input-field">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  {showConfirmPassword ? (
                    <EyeOff size={18} className="eye-btn" onClick={() => setShowConfirmPassword(false)} />
                  ) : (
                    <Eye size={18} className="eye-btn" onClick={() => setShowConfirmPassword(true)} />
                  )}
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting}
              className={`submit-btn ${!isLoginView ? 'signup-gradient' : ''}`}
              style={isSubmitting ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
            >
              {isSubmitting ? 'Please wait...' : (isLoginView ? 'Sign In' : 'Create Account')}
            </button>

            {isLoginView && (
              <p className="demo-text" style={{ marginTop: '10px' }}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/forgot-password')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate('/forgot-password');
                    }
                  }}
                  style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Forgot password?
                </span>
              </p>
            )}

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

export default Login;