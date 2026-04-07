import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X, FileText, MonitorPlay, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import api from '../api';

const TeacherResources = () => {
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('All Resources');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  
  const [newResource, setNewResource] = useState({
    title: '',
    desc: '',
    type: 'Guides',
    format: '',
    link: '',
    file: null
  });

  const [resources, setResources] = useState([]);

  const styleByType = (type) => {
    if (type === 'Guides') return { bgStyle: '#fdf2f8', borderStyle: '#fbcfe8' };
    if (type === 'Templates') return { bgStyle: '#f0f9ff', borderStyle: '#bae6fd' };
    if (type === 'Tutorials') return { bgStyle: '#f5f3ff', borderStyle: '#ddd6fe' };
    return { bgStyle: '#f8fafc', borderStyle: '#e2e8f0' };
  };

  useEffect(() => {
    const loadResources = async () => {
      try {
        const query = filter === 'All Resources' ? '' : `?type=${encodeURIComponent(filter)}`;
        const { data } = await api.get(`/resources${query}`);
        const mapped = (data || []).map((item) => ({
          id: item.id,
          title: item.title,
          desc: item.description,
          type: item.type,
          format: item.format,
          downloads: item.downloadCount ?? 0,
          bgStyle: styleByType(item.type).bgStyle,
          borderStyle: styleByType(item.type).borderStyle,
          link: item.link
        }));
        setResources(mapped);
      } catch (error) {
        setResources([]);
      }
    };

    loadResources();
  }, [filter]);

  const showToast = (title, subtitle) => {
    setToast({ title, subtitle });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewResource({ title: '', desc: '', type: 'Guides', format: '', link: '', file: null });
  };

  const handleCreateResource = async (e) => {
    e.preventDefault();
    try {
      let format = newResource.format;
      
      // Auto-detect format if file is uploaded
      if (newResource.file) {
        const fileName = newResource.file.name;
        const ext = fileName.split('.').pop().toUpperCase();
        format = ext || 'FILE';
      }
      
      const payload = new FormData();
      payload.append('title', newResource.title);
      payload.append('description', newResource.desc);
      payload.append('type', newResource.type);
      payload.append('format', format);
      
      if (newResource.file) {
        payload.append('file', newResource.file);
      } else {
        payload.append('link', newResource.link);
      }
      
      const { data } = await api.post('/resources', payload, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const resourceToAdd = {
        id: data.id,
        title: data.title,
        desc: data.description,
        type: data.type,
        format: data.format,
        downloads: data.downloadCount ?? 0,
        bgStyle: styleByType(data.type).bgStyle,
        borderStyle: styleByType(data.type).borderStyle,
        link: data.link
      };
      setResources([resourceToAdd, ...resources]);
      handleCloseModal();
      showToast("Resource Added Successfully!", "Students can now access this material.");
    } catch (error) {
      showToast("Failed to Add Resource", "Please try again.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/resources/${id}`);
      setResources(resources.filter(r => r.id !== id));
    } catch (error) {
      showToast("Delete Failed", "Unable to delete resource.");
    }
  };

  const clearSelectedFile = () => {
    setNewResource({ ...newResource, file: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const normalizeResourceUrl = (rawUrl) => {
    if (!rawUrl) return '';
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    if (rawUrl.startsWith('/')) return `${window.location.origin}${rawUrl}`;
    return `https://${rawUrl}`;
  };

  const handleViewResource = (resource) => {
    const url = normalizeResourceUrl(resource?.link);
    if (!url) {
      showToast('No Resource Link', 'This resource does not have a file or URL.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredResources = resources;

  // Calculate stats
  const totalResources = resources.length;
  const totalDocs = resources.filter(r => ['PDF', 'DOC', 'DOCX', 'TXT', 'XLS', 'XLSX', 'PPT', 'PPTX'].includes(r.format?.toUpperCase())).length;
  const totalVideos = resources.filter(r => ['VIDEO', 'MP4', 'MOV', 'AVI', 'MKV', 'WMV'].includes(r.format?.toUpperCase())).length;
  const totalLinks = resources.filter(r => ['LINK', 'URL'].includes(r.format?.toUpperCase())).length;

  return (
    <div className="dashboard-container">
      
      {/* GLOBAL TOAST POPUP */}
      {toast && (
        <div className="toast-notification">
          <CheckCircle2 size={28} color="white" />
          <div className="toast-content">
            <span className="toast-title">{toast.title}</span>
            <span className="toast-subtitle">{toast.subtitle}</span>
          </div>
        </div>
      )}

      <div className="page-header-row">
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '700', color: '#0f172a' }}>Resources</h1>
          <p style={{ color: '#64748b' }}>Manage learning materials and guides for your classes</p>
        </div>
        <button className="btn-teal" onClick={handleOpenModal} style={{ background: '#10b981', padding: '0.75rem 1.5rem', borderRadius: '8px' }}>
          <Plus size={18} /> Add Resource
        </button>
      </div>

      {/* STATS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: '#0ea5e9', color: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(14, 165, 233, 0.2)' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>Total Resources</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{totalResources}</div>
        </div>
        <div style={{ background: '#d946ef', color: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(217, 70, 239, 0.2)' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>Documents</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{totalDocs}</div>
        </div>
        <div style={{ background: '#22c55e', color: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(34, 197, 94, 0.2)' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>Videos</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{totalVideos}</div>
        </div>
        <div style={{ background: '#f97316', color: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(249, 115, 22, 0.2)' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>External Links</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{totalLinks}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {['All Resources', 'Guides', 'Templates', 'Tutorials'].map(cat => (
          <button 
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              border: filter === cat ? '1px solid #94a3b8' : '1px solid transparent',
              background: filter === cat ? 'white' : 'transparent',
              color: filter === cat ? '#0f172a' : '#64748b',
              fontWeight: filter === cat ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* RESOURCE CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {filteredResources.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <h3 style={{ color: '#0f172a', marginBottom: '0.5rem' }}>No resources found</h3>
            <p style={{ color: '#64748b', margin: 0 }}>Upload your first resource to share with students.</p>
          </div>
        ) : filteredResources.map((item) => (
          <div
            key={item.id}
            onClick={() => handleViewResource(item)}
            style={{ background: item.bgStyle, border: `1px solid ${item.borderStyle}`, borderRadius: '12px', padding: '1.5rem', display: 'flex', gap: '1rem', position: 'relative', cursor: item.link ? 'pointer' : 'default' }}
          >
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item.id);
              }}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.25rem' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
            >
              <Trash2 size={18} />
            </button>

            <div style={{ background: 'white', padding: '0.75rem', borderRadius: '8px', height: 'fit-content', border: `1px solid ${item.borderStyle}` }}>
              {item.format === 'VIDEO' ? <MonitorPlay size={24} color="#8b5cf6" /> : 
               item.format === 'LINK' ? <LinkIcon size={24} color="#f97316" /> : 
               <FileText size={24} color="#0ea5e9" />}
            </div>

            <div>
              <h3 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.4rem', paddingRight: '2rem' }}>{item.title}</h3>
              <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '1rem' }}>{item.desc}</p>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>{item.type}</span>
                <span style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>{item.format}</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewResource(item);
                }}
                style={{
                  marginBottom: '0.75rem',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  color: '#1e293b',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                View Resource
              </button>
              
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.downloads} student downloads</div>
            </div>
          </div>
        ))}
      </div>

      {/* ADD RESOURCE MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={handleCloseModal}><X size={24} /></button>
            <h2 className="modal-title">Add New Resource</h2>
            <p className="modal-subtitle">Upload a file or link for your students</p>

            <form onSubmit={handleCreateResource}>
              <div className="input-group-modal">
                <label>Resource Title *</label>
                <input 
                  type="text" 
                  className="textarea-field" 
                  style={{ minHeight: '45px', padding: '0 0.75rem' }}
                  placeholder="e.g., Chapter 1 Study Guide"
                  value={newResource.title}
                  onChange={(e) => setNewResource({...newResource, title: e.target.value})}
                  required 
                />
              </div>

              <div className="input-group-modal">
                <label>Description *</label>
                <textarea 
                  className="textarea-field" 
                  placeholder="Briefly describe what this resource is..."
                  value={newResource.desc}
                  onChange={(e) => setNewResource({...newResource, desc: e.target.value})}
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group-modal">
                  <label>Category</label>
                  <select 
                    className="textarea-field" 
                    style={{ minHeight: '45px', padding: '0 0.75rem' }}
                    value={newResource.type}
                    onChange={(e) => setNewResource({...newResource, type: e.target.value})}
                  >
                    <option value="Guides">Guides</option>
                    <option value="Templates">Templates</option>
                    <option value="Tutorials">Tutorials</option>
                  </select>
                </div>
              </div>

              <div className="input-group-modal">
                <label>Upload File or Paste Link URL</label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <input 
                    type="file" 
                    id="file-upload"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setNewResource({...newResource, file: e.target.files[0], link: ''});
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('file-upload').click()}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: '#f1f5f9',
                      border: '1px dashed #cbd5e1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      color: '#475569',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e2e8f0';
                      e.currentTarget.style.borderColor = '#94a3b8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                  >
                    {newResource.file ? `📎 ${newResource.file.name}` : '📁 Click to Upload File'}
                  </button>
                  {newResource.file && (
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      aria-label="Remove selected file"
                      title="Remove selected file"
                      style={{
                        width: '42px',
                        minWidth: '42px',
                        height: '42px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        color: '#475569',
                        fontSize: '1.25rem',
                        lineHeight: 1,
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>or</p>
                <input 
                  type="url" 
                  className="textarea-field" 
                  style={{ minHeight: '45px', padding: '0 0.75rem' }}
                  placeholder="Paste URL (if not uploading a file)..."
                  value={newResource.file ? '' : newResource.link}
                  onChange={(e) => setNewResource({...newResource, link: e.target.value, file: null})}
                  disabled={!!newResource.file}
                  required={!newResource.file}
                />
              </div>

              <div className="modal-actions" style={{ borderTop: 'none', paddingTop: '1rem' }}>
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-teal" style={{ background: '#10b981', color: 'white' }}>
                  Add Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherResources;