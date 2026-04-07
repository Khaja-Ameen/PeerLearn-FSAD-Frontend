import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';

const getExtension = (nameOrUrl = '') => {
  const clean = String(nameOrUrl || '').split('?')[0];
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
};

const isImageExt = (ext) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
const isVideoExt = (ext) => ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
const isAudioExt = (ext) => ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
const isInlineDocExt = (ext) => ['txt', 'csv', 'md', 'json', 'xml', 'html', 'htm', 'log', 'yml', 'yaml'].includes(ext);
const isPdfExt = (ext) => ext === 'pdf';
const isOfficeExt = (ext) => ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(ext);

const toUploadsRoute = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;

  const slashNormalized = raw.replace(/\\/g, '/');

  if (/^file:\/\//i.test(slashNormalized)) {
    const withoutScheme = slashNormalized.replace(/^file:\/\/+?/i, '');
    const filename = withoutScheme.split('/').pop();
    return filename ? `/uploads/${filename}` : '';
  }

  if (/^[a-zA-Z]:\//.test(slashNormalized)) {
    const filename = slashNormalized.split('/').pop();
    return filename ? `/uploads/${filename}` : '';
  }

  const possibleName = slashNormalized.split('/').pop();
  return possibleName ? `/uploads/${possibleName}` : '';
};

const AttachmentPreview = ({ attachment, accentColor = '#0ea5e9' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState('');
  const [contentType, setContentType] = useState('');
  const [textPreview, setTextPreview] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const normalized = useMemo(() => {
    const url = attachment?.url || '';
    const name = attachment?.name || (url ? url.split('/').pop() : 'Attachment');
    const ext = getExtension(name || url);
    const isImage = Boolean(attachment?.isImage || isImageExt(ext));
    const isVideo = isVideoExt(ext);
    const isAudio = isAudioExt(ext);
    const isPdf = isPdfExt(ext);
    const isOffice = isOfficeExt(ext);
    const canInlineDoc = isInlineDocExt(ext);
    return { url, name, ext, isImage, isVideo, isAudio, isPdf, isOffice, canInlineDoc };
  }, [attachment]);

  const resolvedUrl = useMemo(() => {
    if (!normalized.url) return '';
    if (/^https?:\/\//i.test(normalized.url)) return normalized.url;

    const uploadsRoute = toUploadsRoute(normalized.url);
    if (uploadsRoute) {
      try {
        const apiBase = String(api.defaults.baseURL || 'http://localhost:8080/api');
        const origin = new URL(apiBase).origin;
        return `${origin}${uploadsRoute}`;
      } catch (error) {
        return uploadsRoute;
      }
    }

    try {
      const apiBase = String(api.defaults.baseURL || 'http://localhost:8080/api');
      const origin = new URL(apiBase).origin;
      return `${origin}${normalized.url.startsWith('/') ? normalized.url : `/${normalized.url}`}`;
    } catch (error) {
      return normalized.url;
    }
  }, [normalized.url]);

  useEffect(() => {
    if (!isOpen || !normalized.url) return undefined;

    let isCancelled = false;
    let localBlobUrl = '';

    const loadPreview = async () => {
      try {
        setIsLoading(true);
        setPreviewError('');
        setTextPreview('');

        const response = await api.get(resolvedUrl, {
          responseType: 'blob'
        });

        if (isCancelled) return;

        const blob = response.data;
        const type = String(blob?.type || '').toLowerCase();
        setContentType(type);

        localBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(localBlobUrl);

        const looksTextMime =
          type.startsWith('text/') ||
          type === 'application/json' ||
          type === 'application/xml' ||
          type.endsWith('+json') ||
          type.endsWith('+xml');

        const looksText = normalized.canInlineDoc || looksTextMime;
        if (looksText) {
          const txt = await blob.text();
          if (!isCancelled) setTextPreview(txt.slice(0, 20000));
        }
      } catch (error) {
        if (!isCancelled) {
          setPreviewError('Unable to load file with login access.');
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadPreview();

    return () => {
      isCancelled = true;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
      setBlobUrl('');
      setContentType('');
      setTextPreview('');
    };
  }, [isOpen, resolvedUrl, normalized.canInlineDoc]);

  if (!normalized.url) return null;

  const handleOpenNewTab = () => {
    const target = blobUrl || resolvedUrl;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = normalized.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    window.open(normalized.url, '_blank', 'noopener,noreferrer');
  };

  const renderFallbackBox = (message) => (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', color: '#475569' }}>
      {message}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleOpenNewTab} style={{ border: 'none', background: 'transparent', color: accentColor, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          Open in new tab
        </button>
        <button type="button" onClick={handleDownload} style={{ border: 'none', background: 'transparent', color: accentColor, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          Download
        </button>
      </div>
    </div>
  );

  if (!resolvedUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          width: '100%',
          textAlign: 'left',
          border: '1px solid #e2e8f0',
          background: '#fff',
          borderRadius: '8px',
          padding: '0.8rem',
          cursor: 'pointer'
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.6rem' }}>
          Uploaded Work: {normalized.name}
        </div>
        <div style={{ color: accentColor, fontWeight: 600, fontSize: '0.9rem' }}>
          Click to preview file
        </div>
      </button>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.72)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              width: 'min(1100px, 96vw)',
              maxHeight: '92vh',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {normalized.name}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button type="button" onClick={handleOpenNewTab} style={{ border: 'none', background: 'transparent', color: accentColor, fontWeight: 600, cursor: 'pointer' }}>
                  Open in new tab
                </button>
                <button type="button" onClick={handleDownload} style={{ border: 'none', background: 'transparent', color: accentColor, fontWeight: 600, cursor: 'pointer' }}>
                  Download
                </button>
                <button type="button" onClick={() => setIsOpen(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', padding: '0.35rem 0.65rem', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: '1rem', overflow: 'auto' }}>
              {isLoading && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', color: '#475569' }}>
                  Loading preview...
                </div>
              )}

              {!isLoading && previewError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', color: '#991b1b' }}>
                  {previewError}
                </div>
              )}

              {!isLoading && !previewError && (normalized.isImage || contentType.startsWith('image/')) && blobUrl && !imageFailed && (
                <img
                  src={blobUrl}
                  alt={normalized.name}
                  onError={() => setImageFailed(true)}
                  style={{ width: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
              )}

              {!isLoading && !previewError && (normalized.isImage || contentType.startsWith('image/')) && imageFailed && renderFallbackBox('Image could not load in-app, but it can still be opened or downloaded.')}

              {!isLoading && !previewError && (normalized.isVideo || contentType.startsWith('video/')) && blobUrl && !mediaFailed && (
                <video controls style={{ width: '100%', maxHeight: '78vh', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <source src={blobUrl} onError={() => setMediaFailed(true)} />
                </video>
              )}

              {!isLoading && !previewError && (normalized.isVideo || contentType.startsWith('video/')) && mediaFailed && renderFallbackBox('Video could not load in-app, but it can still be opened or downloaded.')}

              {!isLoading && !previewError && (normalized.isAudio || contentType.startsWith('audio/')) && blobUrl && !mediaFailed && (
                <audio controls style={{ width: '100%' }}>
                  <source src={blobUrl} onError={() => setMediaFailed(true)} />
                </audio>
              )}

              {!isLoading && !previewError && (normalized.isAudio || contentType.startsWith('audio/')) && mediaFailed && renderFallbackBox('Audio could not load in-app, but it can still be opened or downloaded.')}

              {!isLoading && !previewError && (normalized.isPdf || contentType === 'application/pdf') && blobUrl && (
                <object
                  data={blobUrl}
                  type="application/pdf"
                  style={{ width: '100%', height: '72vh', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                >
                  {renderFallbackBox('PDF preview is unavailable in this browser. Use Open in new tab or Download.')}
                </object>
              )}

              {!isLoading && !previewError && textPreview && !(normalized.isImage || normalized.isVideo || normalized.isAudio || normalized.isPdf) && (
                <pre style={{ whiteSpace: 'pre-wrap', background: '#0f172a', color: '#e2e8f0', borderRadius: '8px', padding: '1rem', maxHeight: '72vh', overflow: 'auto' }}>
                  {textPreview}
                </pre>
              )}

              {!isLoading && !previewError && normalized.isOffice && (
                renderFallbackBox('Office files (PPT, DOC, XLS) are not previewed in-app. Use Open in new tab or Download.')
              )}

              {!isLoading && !previewError && !normalized.isOffice && !textPreview && !blobUrl && (
                renderFallbackBox('Preview is unavailable for this file type.')
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AttachmentPreview;