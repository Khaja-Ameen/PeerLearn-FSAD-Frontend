import React, { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';
import api from '../api';

const TeacherCalendar = () => {
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [allDeadlines, setAllDeadlines] = useState([]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Get EXACTLY today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    setSelectedDay(null);
  };

  useEffect(() => {
    const loadDeadlines = async () => {
      try {
        const { data } = await api.get('/assignments/teacher');
        const mapped = (data || []).map((a) => {
          const date = new Date(a.dueDate);
          return {
            id: a.id,
            day: date.getDate(),
            month: date.getMonth(),
            year: date.getFullYear(),
            title: a.title,
            target: `Section ${a.section || '-'}`,
            time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            color: a.group ? '#3b82f6' : '#f97316'
          };
        });
        setAllDeadlines(mapped);
      } catch (error) {
        setAllDeadlines([]);
      }
    };

    loadDeadlines();

    const handleFocus = () => loadDeadlines();
    const handleStorage = (event) => {
      if (event.key === 'peerlearn_assignment_update') {
        loadDeadlines();
      }
    };
    const handleAssignmentUpdate = () => loadDeadlines();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('peerlearn-assignment-update', handleAssignmentUpdate);
    const interval = setInterval(loadDeadlines, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('peerlearn-assignment-update', handleAssignmentUpdate);
      clearInterval(interval);
    };
  }, []);

  // Exclude past events
  const currentMonthDeadlines = allDeadlines.filter(d => {
    if (d.month !== currentMonth || d.year !== currentYear) return false;
    
    const deadlineDate = new Date(d.year, d.month, d.day);
    return deadlineDate >= today;
  });

  const selectedDeadlines = selectedDay ? currentMonthDeadlines.filter(d => d.day === selectedDay) : [];

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Calendar</h1>
        <p>Track your upcoming class deadlines and administrative tasks</p>
      </div>

      <div className="calendar-wrapper">
        {/* LEFT SIDE: CALENDAR GRID */}
        <div className="calendar-card">
          <div className="calendar-top">
            <div className="calendar-title">
              <CalendarIcon size={20} />
              <span>{monthNames[currentMonth]} {currentYear}</span>
            </div>
            <div className="calendar-nav">
              <button className="cal-btn" onClick={handlePrevMonth}><ChevronLeft size={18} /></button>
              <button className="cal-btn" onClick={handleNextMonth}><ChevronRight size={18} /></button>
            </div>
          </div>
          
          <div className="calendar-body">
            <div className="calendar-days-header">
              {daysOfWeek.map(day => (
                <div key={day}>{day}</div>
              ))}
            </div>
            
            <div className="calendar-grid-cells">
              {blanks.map(blank => (
                <div key={`blank-${blank}`} className="cal-cell" style={{ border: 'none', background: 'transparent', cursor: 'default' }}></div>
              ))}

              {days.map(day => {
                const dayDeadlines = currentMonthDeadlines.filter(d => d.day === day);
                const isSelected = day === selectedDay;

                return (
                  <div 
                    key={day} 
                    className={`cal-cell ${isSelected ? 'today' : ''}`}
                    onClick={() => setSelectedDay(day)}
                    style={{ 
                      cursor: 'pointer', 
                      position: 'relative',
                      backgroundColor: isSelected ? '#f0fdfa' : dayDeadlines.length > 0 ? '#f8fafc' : 'transparent',
                      borderColor: isSelected ? '#2dd4bf' : '#e2e8f0',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontWeight: isSelected || dayDeadlines.length > 0 ? '600' : '400' }}>
                      {day}
                    </span>
                    
                    {dayDeadlines.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: 'auto', justifyContent: 'center', paddingBottom: '4px' }}>
                        {dayDeadlines.map((dl, i) => (
                          <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dl.color }} title={dl.title}></div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: UPCOMING DEADLINES SIDEBAR */}
        <div className="sidebar-card">
          <div className="sidebar-header">
            <h3>Administrative Schedule</h3>
            <p>{selectedDay ? `Your timeline for ${monthNames[currentMonth]} ${selectedDay}, ${currentYear}` : 'Select a date to view schedule'}</p>
          </div>
          
          <div className="sidebar-content" style={{ padding: selectedDeadlines.length > 0 ? '1.5rem' : '2rem', display: 'flex', flexDirection: 'column', justifyContent: selectedDeadlines.length > 0 ? 'flex-start' : 'center' }}>
            
            {!selectedDay || selectedDeadlines.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <CalendarIcon size={56} strokeWidth={1.5} style={{ margin: '0 auto' }} />
                <p style={{ marginTop: '1rem', fontSize: '1.05rem' }}>
                  {!selectedDay ? "Select a date on the calendar" : "No upcoming deadlines"}
                </p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.8 }}>
                  {!selectedDay ? "to see details." : "No tasks scheduled for today."}
                </p>
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedDeadlines.map((item) => (
                  <div key={item.id} style={{ 
                    background: 'white', 
                    border: '1px solid #e2e8f0', 
                    borderLeft: `4px solid ${item.color}`, 
                    borderRadius: '8px', 
                    padding: '1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    textAlign: 'left'
                  }}>
                    <h4 style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
                      {item.title}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem' }}>
                        <Users size={14} style={{ color: item.color }}/> {item.target}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.85rem' }}>
                        <Clock size={14} style={{ color: item.color }}/> Deadline: {item.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeacherCalendar;